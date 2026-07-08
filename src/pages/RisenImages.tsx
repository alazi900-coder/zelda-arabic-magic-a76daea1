import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FolderOpen, Loader2, AlertTriangle, Download, ImageDown,
  Replace, Undo2, Search, ChevronDown, ChevronUp, ImageOff,
} from "lucide-react";
import {
  parseImagesPakHeader, parseImagesPakFileInfoTree, flattenPakTree,
  type RisenPakHeader, type RisenPakFlatFile,
} from "@/lib/risen-images-pak";
import { extractDdsFromXimg, spliceReplacementDds, validateReplacementDds, buildDdsFile, decodeDdsToRgba } from "@/lib/risen-ximg";
import { encodeDxt, isDxtFourCC } from "@/lib/risen-dxt-codec";
import { classifyImagePath, buildImageSections, type ImageSectionCount } from "@/lib/risen/image-categories";

const ACCENT = "#4a7c3f";

/** Result of decoding one .ximg entry for preview: a rendered image, a
 * recognized-but-unsupported pixel format (with diagnostic fields instead of
 * a silent blank card), or a hard read/parse error (e.g. a stale file handle). */
type ThumbResult =
  | { kind: "ok"; dataUrl: string; width: number; height: number; fourCC: string }
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
  const blob = new Blob([bytes], { type: "application/octet-stream" });
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
    return { kind: "ok", dataUrl: canvas.toDataURL("image/png"), width: decoded.width, height: decoded.height, fourCC: decoded.fourCC };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("تعذّرت قراءة ملف الصورة")); };
    img.src = url;
  });
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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [treeSizeWarning, setTreeSizeWarning] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedDecoded, setSelectedDecoded] = useState<ThumbResult | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [decodedCache, setDecodedCache] = useState<Map<string, ThumbResult>>(new Map());

  const [modifiedLog, setModifiedLog] = useState<Map<string, ModifiedRecord>>(new Map());
  const firstWriteConfirmedRef = useRef(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

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

  const handleClose = useCallback(() => {
    setFileHandle(null);
    setFile(null);
    setHeader(null);
    setFlatFiles([]);
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
      "أنت على وشك تعديل ملف images.pak مباشرة. يُنصح بعمل نسخة احتياطية من الملف قبل المتابعة.\n\nهل تريد الاستمرار؟"
    );
    if (ok) firstWriteConfirmedRef.current = true;
    return ok;
  }, []);

  const handleReplaceSelected = useCallback(async (importFile: File) => {
    if (!selectedEntry || !file) return;
    const { toast } = await import("sonner");
    setBusyPath(selectedEntry.path);
    try {
      const originalBuf = await file.slice(selectedEntry.offset, selectedEntry.offset + selectedEntry.size).arrayBuffer();
      const originalXimg = new Uint8Array(originalBuf);
      const original = extractDdsFromXimg(originalXimg);

      let newDdsBytes: Uint8Array;
      const lowerName = importFile.name.toLowerCase();
      if (lowerName.endsWith(".dds")) {
        newDdsBytes = new Uint8Array(await importFile.arrayBuffer());
      } else {
        if (!isDxtFourCC(original.fourCC)) {
          toast.error(`صيغة ضغط الصورة الأصلية (${original.fourCC}) غير مدعومة للترميز التلقائي — استورد ملف DDS جاهزاً بنفس الصيغة بدلاً من PNG`);
          return;
        }
        const img = await loadImageElement(importFile);
        const canvas = document.createElement("canvas");
        canvas.width = original.width;
        canvas.height = original.height;
        const ctx = canvas.getContext("2d")!;
        // Forced resize to match the original exactly, same convention as the WILAY tool.
        ctx.drawImage(img, 0, 0, original.width, original.height);
        const imageData = ctx.getImageData(0, 0, original.width, original.height);
        const compressed = encodeDxt(original.fourCC, new Uint8Array(imageData.data), original.width, original.height);
        newDdsBytes = buildDdsFile(original.fourCC, original.width, original.height, compressed);
      }

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

      let freshFile: File | null = null;
      if (fileHandle) {
        const writable = await fileHandle.createWritable({ keepExistingData: true });
        await writable.write({ type: "write", position: selectedEntry.offset, data: rebuiltXimg });
        await writable.close();
        // Chrome invalidates previously-obtained File snapshots for a handle once it's
        // been written to — re-acquire a fresh one or every subsequent read (including
        // the re-preview below) throws NotReadableError ("تعذر قراءة الملف المطلوب...").
        freshFile = await fileHandle.getFile();
        setFile(freshFile);
        toast.success(`تم حقن الصورة الجديدة مباشرة في images.pak (${selectedEntry.path})`);
      } else {
        const shortName = selectedEntry.path.slice(selectedEntry.path.lastIndexOf("/") + 1);
        downloadBlob(rebuiltXimg, shortName);
        const script = buildPowerShellPatchScript(selectedEntry.offset, rebuiltXimg.length, shortName);
        downloadText(script, `inject-${shortName}.ps1`);
        toast.info("متصفحك لا يدعم الكتابة المباشرة — تم تنزيل الملف المعدّل + سكربت PowerShell لحقنه يدوياً");
      }

      invalidateEntry(selectedEntry.path);
      await handleSelect(selectedEntry, freshFile || undefined);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPath(null);
    }
  }, [selectedEntry, file, fileHandle, confirmFirstWriteIfNeeded, invalidateEntry, handleSelect]);

  const handleUndo = useCallback(async (path: string) => {
    const record = modifiedLog.get(path);
    const entry = flatFiles.find((f) => f.path === path);
    if (!record || !entry || !fileHandle) return;
    const { toast } = await import("sonner");
    setBusyPath(path);
    try {
      const writable = await fileHandle.createWritable({ keepExistingData: true });
      await writable.write({ type: "write", position: entry.offset, data: record.originalXimgBytes });
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

  const handleExportPng = useCallback(() => {
    if (!selectedDecoded || selectedDecoded.kind !== "ok" || !selectedEntry) return;
    const shortName = selectedEntry.path.slice(selectedEntry.path.lastIndexOf("/") + 1).replace(/\.ximg$/i, "");
    const a = document.createElement("a");
    a.href = selectedDecoded.dataUrl;
    a.download = `${shortName}.png`;
    a.click();
  }, [selectedDecoded, selectedEntry]);

  const handleExportRawDds = useCallback(async () => {
    if (!selectedEntry || !file) return;
    const buf = await file.slice(selectedEntry.offset, selectedEntry.offset + selectedEntry.size).arrayBuffer();
    const { ddsBytes } = extractDdsFromXimg(new Uint8Array(buf));
    const shortName = selectedEntry.path.slice(selectedEntry.path.lastIndexOf("/") + 1).replace(/\.ximg$/i, "");
    downloadBlob(ddsBytes, `${shortName}.dds`);
  }, [selectedEntry, file]);

  // ==========================================================================

  if (!file || !header) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center" dir="rtl">
        <Link to="/risen" className="absolute top-4 right-4">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> رجوع</Button>
        </Link>
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6" style={{ backgroundColor: `${ACCENT}1a` }}>
          <span className="text-3xl">🖼️</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-display font-bold mb-3">أداة صور Risen 1</h1>
        <p className="text-muted-foreground mb-8 max-w-lg font-body">
          افتح ملف <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">images.pak</code> لعرض واستخراج وتعديل صوره
          (شاشات التحميل، صور الواجهة، أيقونات الإنجازات) — بدون تحميل الملف كاملاً للذاكرة.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> جارٍ قراءة الملف...
          </div>
        ) : (
          <>
            {fsaSupported ? (
              <Button size="lg" onClick={handleOpenFsa} className="font-display font-bold text-lg px-10 py-6" style={{ backgroundColor: ACCENT, color: "white" }}>
                <FolderOpen className="w-5 h-5 ml-2" /> افتح images.pak
              </Button>
            ) : (
              <>
                <Button size="lg" onClick={() => fileInputRef.current?.click()} className="font-display font-bold text-lg px-10 py-6" style={{ backgroundColor: ACCENT, color: "white" }}>
                  <FolderOpen className="w-5 h-5 ml-2" /> افتح images.pak
                </Button>
                <input ref={fileInputRef} type="file" accept=".pak" className="hidden" onChange={handlePlainInput} />
                <p className="text-xs text-muted-foreground mt-4 max-w-md">
                  متصفحك لا يدعم الكتابة المباشرة بالملف (متاحة في Chrome/Edge). يمكنك التصفح والمعاينة والتصدير هنا بلا مشاكل،
                  لكن استبدال صورة سيُنزّل الملف المعدّل + سكربت PowerShell لحقنه يدوياً بدل الكتابة المباشرة.
                </p>
              </>
            )}
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

      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Sidebar: filters + thumbnail grid */}
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

        {/* Preview pane */}
        <div className="w-full md:w-80 shrink-0 border-t md:border-t-0 md:border-r border-border p-4 flex flex-col gap-3">
          {!selectedEntry ? (
            <p className="text-sm text-muted-foreground text-center mt-8">اختر صورة من القائمة للمعاينة</p>
          ) : (
            <>
              <div className="font-mono text-xs text-muted-foreground break-all">{selectedEntry.path}</div>
              <div className="w-full aspect-square rounded bg-muted/40 flex items-center justify-center overflow-hidden">
                {selectedLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                ) : selectedDecoded?.kind === "ok" ? (
                  <img src={selectedDecoded.dataUrl} alt="" className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />
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
              {selectedDecoded?.kind === "ok" && (
                <div className="text-xs text-muted-foreground text-center">
                  {selectedDecoded.width}×{selectedDecoded.height} — {selectedDecoded.fourCC || "غير مضغوط"} — {formatBytes(selectedEntry.size)}
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
    </div>
  );
}
