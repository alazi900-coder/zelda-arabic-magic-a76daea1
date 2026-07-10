import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FolderOpen, Loader2, AlertTriangle, Download, ImageDown,
  Replace, Undo2, Search, ChevronDown, ChevronUp, ImageOff, Crop, X,
  ZoomIn, ZoomOut, Maximize, Eraser, Target,
} from "lucide-react";
import {
  parseImagesPakHeader, parseImagesPakFileInfoTree, flattenPakTree,
  type RisenPakHeader, type RisenPakFlatFile,
} from "@/lib/risen-images-pak";
import {
  extractDdsFromXimg, spliceReplacementDds, validateReplacementDds, buildDdsFile, decodeDdsToRgba,
  encodeRawRgbDds, buildRawRgbDdsFile, readDdsHeader, describeDdsHeaderFlags, findFirstByteMismatch,
  wrapRawDdsAsXimg,
} from "@/lib/risen-ximg";
import { encodeDxt, isDxtFourCC } from "@/lib/risen-dxt-codec";
import { classifyImagePath, buildImageSections, type ImageSectionCount } from "@/lib/risen/image-categories";
import {
  compositeIntoRegion, detectRegionBounds, scaleRgbaContainFit, scaleRgbaStretch, cropRegion,
  simulateNaiveBilinearPreview, findSuspiciousTransparentPixels, type CompositeRect,
} from "@/lib/risen-image-composite";
import { decodePngRawNoCanvas } from "@/lib/png-decode";
import { encodePngRawNoCanvas } from "@/lib/png-encode";

const ACCENT = "#4a7c3f";

/** Result of decoding one .ximg entry for preview: a rendered image, a
 * recognized-but-unsupported pixel format (with diagnostic fields instead of
 * a silent blank card), or a hard read/parse error (e.g. a stale file handle). */
type ThumbResult =
  | { kind: "ok"; dataUrl: string; width: number; height: number; fourCC: string; rgbBitCount: number; aMask: number; hasAnyAlpha: boolean }
  | { kind: "unsupported"; fourCC: string; ddspfFlags: number; rgbBitCount: number }
  | { kind: "error"; message: string };

interface ModifiedRecord {
  /** The full original .ximg bytes, kept in memory for one-level undo. */
  originalXimgBytes: Uint8Array;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} كيلوبايت`;
  return `${(n / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function downloadBlob(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(text: string, filename: string): void {
  downloadBlob(new TextEncoder().encode(text), filename);
}

function buildPowerShellPatchScript(offset: number, length: number, downloadedFileName: string): string {
  return `# سكربت حقن يدوي لملف images.pak — شغّله بعد تنزيل الملف المعدّل
# عدّل $pakPath أدناه إلى المسار الفعلي لملف images.pak على جهازك

$pakPath = "C:\\Path\\To\\images.pak"
$patchPath = "$([Environment]::GetFolderPath('Downloads'))\\${downloadedFileName}"
$expectedOffset = ${offset}
$expectedLength = ${length}

if (-not (Test-Path $pakPath)) {
    Write-Error "لم يتم العثور على $pakPath — عدّل المسار في أعلى السكربت"
    exit 1
}
if (-not (Test-Path $patchPath)) {
    Write-Error "لم يتم العثور على الملف المنزّل: $patchPath"
    exit 1
}

$patchBytes = [System.IO.File]::ReadAllBytes($patchPath)
if ($patchBytes.Length -ne $expectedLength) {
    Write-Error "حجم الملف المعدّل ($($patchBytes.Length) بايت) لا يطابق الحجم المتوقع ($expectedLength بايت) — توقف بلا كتابة"
    exit 1
}

$stream = [System.IO.File]::Open($pakPath, 'Open', 'Write')
try {
    $stream.Seek($expectedOffset, 'Begin') | Out-Null
    $stream.Write($patchBytes, 0, $patchBytes.Length)
    Write-Host "تم الحقن بنجاح عند الإزاحة $expectedOffset"
} finally {
    $stream.Close()
}
`;
}

/** Never throws — read/parse failures become a `{kind:"error"}` result so the
 * UI can show a message instead of an uncaught rejection or a blank card. */
async function decodeXimgEntry(bytes: Uint8Array): Promise<ThumbResult> {
  try {
    const { ddsBytes } = extractDdsFromXimg(bytes);
    const decoded = decodeDdsToRgba(ddsBytes);
    if (!decoded.supported) {
      return { kind: "unsupported", fourCC: decoded.fourCC, ddspfFlags: decoded.ddspfFlags, rgbBitCount: decoded.rgbBitCount };
    }
    const canvas = document.createElement("canvas");
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذّر إنشاء سياق الرسم لفك الصورة");
    const imageData = new ImageData(new Uint8ClampedArray(decoded.rgba), decoded.width, decoded.height);
    ctx.putImageData(imageData, 0, 0);
    let hasAnyAlpha = false;
    for (let i = 3; i < decoded.rgba.length; i += 4) {
      if (decoded.rgba[i] !== 255) { hasAnyAlpha = true; break; }
    }
    return {
      kind: "ok",
      dataUrl: canvas.toDataURL("image/png"),
      width: decoded.width,
      height: decoded.height,
      fourCC: decoded.fourCC,
      rgbBitCount: decoded.rgbBitCount ?? 0,
      aMask: decoded.aMask ?? 0,
      hasAnyAlpha,
    };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("تعذّرت قراءة ملف الصورة"));
    img.src = src;
  });
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return loadImageFromSrc(url).finally(() => URL.revokeObjectURL(url));
}

/** Draws `img` scaled to exactly w×h on a throwaway canvas and reads back its RGBA. */
/** Scales `img` to fit inside a w×h canvas WITHOUT distorting its aspect
 * ratio — centered, with transparent padding on whichever axis is shorter.
 * That padding is what makes the composite correctly erase everything in
 * the selection rect that the (correctly-proportioned) overlay doesn't
 * cover, instead of stretching the overlay to fill the rect exactly. */
function getScaledImageRgba(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const naturalW = img.naturalWidth || w;
  const naturalH = img.naturalHeight || h;
  const scale = Math.min(w / naturalW, h / naturalH);
  const drawW = naturalW * scale;
  const drawH = naturalH * scale;
  ctx.drawImage(img, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
  return ctx.getImageData(0, 0, w, h).data;
}

// ============================================================================
// Lazy thumbnail cell — decodes only once its actually scrolled into view.
// ============================================================================

function diagnosticText(result: Exclude<ThumbResult, { kind: "ok" }>): string {
  if (result.kind === "unsupported") {
    return `صيغة غير مدعومة — fourCC: ${result.fourCC || "بدون fourCC"} — dwFlags: ${result.ddspfFlags} — dwRGBBitCount: ${result.rgbBitCount}`;
  }
  return result.message;
}

function LazyThumb({
  entry, file, selected, onSelect, onDecoded,
}: {
  entry: RisenPakFlatFile;
  file: File;
  selected: boolean;
  onSelect: () => void;
  onDecoded: (path: string, result: ThumbResult) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [result, setResult] = useState<ThumbResult | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisible(true); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onDecodedRef = useRef(onDecoded);
  onDecodedRef.current = onDecoded;

  useEffect(() => {
    if (!visible || result) return;
    let cancelled = false;
    (async () => {
      let r: ThumbResult;
      try {
        const buf = await file.slice(entry.offset, entry.offset + entry.size).arrayBuffer();
        r = await decodeXimgEntry(new Uint8Array(buf));
      } catch (e) {
        r = { kind: "error", message: e instanceof Error ? e.message : String(e) };
      }
      if (cancelled) return;
      setResult(r);
      onDecodedRef.current(entry.path, r);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, entry.path]);

  const name = entry.path.slice(entry.path.lastIndexOf("/") + 1);
  const title = result && result.kind !== "ok" ? `${entry.path}\n${diagnosticText(result)}` : entry.path;

  return (
    <button
      ref={ref}
      onClick={onSelect}
      className={`flex flex-col gap-1 p-2 rounded border text-right transition-colors ${
        selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
      }`}
      title={title}
    >
      <div className="w-full aspect-square rounded bg-muted/40 flex items-center justify-center overflow-hidden">
        {result?.kind === "ok" ? (
          <img src={result.dataUrl} alt={name} className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />
        ) : result ? (
          <ImageOff className="w-5 h-5 text-muted-foreground" />
        ) : visible ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <span className="text-[10px] text-muted-foreground truncate font-mono">{name}</span>
    </button>
  );
}

// ============================================================================

export default function RisenImages() {
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [header, setHeader] = useState<RisenPakHeader | null>(null);
  const [flatFiles, setFlatFiles] = useState<RisenPakFlatFile[]>([]);
  /** True when a single loose .dds file was opened directly (no images.pak).
   * `file` still holds a synthetic-wrapped copy (see wrapRawDdsAsXimg) so every
   * existing entry-based tool works unchanged; only opening/saving differ. */
  const [standaloneDdsMode, setStandaloneDdsMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [treeSizeWarning, setTreeSizeWarning] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedDecoded, setSelectedDecoded] = useState<ThumbResult | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [decodedCache, setDecodedCache] = useState<Map<string, ThumbResult>>(new Map());
  // "In-game-like" approximation preview toggles (see risen-image-composite.ts docblocks) —
  // deliberately targets the exact corruption class confirmed this session, not a
  // real emulation of Risen's renderer.
  const [previewNaiveFilter, setPreviewNaiveFilter] = useState(false);
  const [previewSuspicious, setPreviewSuspicious] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [modifiedLog, setModifiedLog] = useState<Map<string, ModifiedRecord>>(new Map());
  const firstWriteConfirmedRef = useRef(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const standaloneDdsInputRef = useRef<HTMLInputElement>(null);

  // Region-composite mode: drag-select a rectangle on the current image, then
  // paste a replacement image (e.g. a translated logo) into just that region.
  const [compositeMode, setCompositeMode] = useState(false);
  const [selectionRect, setSelectionRect] = useState<CompositeRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [compositeOverlayFile, setCompositeOverlayFile] = useState<File | null>(null);
  const [compositeOverlayImg, setCompositeOverlayImg] = useState<HTMLImageElement | null>(null);
  // "Erase" step: covers selectionRect (e.g. the old English name) with a
  // scaled copy of a clean patch dragged from ANY size/position elsewhere in
  // the same image, *before* pasting the new overlay — safer than clearing to
  // a flat color or full transparency, since it's unknown what the game
  // would composite underneath a fully transparent region. The source rect
  // does NOT need to match selectionRect's size — it's scaled to fit.
  const [pickingEraseSource, setPickingEraseSource] = useState(false);
  const [eraseSourceRect, setEraseSourceRect] = useState<CompositeRect | null>(null);
  // Lets an already-defined selectionRect be dragged to a new position (from
  // a mousedown *inside* its bounds) instead of always starting a fresh
  // selection — so the same spot can be reused for pasting the new overlay
  // after erasing without having to re-detect/re-drag it from scratch.
  const [movingSelectionOffset, setMovingSelectionOffset] = useState<{ dx: number; dy: number } | null>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeOverlayInputRef = useRef<HTMLInputElement>(null);
  /** 1 = actual pixel size. The canvas's internal drawing buffer always stays
   * at the image's native resolution — only its CSS display size scales with
   * this, so getImagePixelCoords' getBoundingClientRect-based math keeps
   * working unchanged at any zoom level. */
  const [compositeZoom, setCompositeZoom] = useState(1);
  const compositeScrollRef = useRef<HTMLDivElement>(null);

  const fsaSupported = typeof window !== "undefined" && "showOpenFilePicker" in window;

  const loadPakFromFile = useCallback(async (f: File) => {
    setLoading(true);
    setLoadError(null);
    setTreeSizeWarning(null);
    try {
      const headBuf = await f.slice(0, 48).arrayBuffer();
      const hdr = parseImagesPakHeader(new Uint8Array(headBuf));

      const tailLen = hdr.totalFileSize - hdr.fileInfoOffset;
      if (tailLen <= 0 || tailLen > 100_000_000) {
        throw new Error("حجم شجرة الملفات غير معقول — قد لا يكون هذا ملف images.pak الصحيح");
      }
      const tailBuf = await f.slice(hdr.fileInfoOffset, hdr.fileInfoOffset + tailLen).arrayBuffer();
      const { tree, endOffset } = parseImagesPakFileInfoTree(new Uint8Array(tailBuf), hdr);
      if (endOffset !== hdr.totalFileSize) {
        setTreeSizeWarning(
          `تحذير: انتهت قراءة شجرة الملفات عند بايت ${endOffset} بينما حجم الملف ${hdr.totalFileSize} — البنية قد تختلف عن المتوقع، تحقق من النتائج بحذر.`
        );
      }
      const flat = flattenPakTree(tree);
      setHeader(hdr);
      setFlatFiles(flat);
      setFile(f);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setFile(null);
      setHeader(null);
      setFlatFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenFsa = useCallback(async () => {
    if (!window.showOpenFilePicker) return;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "Risen 1 images.pak", accept: { "application/octet-stream": [".pak"] } }],
      });
      const f = await handle.getFile();
      setFileHandle(handle);
      await loadPakFromFile(f);
    } catch (e) {
      // AbortError when the user cancels the picker — not an error worth surfacing.
      if (e instanceof Error && e.name !== "AbortError") setLoadError(e.message);
    }
  }, [loadPakFromFile]);

  const handlePlainInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileHandle(null);
    void loadPakFromFile(f);
  }, [loadPakFromFile]);

  // Drag-and-drop can't hand us a FileSystemFileHandle (only the FSA picker
  // can), so a dropped file always goes through the same download-based
  // replace flow as the non-Chrome/Edge fallback button below.
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (loading) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFileHandle(null);
    void loadPakFromFile(f);
  }, [loading, loadPakFromFile]);

  const handleClose = useCallback(() => {
    setFileHandle(null);
    setFile(null);
    setHeader(null);
    setFlatFiles([]);
    setStandaloneDdsMode(false);
    setSelectedPath(null);
    setSelectedDecoded(null);
    setDecodedCache(new Map());
    setModifiedLog(new Map());
    firstWriteConfirmedRef.current = false;
    setActiveFilter("all");
    setSearch("");
  }, []);

  const sections = useMemo(() => buildImageSections(flatFiles), [flatFiles]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flatFiles.filter((f) => {
      if (activeFilter !== "all" && classifyImagePath(f.path).id !== activeFilter) return false;
      if (q && !f.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [flatFiles, activeFilter, search]);

  const handleThumbDecoded = useCallback((path: string, result: ThumbResult) => {
    setDecodedCache((prev) => {
      const next = new Map(prev);
      next.set(path, result);
      return next;
    });
  }, []);

  /** `fileOverride` lets a caller force a specific File (e.g. a just-refreshed
   * snapshot right after a write) instead of the possibly-stale `file` in state. */
  const handleSelect = useCallback(async (entry: RisenPakFlatFile, fileOverride?: File) => {
    setSelectedPath(entry.path);
    const cached = fileOverride ? undefined : decodedCache.get(entry.path);
    if (cached) { setSelectedDecoded(cached); return; }
    const activeFile = fileOverride || file;
    if (!activeFile) return;
    setSelectedLoading(true);
    setSelectedDecoded(null);
    try {
      const buf = await activeFile.slice(entry.offset, entry.offset + entry.size).arrayBuffer();
      const result = await decodeXimgEntry(new Uint8Array(buf));
      setSelectedDecoded(result);
      handleThumbDecoded(entry.path, result);
    } catch (e) {
      setSelectedDecoded({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSelectedLoading(false);
    }
  }, [file, decodedCache, handleThumbDecoded]);

  const selectedEntry = useMemo(
    () => flatFiles.find((f) => f.path === selectedPath) || null,
    [flatFiles, selectedPath]
  );

  // Renders the "in-game-like" approximation preview into previewCanvasRef when
  // either toggle is active — decodes fresh (canvas-free) rather than reusing the
  // cached dataUrl, since these transforms need raw RGBA access.
  useEffect(() => {
    if (!previewNaiveFilter && !previewSuspicious) return;
    if (!selectedEntry || !file || selectedDecoded?.kind !== "ok") return;
    let cancelled = false;
    (async () => {
      try {
        const buf = await file.slice(selectedEntry.offset, selectedEntry.offset + selectedEntry.size).arrayBuffer();
        const { ddsBytes } = extractDdsFromXimg(new Uint8Array(buf));
        const decoded = decodeDdsToRgba(ddsBytes);
        if (cancelled || !decoded.supported) return;

        let rgba = new Uint8ClampedArray(decoded.rgba);
        let width = decoded.width;
        let height = decoded.height;
        if (previewNaiveFilter) {
          const filtered = simulateNaiveBilinearPreview(rgba, width, height, 0.5);
          rgba = filtered.rgba as Uint8ClampedArray<ArrayBuffer>;
          width = filtered.width;
          height = filtered.height;
        }
        if (previewSuspicious) {
          for (const { x, y } of findSuspiciousTransparentPixels(rgba, width, height)) {
            const o = (y * width + x) * 4;
            rgba[o] = 255; rgba[o + 1] = 0; rgba[o + 2] = 255; rgba[o + 3] = 255; // warning magenta
          }
        }

        const canvas = previewCanvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
      } catch { /* non-critical preview feature — leave canvas blank on failure */ }
    })();
    return () => { cancelled = true; };
  }, [previewNaiveFilter, previewSuspicious, selectedEntry, file, selectedDecoded]);

  /** Opens a single loose .dds file directly — no images.pak needed. Wraps it
   * in a minimal synthetic .ximg (wrapRawDdsAsXimg) and registers it as the
   * sole entry, so every existing tool (replace/composite/erase/export) works
   * completely unchanged against it. */
  const loadStandaloneDdsFromFile = useCallback(async (f: File, handle?: FileSystemFileHandle) => {
    setLoading(true);
    setLoadError(null);
    setTreeSizeWarning(null);
    try {
      const ddsBytes = new Uint8Array(await f.arrayBuffer());
      if (new TextDecoder("ascii").decode(ddsBytes.subarray(0, 4)) !== "DDS ") {
        throw new Error('توقيع DDS غير صالح — يجب أن يبدأ الملف بـ"DDS "');
      }
      const wrapped = wrapRawDdsAsXimg(ddsBytes);
      const entry: RisenPakFlatFile = { path: f.name.replace(/\.dds$/i, ""), offset: 0, size: wrapped.length };
      const wrappedFile = new File([wrapped as BlobPart], f.name);
      setFileHandle(handle || null);
      setHeader(null);
      setFlatFiles([entry]);
      setStandaloneDdsMode(true);
      setFile(wrappedFile);
      await handleSelect(entry, wrappedFile);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setFile(null);
      setFlatFiles([]);
      setStandaloneDdsMode(false);
    } finally {
      setLoading(false);
    }
  }, [handleSelect]);

  const handleOpenStandaloneDdsFsa = useCallback(async () => {
    if (!window.showOpenFilePicker) return;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "ملف DDS", accept: { "application/octet-stream": [".dds"] } }],
      });
      const f = await handle.getFile();
      await loadStandaloneDdsFromFile(f, handle);
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") setLoadError(e.message);
    }
  }, [loadStandaloneDdsFromFile]);

  const handlePlainStandaloneDdsInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    void loadStandaloneDdsFromFile(f);
  }, [loadStandaloneDdsFromFile]);

  const invalidateEntry = useCallback((path: string) => {
    setDecodedCache((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
    if (selectedPath === path) setSelectedDecoded(null);
  }, [selectedPath]);

  const confirmFirstWriteIfNeeded = useCallback((): boolean => {
    if (firstWriteConfirmedRef.current) return true;
    const ok = window.confirm(
      standaloneDdsMode
        ? "أنت على وشك تعديل ملف DDS مباشرة. يُنصح بعمل نسخة احتياطية من الملف قبل المتابعة.\n\nهل تريد الاستمرار؟"
        : "أنت على وشك تعديل ملف images.pak مباشرة. يُنصح بعمل نسخة احتياطية من الملف قبل المتابعة.\n\nهل تريد الاستمرار؟"
    );
    if (ok) firstWriteConfirmedRef.current = true;
    return ok;
  }, [standaloneDdsMode]);

  /** Given the original DDS header info and a full-size ImageData (same width/height
   * as the original), encodes it back to the original's exact pixel format. Shared by
   * the whole-image PNG replace path and the region-composite path below. */
  const encodeToOriginalFormat = useCallback(
    (original: ReturnType<typeof extractDdsFromXimg>, imageData: ImageData): { bytes: Uint8Array } | { error: string } => {
      if (isDxtFourCC(original.fourCC)) {
        const compressed = encodeDxt(original.fourCC, new Uint8Array(imageData.data), original.width, original.height);
        return { bytes: buildDdsFile(original.fourCC, original.width, original.height, compressed, original.caps) };
      }
      if (original.isRawRgb) {
        const pixelDataLength = original.ddsBytes.length - 128;
        const pixelData = encodeRawRgbDds(
          new Uint8Array(imageData.data), original.width, original.height, original.rgbBitCount,
          original.rMask, original.gMask, original.bMask, original.aMask,
          pixelDataLength, original.hasPitchFlag ? original.pitchOrLinearSize : undefined
        );
        if (!pixelData) {
          return { error: `صيغة البكسل غير المضغوطة (${original.rgbBitCount} بت) غير مدعومة للترميز — استورد ملف DDS جاهزاً بدلاً من PNG` };
        }
        return {
          bytes: buildRawRgbDdsFile(
            original.width, original.height, original.rgbBitCount,
            original.rMask, original.gMask, original.bMask, original.aMask,
            pixelData, original.hasPitchFlag, original.pitchOrLinearSize,
            original.ddspfFlags, original.caps
          ),
        };
      }
      return { error: `صيغة ضغط الصورة الأصلية (${original.fourCC || "غير معروفة"}) غير مدعومة للترميز التلقائي — استورد ملف DDS جاهزاً بنفس الصيغة بدلاً من PNG` };
    },
    []
  );

  /** Validates, confirms, writes/downloads, and refreshes preview — the common tail
   * shared by both the whole-image replace and the region-composite flows. */
  const applyReplacementDds = useCallback(async (originalXimg: Uint8Array, newDdsBytes: Uint8Array) => {
    const { toast } = await import("sonner");
    if (!selectedEntry) return;

    const validation = validateReplacementDds(originalXimg, newDdsBytes);
    if (!validation.ok) {
      toast.error(validation.reason);
      return;
    }

    const rebuiltXimg = spliceReplacementDds(originalXimg, newDdsBytes);

    if (!confirmFirstWriteIfNeeded()) return;

    setModifiedLog((prev) => {
      const next = new Map(prev);
      if (!next.has(selectedEntry.path)) next.set(selectedEntry.path, { originalXimgBytes: originalXimg });
      return next;
    });

    // Standalone .dds mode: the real on-disk file (or the download) is the raw
    // DDS blob with no synthetic .ximg wrapper — only `rebuiltXimg`'s DDS portion
    // gets written/downloaded. `file` state stays re-wrapped afterward so every
    // other tool keeps working against consistent "wrapped .ximg entry" bytes.
    const onDiskBytes = standaloneDdsMode ? extractDdsFromXimg(rebuiltXimg).ddsBytes : rebuiltXimg;
    const onDiskOriginalBytes = standaloneDdsMode ? extractDdsFromXimg(originalXimg).ddsBytes : originalXimg;
    const writePosition = standaloneDdsMode ? 0 : selectedEntry.offset;

    let freshFile: File | null = null;
    if (fileHandle) {
      const writable = await fileHandle.createWritable({ keepExistingData: true });
      await writable.write({ type: "write", position: writePosition, data: onDiskBytes as BufferSource });
      await writable.close();
      // Chrome invalidates previously-obtained File snapshots for a handle once it's
      // been written to — re-acquire a fresh one or every subsequent read (including
      // the re-preview below) throws NotReadableError ("تعذر قراءة الملف المطلوب...").
      const rawFreshFile = await fileHandle.getFile();

      // Safety net: read back exactly what landed on disk and confirm it's
      // byte-identical to what we intended to write — catches any future write
      // bug (wrong offset, truncation, partial write) immediately instead of
      // only discovering it later in-game. Independent of *why* it might fail.
      const verifyBuf = await rawFreshFile.slice(writePosition, writePosition + onDiskBytes.length).arrayBuffer();
      const mismatchAt = findFirstByteMismatch(new Uint8Array(verifyBuf), onDiskBytes);
      if (mismatchAt !== -1) {
        toast.error(`فشل التحقق بعد الكتابة — الملف على القرص لا يطابق ما كان يُفترض كتابته (أول اختلاف عند البايت ${mismatchAt} من ${onDiskBytes.length}).`, {
          action: {
            label: "استعادة فورية",
            onClick: async () => {
              const restoreWritable = await fileHandle.createWritable({ keepExistingData: true });
              await restoreWritable.write({ type: "write", position: writePosition, data: onDiskOriginalBytes as BufferSource });
              await restoreWritable.close();
              const restoredRaw = await fileHandle.getFile();
              const restoredFile = standaloneDdsMode
                ? new File([wrapRawDdsAsXimg(new Uint8Array(await restoredRaw.arrayBuffer())) as BlobPart], restoredRaw.name)
                : restoredRaw;
              setFile(restoredFile);
              invalidateEntry(selectedEntry.path);
              await handleSelect(selectedEntry, restoredFile);
              toast.success("تمت استعادة الصورة الأصلية بنجاح");
            },
          },
        });
        return;
      }

      freshFile = standaloneDdsMode
        ? new File([wrapRawDdsAsXimg(new Uint8Array(await rawFreshFile.arrayBuffer())) as BlobPart], rawFreshFile.name)
        : rawFreshFile;
      setFile(freshFile);
      toast.success(
        standaloneDdsMode
          ? `تم حفظ الصورة المعدَّلة مباشرة في ${rawFreshFile.name} — تحقَّق التطابق بعد الكتابة`
          : `تم حقن الصورة الجديدة مباشرة في images.pak (${selectedEntry.path}) — تحقَّق التطابق بعد الكتابة`
      );
    } else if (standaloneDdsMode) {
      const shortName = selectedEntry.path.slice(selectedEntry.path.lastIndexOf("/") + 1);
      downloadBlob(onDiskBytes, `${shortName}.dds`);
      toast.info("متصفحك لا يدعم الكتابة المباشرة — تم تنزيل ملف DDS المعدَّل");
    } else {
      const shortName = selectedEntry.path.slice(selectedEntry.path.lastIndexOf("/") + 1);
      downloadBlob(rebuiltXimg, shortName);
      const script = buildPowerShellPatchScript(selectedEntry.offset, rebuiltXimg.length, shortName);
      downloadText(script, `inject-${shortName}.ps1`);
      toast.info("متصفحك لا يدعم الكتابة المباشرة — تم تنزيل الملف المعدّل + سكربت PowerShell لحقنه يدوياً");
    }

    invalidateEntry(selectedEntry.path);
    await handleSelect(selectedEntry, freshFile || undefined);
  }, [selectedEntry, fileHandle, confirmFirstWriteIfNeeded, invalidateEntry, handleSelect, standaloneDdsMode]);

  const handleReplaceSelected = useCallback(async (importFile: File) => {
    if (!selectedEntry || !file) return;
    const { toast } = await import("sonner");
    setBusyPath(selectedEntry.path);
    try {
      const originalBuf = await file.slice(selectedEntry.offset, selectedEntry.offset + selectedEntry.size).arrayBuffer();
      const originalXimg = new Uint8Array(originalBuf);
      const original = extractDdsFromXimg(originalXimg);

      let newDdsBytes: Uint8Array;
      let importMethod: string;
      const lowerName = importFile.name.toLowerCase();
      if (lowerName.endsWith(".dds")) {
        newDdsBytes = new Uint8Array(await importFile.arrayBuffer());
        importMethod = "استيراد DDS مباشر (بلا أي معالجة من الأداة)";
      } else {
        const pngBytes = new Uint8Array(await importFile.arrayBuffer());
        // Decode the PNG's own compressed pixel data directly when its size already
        // matches the original exactly (the common "re-import the exported PNG"
        // case) — avoids Canvas2D's drawImage+getImageData premultiplied-alpha
        // rounding, confirmed (via a real corrupted game asset) to erode soft/
        // antialiased alpha edges on every round-trip through canvas. Falls back to
        // canvas below for actual resizes or PNG variants the decoder doesn't cover.
        const directDecode = await decodePngRawNoCanvas(pngBytes);
        let imageData: ImageData;
        if (directDecode && directDecode.width === original.width && directDecode.height === original.height) {
          imageData = new ImageData(directDecode.rgba as Uint8ClampedArray<ArrayBuffer>, directDecode.width, directDecode.height);
          importMethod = "PNG — فك مباشر بدون Canvas (الأبعاد مطابقة)";
        } else {
          const img = await loadImageElement(importFile);
          const canvas = document.createElement("canvas");
          canvas.width = original.width;
          canvas.height = original.height;
          const ctx = canvas.getContext("2d")!;
          // Forced resize to match the original exactly, same convention as the WILAY tool.
          ctx.drawImage(img, 0, 0, original.width, original.height);
          imageData = ctx.getImageData(0, 0, original.width, original.height);
          importMethod = directDecode
            ? `PNG — مرّ عبر Canvas (أبعاد PNG ${directDecode.width}x${directDecode.height} لا تطابق الأصل ${original.width}x${original.height})`
            : "PNG — مرّ عبر Canvas (فشل الفك المباشر لصيغة PNG هذه)";
        }
        const encoded = encodeToOriginalFormat(original, imageData);
        if ("error" in encoded) {
          toast.error(encoded.error);
          return;
        }
        newDdsBytes = encoded.bytes;
      }

      const newHeader = readDdsHeader(newDdsBytes);
      const report = [
        `تقرير تشخيصي — استبدال صورة Risen`,
        `المسار: ${selectedEntry.path}`,
        `الإزاحة داخل images.pak: ${selectedEntry.offset}   الحجم: ${selectedEntry.size}`,
        `طريقة الاستيراد: ${importMethod}`,
        ``,
        `== الترويسة الأصلية (قبل الاستبدال) ==`,
        describeDdsHeaderFlags(original),
        ``,
        `== الترويسة الجديدة (بعد الاستبدال) ==`,
        describeDdsHeaderFlags(newHeader),
        ``,
        `== ملخص ==`,
        `تطابق ddspf.dwFlags: ${original.ddspfFlags === newHeader.ddspfFlags ? "نعم" : `لا — تغيّر من 0x${original.ddspfFlags.toString(16)} إلى 0x${newHeader.ddspfFlags.toString(16)}`}`,
        `تطابق dwCaps: ${original.caps === newHeader.caps ? "نعم" : `لا — تغيّر من 0x${original.caps.toString(16)} إلى 0x${newHeader.caps.toString(16)}`}`,
        `طول بيانات DDS: أصلي=${original.ddsBytes.length} جديد=${newDdsBytes.length} (${original.ddsBytes.length === newDdsBytes.length ? "متطابق" : "غير متطابق!"})`,
      ].join("\n");
      const shortName = selectedEntry.path.slice(selectedEntry.path.lastIndexOf("/") + 1).replace(/\.ximg$/i, "");
      downloadText(report, `${shortName}-تقرير-تشخيصي.txt`);

      await applyReplacementDds(originalXimg, newDdsBytes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPath(null);
    }
  }, [selectedEntry, file, encodeToOriginalFormat, applyReplacementDds]);

  const handleUndo = useCallback(async (path: string) => {
    const record = modifiedLog.get(path);
    const entry = flatFiles.find((f) => f.path === path);
    if (!record || !entry || !fileHandle) return;
    const { toast } = await import("sonner");
    setBusyPath(path);
    try {
      const writable = await fileHandle.createWritable({ keepExistingData: true });
      await writable.write({ type: "write", position: entry.offset, data: record.originalXimgBytes as BufferSource });
      await writable.close();
      // Same stale-snapshot issue as the replace path above — refresh after writing.
      const freshFile = await fileHandle.getFile();
      setFile(freshFile);
      setModifiedLog((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      invalidateEntry(path);
      if (selectedPath === path) await handleSelect(entry, freshFile);
      toast.success("تم التراجع عن التعديل");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPath(null);
    }
  }, [modifiedLog, flatFiles, fileHandle, invalidateEntry, selectedPath, handleSelect]);

  const handleExportPng = useCallback(async () => {
    if (!selectedDecoded || selectedDecoded.kind !== "ok" || !selectedEntry || !file) return;
    const shortName = selectedEntry.path.slice(selectedEntry.path.lastIndexOf("/") + 1).replace(/\.ximg$/i, "");

    // Re-decode fresh and encode without Canvas2D when possible — confirmed via
    // a real browser test that canvas.toDataURL() after putImageData() zeroes
    // the RGB channels of every fully-transparent pixel (Chrome's premultiplied
    // backing store can't recover straight RGB at alpha=0). Many UI atlases keep
    // a deliberate "safe" border color in those pixels so GPU bilinear filtering
    // blends toward it instead of black; zeroing it reintroduces black fringing
    // at semi-transparent edges once the exported PNG is re-imported. The cached
    // `selectedDecoded.dataUrl` (used for the on-screen preview) already went
    // through that lossy canvas path, so it's not reused here.
    try {
      const buf = await file.slice(selectedEntry.offset, selectedEntry.offset + selectedEntry.size).arrayBuffer();
      const { ddsBytes } = extractDdsFromXimg(new Uint8Array(buf));
      const decoded = decodeDdsToRgba(ddsBytes);
      if (decoded.supported) {
        const pngBytes = await encodePngRawNoCanvas(decoded.rgba, decoded.width, decoded.height);
        if (pngBytes) {
          downloadBlob(pngBytes, `${shortName}.png`);
          return;
        }
      }
    } catch { /* falls through to the canvas-based dataUrl below */ }

    const a = document.createElement("a");
    a.href = selectedDecoded.dataUrl;
    a.download = `${shortName}.png`;
    a.click();
  }, [selectedDecoded, selectedEntry, file]);

  const handleExportRawDds = useCallback(async () => {
    if (!selectedEntry || !file) return;
    const buf = await file.slice(selectedEntry.offset, selectedEntry.offset + selectedEntry.size).arrayBuffer();
    const { ddsBytes } = extractDdsFromXimg(new Uint8Array(buf));
    const shortName = selectedEntry.path.slice(selectedEntry.path.lastIndexOf("/") + 1).replace(/\.ximg$/i, "");
    downloadBlob(ddsBytes, `${shortName}.dds`);
  }, [selectedEntry, file]);

  // ==========================================================================
  // Region-composite mode
  // ==========================================================================

  const exitCompositeMode = useCallback(() => {
    setCompositeMode(false);
    setSelectionRect(null);
    setDragStart(null);
    setCompositeOverlayFile(null);
    setCompositeOverlayImg(null);
    setCompositeZoom(1);
    setPickingEraseSource(false);
    setEraseSourceRect(null);
    setMovingSelectionOffset(null);
  }, []);

  const handleCompositeOverlayChosen = useCallback(async (f: File) => {
    setCompositeOverlayFile(f);
    try {
      setCompositeOverlayImg(await loadImageElement(f));
    } catch {
      setCompositeOverlayImg(null);
    }
  }, []);

  // Decodes the original DDS directly (once, on entering composite mode) rather than
  // reusing the cached PNG preview: reloading a PNG-re-encoded image via <img> + drawImage
  // runs it through the canvas's premultiplied-alpha compositing path, which rounds
  // semi-transparent pixels by ±1 — putImageData below writes raw pixels with no such loss.
  const [compositeBaseImageData, setCompositeBaseImageData] = useState<ImageData | null>(null);
  useEffect(() => {
    if (!compositeMode || !selectedEntry || !file) {
      setCompositeBaseImageData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const buf = await file.slice(selectedEntry.offset, selectedEntry.offset + selectedEntry.size).arrayBuffer();
        const { ddsBytes } = extractDdsFromXimg(new Uint8Array(buf));
        const decoded = decodeDdsToRgba(ddsBytes);
        if (cancelled || !decoded.supported) return;
        setCompositeBaseImageData(new ImageData(new Uint8ClampedArray(decoded.rgba), decoded.width, decoded.height));
      } catch { /* composite tool surfaces its own error when the user hits confirm */ }
    })();
    return () => { cancelled = true; };
  }, [compositeMode, selectedEntry, file]);

  // Redraws the composite canvas: base image (exact, via putImageData) + (if selected)
  // the overlay scaled into the current rect, with a rectangle outline — a live preview.
  useEffect(() => {
    if (!compositeMode || selectedDecoded?.kind !== "ok" || !compositeBaseImageData) return;
    const canvas = compositeCanvasRef.current;
    if (!canvas) return;
    canvas.width = selectedDecoded.width;
    canvas.height = selectedDecoded.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(compositeBaseImageData, 0, 0);
    if (selectionRect && selectionRect.w > 0 && selectionRect.h > 0) {
      if (compositeOverlayImg) {
        ctx.drawImage(compositeOverlayImg, selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
      }
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = Math.max(1, Math.round(selectedDecoded.width / 250));
      ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
    }
    if (eraseSourceRect && eraseSourceRect.w > 0 && eraseSourceRect.h > 0) {
      // Show the exact block being dragged out as the erase source — any
      // size, scaled to fit selectionRect when applied — so the user can see
      // and avoid overlapping a neighboring atlas element before committing.
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = Math.max(1, Math.round(selectedDecoded.width / 250));
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(eraseSourceRect.x, eraseSourceRect.y, eraseSourceRect.w, eraseSourceRect.h);
      ctx.setLineDash([]);
    }
  }, [compositeMode, selectedDecoded, selectionRect, compositeOverlayImg, compositeBaseImageData, eraseSourceRect]);

  const getImagePixelCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = compositeCanvasRef.current;
    if (!canvas || selectedDecoded?.kind !== "ok") return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scaleX = selectedDecoded.width / rect.width;
    const scaleY = selectedDecoded.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    return {
      x: Math.max(0, Math.min(selectedDecoded.width, x)),
      y: Math.max(0, Math.min(selectedDecoded.height, y)),
    };
  }, [selectedDecoded]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = getImagePixelCoords(e);
    if (!p) return;
    if (pickingEraseSource) {
      // Reuses `dragStart` purely as an "is dragging" flag here — mutually
      // exclusive with the other drag paths below (gated on `pickingEraseSource`).
      setDragStart(p);
      setEraseSourceRect({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    // A mousedown *inside* the existing selection moves it as a whole (same
    // size, new position) instead of starting a fresh selection — lets the
    // same target spot be repositioned without re-detecting/re-dragging it.
    if (
      selectionRect && selectionRect.w > 0 && selectionRect.h > 0 &&
      p.x >= selectionRect.x && p.x <= selectionRect.x + selectionRect.w &&
      p.y >= selectionRect.y && p.y <= selectionRect.y + selectionRect.h
    ) {
      setMovingSelectionOffset({ dx: p.x - selectionRect.x, dy: p.y - selectionRect.y });
      setDragStart(p);
      return;
    }
    setDragStart(p);
    setSelectionRect({ x: p.x, y: p.y, w: 0, h: 0 });
  }, [getImagePixelCoords, pickingEraseSource, selectionRect]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStart) return;
    const p = getImagePixelCoords(e);
    if (!p) return;
    if (pickingEraseSource) {
      // Free-size drag (any size, not forced to match the target rect) — the
      // redraw effect shows the exact block, scaled to fit on apply.
      setEraseSourceRect({
        x: Math.min(dragStart.x, p.x),
        y: Math.min(dragStart.y, p.y),
        w: Math.abs(p.x - dragStart.x),
        h: Math.abs(p.y - dragStart.y),
      });
      return;
    }
    if (movingSelectionOffset && selectionRect && selectedDecoded?.kind === "ok") {
      const maxX = Math.max(0, selectedDecoded.width - selectionRect.w);
      const maxY = Math.max(0, selectedDecoded.height - selectionRect.h);
      setSelectionRect({
        ...selectionRect,
        x: Math.max(0, Math.min(maxX, p.x - movingSelectionOffset.dx)),
        y: Math.max(0, Math.min(maxY, p.y - movingSelectionOffset.dy)),
      });
      return;
    }
    setSelectionRect({
      x: Math.min(dragStart.x, p.x),
      y: Math.min(dragStart.y, p.y),
      w: Math.abs(p.x - dragStart.x),
      h: Math.abs(p.y - dragStart.y),
    });
  }, [dragStart, getImagePixelCoords, pickingEraseSource, movingSelectionOffset, selectionRect, selectedDecoded]);

  /** Mouse-up ends a drag; but if the pointer barely moved since mouse-down,
   * treat it as a plain click and auto-detect the region under it instead of
   * leaving the degenerate near-zero-size rect the drag would have produced.
   * Leaving the canvas mid-drag (onMouseLeave) must NOT trigger detection —
   * that's just an aborted drag, handled by the separate handler below. */
  const handleCanvasMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const start = dragStart;
    const wasMovingSelection = !!movingSelectionOffset;
    setDragStart(null);
    setMovingSelectionOffset(null);
    if (pickingEraseSource) {
      setPickingEraseSource(false); // eraseSourceRect already reflects the final drag.
      return;
    }
    if (wasMovingSelection) return; // just repositioned the existing rect — nothing more to do.
    if (!start || !compositeBaseImageData || selectedDecoded?.kind !== "ok") return;
    const p = getImagePixelCoords(e);
    if (!p) return;
    const movedFarEnoughToBeADrag = Math.abs(p.x - start.x) > 3 || Math.abs(p.y - start.y) > 3;
    if (movedFarEnoughToBeADrag) return; // selectionRect was already set live by mousemove.
    const detected = detectRegionBounds(compositeBaseImageData.data, selectedDecoded.width, selectedDecoded.height, start.x, start.y);
    setSelectionRect(detected);
  }, [dragStart, movingSelectionOffset, getImagePixelCoords, compositeBaseImageData, selectedDecoded, pickingEraseSource]);

  const handleCanvasMouseLeave = useCallback(() => { setDragStart(null); setMovingSelectionOffset(null); }, []);

  /** Samples `eraseSourceRect` (any size/position), scales it to fit
   * `selectionRect` exactly (stretch-fill, no letterbox padding — the whole
   * target must be covered), and bakes the result directly into
   * `compositeBaseImageData` so it becomes the new base for the overlay
   * paste step that follows. */
  const handleApplyErase = useCallback(() => {
    if (
      !compositeBaseImageData || !selectionRect || selectionRect.w <= 0 || selectionRect.h <= 0 ||
      !eraseSourceRect || eraseSourceRect.w <= 0 || eraseSourceRect.h <= 0
    ) return;
    const cropped = cropRegion(compositeBaseImageData.data, compositeBaseImageData.width, compositeBaseImageData.height, eraseSourceRect);
    const scaled = scaleRgbaStretch(cropped, eraseSourceRect.w, eraseSourceRect.h, selectionRect.w, selectionRect.h);
    const erased = compositeIntoRegion(compositeBaseImageData.data, compositeBaseImageData.width, compositeBaseImageData.height, scaled, selectionRect);
    setCompositeBaseImageData(new ImageData(erased as Uint8ClampedArray<ArrayBuffer>, compositeBaseImageData.width, compositeBaseImageData.height));
    setEraseSourceRect(null);
  }, [compositeBaseImageData, selectionRect, eraseSourceRect]);

  /** Exports just the currently selected rect as its own small PNG (full
   * quality/transparency, no Canvas) — for editing a single atlas element
   * externally at full resolution instead of round-tripping the whole image.
   * Bring the edited PNG back with the normal overlay picker + "تركيب". */
  const handleExportSelectedRegionPng = useCallback(async () => {
    if (!compositeBaseImageData || !selectionRect || selectionRect.w <= 0 || selectionRect.h <= 0 || !selectedEntry) return;
    const cropped = cropRegion(compositeBaseImageData.data, compositeBaseImageData.width, compositeBaseImageData.height, selectionRect);
    const pngBytes = await encodePngRawNoCanvas(cropped, selectionRect.w, selectionRect.h);
    if (!pngBytes) return;
    const shortName = selectedEntry.path.slice(selectedEntry.path.lastIndexOf("/") + 1).replace(/\.ximg$/i, "");
    downloadBlob(pngBytes, `${shortName}-منطقة-${selectionRect.x}x${selectionRect.y}.png`);
  }, [compositeBaseImageData, selectionRect, selectedEntry]);

  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 8;

  /** Ctrl/Cmd+wheel zooms; plain wheel is left alone so the scroll container's
   * native scrollbars still pan normally. */
  const handleCompositeWheelZoom = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setCompositeZoom((z) => {
      const next = e.deltaY < 0 ? z * 1.2 : z / 1.2;
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    });
  }, []);

  const fitCompositeZoomToContainer = useCallback(() => {
    if (selectedDecoded?.kind !== "ok") return;
    const container = compositeScrollRef.current;
    if (!container) return;
    const fit = Math.min(container.clientWidth / selectedDecoded.width, container.clientHeight / selectedDecoded.height);
    if (Number.isFinite(fit) && fit > 0) setCompositeZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit)));
  }, [selectedDecoded]);

  // Auto-fit once on entering composite mode, after the large editor layout
  // has actually mounted and the scroll container has its final size.
  useEffect(() => {
    if (!compositeMode) return;
    const raf = requestAnimationFrame(() => fitCompositeZoomToContainer());
    return () => cancelAnimationFrame(raf);
  }, [compositeMode, fitCompositeZoomToContainer]);

  /** Manual fine-tune of the drag-selected rect via numeric inputs. Clamps so
   * the rect never extends past the image bounds regardless of which field changed. */
  const handleSelectionFieldChange = useCallback((field: keyof CompositeRect, value: number) => {
    if (selectedDecoded?.kind !== "ok") return;
    const v = Number.isFinite(value) ? Math.max(0, value) : 0;
    setSelectionRect((prev) => {
      const next: CompositeRect = { ...(prev || { x: 0, y: 0, w: 0, h: 0 }), [field]: v };
      next.x = Math.min(next.x, selectedDecoded.width);
      next.y = Math.min(next.y, selectedDecoded.height);
      next.w = Math.min(next.w, selectedDecoded.width - next.x);
      next.h = Math.min(next.h, selectedDecoded.height - next.y);
      return next;
    });
  }, [selectedDecoded]);

  const handleCompositeConfirm = useCallback(async () => {
    if (!selectedEntry || !file || !compositeOverlayImg || !compositeOverlayFile || !selectionRect || selectionRect.w <= 0 || selectionRect.h <= 0 || !compositeBaseImageData) return;
    const { toast } = await import("sonner");
    setBusyPath(selectedEntry.path);
    try {
      const originalBuf = await file.slice(selectedEntry.offset, selectedEntry.offset + selectedEntry.size).arrayBuffer();
      const originalXimg = new Uint8Array(originalBuf);
      const original = extractDdsFromXimg(originalXimg);

      // Scale the overlay without Canvas2D when possible — confirmed via a real
      // in-game screenshot that ctx.drawImage()+getImageData() (the old
      // getScaledImageRgba path) corrupts pixels here too (irregular black
      // blobs on a shared UI texture, appearing even with the *unmodified*
      // overlay), the same premultiplied-alpha rounding already fixed for the
      // plain-replace PNG path. Falls back to canvas for overlay formats
      // decodePngRawNoCanvas doesn't cover.
      const overlayBytes = new Uint8Array(await compositeOverlayFile.arrayBuffer());
      const overlayDirectDecode = await decodePngRawNoCanvas(overlayBytes);
      let overlayScaleMethod: string;
      let overlayData: Uint8ClampedArray;
      if (overlayDirectDecode) {
        overlayData = scaleRgbaContainFit(
          overlayDirectDecode.rgba, overlayDirectDecode.width, overlayDirectDecode.height,
          selectionRect.w, selectionRect.h
        );
        overlayScaleMethod = "تحجيم مباشر بدون Canvas";
      } else {
        overlayData = getScaledImageRgba(compositeOverlayImg, selectionRect.w, selectionRect.h);
        overlayScaleMethod = "تحجيم عبر Canvas (فشل الفك المباشر لصيغة صورة التركيب هذه)";
      }

      // Pure array splice (see risen-image-composite.ts) instead of a second
      // canvas draw+getImageData round-trip — that path was found (via browser
      // testing) to round semi-transparent pixels by ±1 across the WHOLE image,
      // not just the edited region, due to Canvas2D's premultiplied-alpha storage.
      const composited = compositeIntoRegion(compositeBaseImageData.data, original.width, original.height, overlayData, selectionRect);
      const imageData = new ImageData(composited as Uint8ClampedArray<ArrayBuffer>, original.width, original.height);

      const encoded = encodeToOriginalFormat(original, imageData);
      if ("error" in encoded) {
        toast.error(encoded.error);
        return;
      }

      const newHeader = readDdsHeader(encoded.bytes);
      const report = [
        `تقرير تشخيصي — تركيب صورة Risen`,
        `المسار: ${selectedEntry.path}`,
        `الإزاحة داخل images.pak: ${selectedEntry.offset}   الحجم: ${selectedEntry.size}`,
        `منطقة التركيب: x=${selectionRect.x} y=${selectionRect.y} w=${selectionRect.w} h=${selectionRect.h}`,
        `طريقة تحجيم صورة التركيب: ${overlayScaleMethod}`,
        ``,
        `== الترويسة الأصلية (قبل التركيب) ==`,
        describeDdsHeaderFlags(original),
        ``,
        `== الترويسة الجديدة (بعد التركيب) ==`,
        describeDdsHeaderFlags(newHeader),
        ``,
        `== ملخص ==`,
        `تطابق ddspf.dwFlags: ${original.ddspfFlags === newHeader.ddspfFlags ? "نعم" : `لا — تغيّر من 0x${original.ddspfFlags.toString(16)} إلى 0x${newHeader.ddspfFlags.toString(16)}`}`,
        `تطابق dwCaps: ${original.caps === newHeader.caps ? "نعم" : `لا — تغيّر من 0x${original.caps.toString(16)} إلى 0x${newHeader.caps.toString(16)}`}`,
        `طول بيانات DDS: أصلي=${original.ddsBytes.length} جديد=${encoded.bytes.length} (${original.ddsBytes.length === encoded.bytes.length ? "متطابق" : "غير متطابق!"})`,
      ].join("\n");
      const shortName = selectedEntry.path.slice(selectedEntry.path.lastIndexOf("/") + 1).replace(/\.ximg$/i, "");
      downloadText(report, `${shortName}-تركيب-تقرير-تشخيصي.txt`);

      await applyReplacementDds(originalXimg, encoded.bytes);
      exitCompositeMode();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPath(null);
    }
  }, [selectedEntry, file, compositeOverlayImg, compositeOverlayFile, selectionRect, compositeBaseImageData, encodeToOriginalFormat, applyReplacementDds, exitCompositeMode]);

  // ==========================================================================

  if (!file || (!header && !standaloneDdsMode)) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center px-4 text-center transition-colors ${dragOver ? "bg-primary/5" : ""}`}
        dir="rtl"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Link to="/risen" className="absolute top-4 right-4">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> رجوع</Button>
        </Link>
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6" style={{ backgroundColor: `${ACCENT}1a` }}>
          <span className="text-3xl">🖼️</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-display font-bold mb-3">أداة صور Risen 1</h1>
        <p className="text-muted-foreground mb-8 max-w-lg font-body">
          افتح ملف <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">images.pak</code> لعرض واستخراج وتعديل صوره
          (شاشات التحميل، صور الواجهة، أيقونات الإنجازات) — بدون تحميل الملف كاملاً للذاكرة، أو اسحب الملف وأفلته هنا.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> جارٍ قراءة الملف...
          </div>
        ) : (
          <>
            {fsaSupported ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="lg" onClick={handleOpenFsa} className="font-display font-bold text-lg px-10 py-6" style={{ backgroundColor: ACCENT, color: "white" }}>
                  <FolderOpen className="w-5 h-5 ml-2" /> افتح images.pak
                </Button>
                <Button size="lg" variant="outline" onClick={handleOpenStandaloneDdsFsa} className="font-display font-bold text-lg px-10 py-6">
                  <FolderOpen className="w-5 h-5 ml-2" /> افتح ملف DDS مباشرة
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button size="lg" onClick={() => fileInputRef.current?.click()} className="font-display font-bold text-lg px-10 py-6" style={{ backgroundColor: ACCENT, color: "white" }}>
                    <FolderOpen className="w-5 h-5 ml-2" /> افتح images.pak
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => standaloneDdsInputRef.current?.click()} className="font-display font-bold text-lg px-10 py-6">
                    <FolderOpen className="w-5 h-5 ml-2" /> افتح ملف DDS مباشرة
                  </Button>
                </div>
                <input ref={fileInputRef} type="file" accept=".pak" className="hidden" onChange={handlePlainInput} />
                <input ref={standaloneDdsInputRef} type="file" accept=".dds" className="hidden" onChange={handlePlainStandaloneDdsInput} />
                <p className="text-xs text-muted-foreground mt-4 max-w-md">
                  متصفحك لا يدعم الكتابة المباشرة بالملف (متاحة في Chrome/Edge). يمكنك التصفح والمعاينة والتصدير هنا بلا مشاكل،
                  لكن استبدال صورة سيُنزّل الملف المعدّل + سكربت PowerShell لحقنه يدوياً بدل الكتابة المباشرة.
                </p>
              </>
            )}
            <p className="text-xs text-muted-foreground mt-4 max-w-md">
              "افتح ملف DDS مباشرة" يفتح صورة واحدة مصدَّرة مسبقاً بدون الحاجة لملف images.pak الكامل — مفيد للتعديل من جهاز آخر أو الهاتف. تتوفر كل الأدوات (استبدال/تركيب/مسح) بنفس الشكل.
            </p>
          </>
        )}

        {loadError && (
          <div className="mt-6 max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex gap-2 items-start text-right">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{loadError}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <div className="border-b border-border px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link to="/risen"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> رجوع</Button></Link>
        <span className="font-display font-bold">🖼️ صور Risen 1</span>
        <span className="text-sm text-muted-foreground font-mono">{file.name}</span>
        <span className="text-xs text-muted-foreground">({flatFiles.length} ملف)</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleClose}>إغلاق</Button>
      </div>

      {treeSizeWarning && (
        <div className="px-4 py-2 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {treeSizeWarning}
        </div>
      )}

      {compositeMode && selectedEntry && selectedDecoded?.kind === "ok" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="p-3 border-b border-border flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={exitCompositeMode} className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> رجوع
            </Button>
            <div className="font-mono text-xs text-muted-foreground truncate flex-1 min-w-[140px]">{selectedEntry.path}</div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCompositeZoom((z) => Math.max(ZOOM_MIN, z / 1.25))} title="تصغير">
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs font-mono w-12 text-center">{Math.round(compositeZoom * 100)}%</span>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCompositeZoom((z) => Math.min(ZOOM_MAX, z * 1.25))} title="تكبير">
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={fitCompositeZoomToContainer} className="gap-1.5" title="ملائمة الشاشة">
                <Maximize className="w-3.5 h-3.5" /> ملائمة
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCompositeZoom(1)}>100%</Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground px-3 pt-2">
            انقر على الشعار/العنصر لاكتشاف حدوده تلقائياً — أو اسحب لتحديد يدوي، أو اسحب من داخل التحديد الحالي لتحريكه. Ctrl/⌘ + عجلة الفأرة للتكبير، والتمرير العادي للتنقل.
          </div>
          <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 p-3">
            <div
              ref={compositeScrollRef}
              className="flex-1 min-h-[320px] md:min-h-0 overflow-auto rounded border border-border"
              style={{ backgroundImage: "repeating-conic-gradient(#88888844 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" }}
              onWheel={handleCompositeWheelZoom}
            >
              <canvas
                ref={compositeCanvasRef}
                style={{
                  width: selectedDecoded.width * compositeZoom,
                  height: selectedDecoded.height * compositeZoom,
                  display: "block", cursor: "crosshair", imageRendering: "pixelated",
                }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseLeave}
              />
            </div>
            <div className="w-full md:w-72 shrink-0 flex flex-col gap-3">
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  ["x", "X"], ["y", "Y"], ["w", "العرض"], ["h", "الارتفاع"],
                ] as const).map(([field, label]) => (
                  <div key={field} className="flex flex-col items-center gap-0.5">
                    <label className="text-[10px] text-muted-foreground">{label}</label>
                    <input
                      type="number"
                      value={selectionRect ? selectionRect[field] : 0}
                      onChange={(e) => handleSelectionFieldChange(field, parseInt(e.target.value, 10))}
                      min={0}
                      className="w-full px-1 py-1 rounded bg-background border border-border text-xs text-center font-mono"
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1.5 p-2 rounded border border-border bg-muted/30">
                <div className="text-[11px] font-medium">🧹 مسح المحتوى القديم من هذه المنطقة (اختياري)</div>
                <p className="text-[10px] text-muted-foreground">
                  بعد تحديد منطقة الاسم/النص القديم أعلاه، اسحب مربعاً بأي حجم فوق منطقة نظيفة من نفس الصورة (مفيد للصور الكبيرة كالخرائط حيث لا تتوفر مساحة فارغة بنفس حجم الهدف) — تُحجَّم تلقائياً وباحتراف لتغطية المنطقة القديمة بالكامل. يمكنك أيضاً السحب من داخل المربع الأخضر نفسه لتحريكه لمكان آخر قبل المسح أو اللصق.
                </p>
                <Button
                  size="sm"
                  variant={pickingEraseSource ? "default" : "outline"}
                  onClick={() => setPickingEraseSource((v) => !v)}
                  disabled={!selectionRect || selectionRect.w <= 0 || selectionRect.h <= 0}
                >
                  <Target className="w-3.5 h-3.5 ml-1" />
                  {pickingEraseSource ? "اسحب الآن مربعاً (أي حجم) فوق منطقة نظيفة…" : "اسحب لتحديد منطقة مصدر نظيفة"}
                </Button>
                {eraseSourceRect && eraseSourceRect.w > 0 && eraseSourceRect.h > 0 && (
                  <div className="text-[10px] text-muted-foreground text-center font-mono">منطقة المصدر: {eraseSourceRect.w}×{eraseSourceRect.h} عند ({eraseSourceRect.x}, {eraseSourceRect.y})</div>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleApplyErase}
                  disabled={!eraseSourceRect || eraseSourceRect.w <= 0 || eraseSourceRect.h <= 0 || !selectionRect || selectionRect.w <= 0 || selectionRect.h <= 0}
                >
                  <Eraser className="w-3.5 h-3.5 ml-1" /> تطبيق المسح
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportSelectedRegionPng}
                disabled={!selectionRect || selectionRect.w <= 0 || selectionRect.h <= 0}
              >
                <Download className="w-3.5 h-3.5 ml-1" /> تصدير المنطقة كـPNG (للتعديل الخارجي)
              </Button>
              <input
                ref={compositeOverlayInputRef}
                type="file"
                accept=".png"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void handleCompositeOverlayChosen(f);
                }}
              />
              <Button size="sm" variant="outline" onClick={() => compositeOverlayInputRef.current?.click()}>
                <ImageDown className="w-3.5 h-3.5 ml-1" /> {compositeOverlayFile ? "تغيير صورة التركيب" : "اختر صورة التركيب (PNG)"}
              </Button>
              {compositeOverlayFile && (
                <div className="text-[11px] text-muted-foreground text-center truncate">{compositeOverlayFile.name}</div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleCompositeConfirm}
                  disabled={!compositeOverlayImg || !selectionRect || selectionRect.w <= 0 || selectionRect.h <= 0 || busyPath === selectedEntry.path}
                  style={{ backgroundColor: ACCENT, color: "white" }}
                >
                  {busyPath === selectedEntry.path ? (
                    <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" />
                  ) : (
                    <Crop className="w-3.5 h-3.5 ml-1" />
                  )}
                  تركيب
                </Button>
                <Button size="sm" variant="ghost" onClick={exitCompositeMode}>
                  <X className="w-3.5 h-3.5 ml-1" /> إلغاء
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Sidebar: filters + thumbnail grid — not shown in standalone .dds mode (only one image) */}
        {!standaloneDdsMode && (
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="p-3 border-b border-border flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم..."
                className="flex-1 px-3 py-1.5 rounded bg-background border border-border text-sm font-body"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant={activeFilter === "all" ? "secondary" : "outline"} size="sm" className="text-xs" onClick={() => setActiveFilter("all")}>
                الكل ({flatFiles.length})
              </Button>
              {sections.localization.map((s: ImageSectionCount) => (
                <Button
                  key={s.id}
                  variant={activeFilter === s.id ? "secondary" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => setActiveFilter(s.id)}
                  title={s.note}
                >
                  {s.emoji} {s.label} ({s.count})
                </Button>
              ))}
            </div>
            {sections.other.length > 0 && (
              <div>
                <button
                  onClick={() => setOtherOpen((v) => !v)}
                  className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
                >
                  {otherOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  ملفات اللعبة الأخرى — لا تحتاج تعريباً
                </button>
                {otherOpen && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {sections.other.map((s: ImageSectionCount) => (
                      <Button
                        key={s.id}
                        variant={activeFilter === s.id ? "secondary" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => setActiveFilter(s.id)}
                      >
                        {s.emoji} {s.label} ({s.count})
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 content-start">
            {filteredFiles.map((entry) => (
              <LazyThumb
                key={entry.path}
                entry={entry}
                file={file}
                selected={entry.path === selectedPath}
                onSelect={() => handleSelect(entry)}
                onDecoded={handleThumbDecoded}
              />
            ))}
            {filteredFiles.length === 0 && (
              <div className="col-span-full text-center text-sm text-muted-foreground py-8">لا توجد نتائج مطابقة</div>
            )}
          </div>
        </div>
        )}

        {/* Preview pane */}
        <div className={standaloneDdsMode ? "w-full max-w-md mx-auto p-4 flex flex-col gap-3" : "w-full md:w-80 shrink-0 border-t md:border-t-0 md:border-r border-border p-4 flex flex-col gap-3"}>
          {!selectedEntry ? (
            <p className="text-sm text-muted-foreground text-center mt-8">اختر صورة من القائمة للمعاينة</p>
          ) : (
            <>
              <div className="font-mono text-xs text-muted-foreground break-all">{selectedEntry.path}</div>
              <div
                className="w-full aspect-square rounded flex items-center justify-center overflow-hidden"
                style={{ backgroundImage: "repeating-conic-gradient(#88888844 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" }}
              >
                {selectedLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                ) : selectedDecoded?.kind === "ok" ? (
                  previewNaiveFilter || previewSuspicious ? (
                    <canvas ref={previewCanvasRef} className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />
                  ) : (
                    <img src={selectedDecoded.dataUrl} alt="" className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />
                  )
                ) : selectedDecoded?.kind === "unsupported" ? (
                  <div className="text-center text-xs text-muted-foreground p-3 space-y-1.5">
                    <ImageOff className="w-6 h-6 mx-auto" />
                    <div>صيغة ضغط غير مدعومة للعرض حالياً</div>
                    <div className="font-mono text-[10px] leading-relaxed">
                      fourCC: {selectedDecoded.fourCC || "بدون fourCC"}<br />
                      dwFlags: {selectedDecoded.ddspfFlags}<br />
                      dwRGBBitCount: {selectedDecoded.rgbBitCount}
                    </div>
                    <div>يمكنك تصدير DDS الخام لفتحه ببرنامج خارجي</div>
                  </div>
                ) : selectedDecoded?.kind === "error" ? (
                  <div className="text-center text-xs text-destructive p-3 flex flex-col items-center gap-1.5">
                    <AlertTriangle className="w-6 h-6" />
                    {selectedDecoded.message}
                  </div>
                ) : null}
              </div>
              {selectedDecoded?.kind === "ok" && (() => {
                const d = selectedDecoded;
                const formatLabel = d.fourCC
                  ? d.fourCC
                  : `غير مضغوط ${d.rgbBitCount}bpp`;
                const alphaLabel = d.aMask === 0 && !d.fourCC
                  ? "بلا قناة ألفا"
                  : d.hasAnyAlpha
                    ? "ألفا: نعم"
                    : "ألفا: كلها معتمة";
                return (
                  <div className="text-xs text-muted-foreground text-center space-y-0.5">
                    <div>{d.width}×{d.height} — {formatLabel} — {formatBytes(selectedEntry.size)}</div>
                    <div className={d.hasAnyAlpha ? "text-emerald-600" : "text-amber-600"}>{alphaLabel}</div>
                  </div>
                );
              })()}

              {selectedDecoded?.kind === "ok" && (
                <div className="flex flex-col gap-1.5 p-2 rounded border border-border bg-muted/30">
                  <div className="text-[11px] font-medium">🎮 معاينة تقريبية (ليست اللعبة الحقيقية)</div>
                  <Button
                    size="sm"
                    variant={previewNaiveFilter ? "default" : "outline"}
                    onClick={() => setPreviewNaiveFilter((v) => !v)}
                  >
                    🔍 محاكاة تنعيم كرت الشاشة
                  </Button>
                  <Button
                    size="sm"
                    variant={previewSuspicious ? "default" : "outline"}
                    onClick={() => setPreviewSuspicious((v) => !v)}
                  >
                    ⚠️ تمييز البكسلات المشبوهة
                  </Button>
                  <p className="text-[10px] text-muted-foreground">
                    تقريب يستهدف نفس نوع الخلل الذي واجهناه (تسرّب لون أسود عند الحواف) — وليس ضماناً بمطابقة اللعبة الحقيقية.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={handleExportPng} disabled={selectedDecoded?.kind !== "ok"}>
                  <ImageDown className="w-3.5 h-3.5 ml-1" /> تنزيل PNG
                </Button>
                <Button size="sm" variant="outline" onClick={handleExportRawDds}>
                  <Download className="w-3.5 h-3.5 ml-1" /> تنزيل DDS الخام
                </Button>
                <Button
                  size="sm"
                  onClick={() => replaceInputRef.current?.click()}
                  disabled={busyPath === selectedEntry.path}
                  style={{ backgroundColor: ACCENT, color: "white" }}
                >
                  {busyPath === selectedEntry.path ? (
                    <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" />
                  ) : (
                    <Replace className="w-3.5 h-3.5 ml-1" />
                  )}
                  استبدال...
                </Button>
                <input
                  ref={replaceInputRef}
                  type="file"
                  accept=".png,.dds"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handleReplaceSelected(f);
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  PNG بنفس أبعاد الصورة الأصلية يُرمَّز تلقائياً؛ أو ملف DDS جاهز بنفس الأبعاد والصيغة والحجم بالضبط.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCompositeMode(true)}
                  disabled={selectedDecoded?.kind !== "ok"}
                >
                  <Crop className="w-3.5 h-3.5 ml-1" /> تركيب صورة داخل منطقة محددة
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  لصور تحوي عدة عناصر مجمّعة (مثل شعار داخل أطلس) — حدّد منطقة الشعار بالسحب واستبدلها فقط، بلا تغيير بقية الصورة أو شفافيتها.
                </p>
              </div>

              {modifiedLog.has(selectedEntry.path) && fileHandle && (
                <Button size="sm" variant="ghost" onClick={() => handleUndo(selectedEntry.path)} disabled={busyPath === selectedEntry.path}>
                  <Undo2 className="w-3.5 h-3.5 ml-1" /> تراجع عن هذا التعديل
                </Button>
              )}
            </>
          )}

          {modifiedLog.size > 0 && (
            <div className="mt-auto pt-3 border-t border-border">
              <div className="text-xs font-display font-bold mb-2">تعديلات هذه الجلسة ({modifiedLog.size})</div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {Array.from(modifiedLog.keys()).map((path) => (
                  <li key={path} className="text-[11px] font-mono text-muted-foreground truncate">{path}</li>
                ))}
              </ul>
              {!fileHandle && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  بلا كتابة مباشرة — كل تعديل نزّل ملفاً + سكربت حقن منفصل.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
