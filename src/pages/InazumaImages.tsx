import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FolderOpen, Loader2, AlertTriangle, Download, ImageDown,
  Replace, Undo2, Search, ChevronDown, ChevronUp, ImageOff, Crop, X,
  ZoomIn, ZoomOut, Maximize, Eraser, Target, ChevronLeft, ChevronRight, Save, Wand2,
  PackageOpen, Check,
} from "lucide-react";
import {
  readInazumaContainers, inazumaContainerImages, parseInazumaImage,
  inazumaImageWidths, guessInazumaImageWidth, renderInazumaImage, encodeInazumaImage,
  buildInazumaImagesRom, classifyInazumaImage, buildInazumaImageSections,
  restoreOriginalBackground, overlayBackgroundMask, overlayEdgeColour,
  type InazumaImageRef,
} from "@/lib/inazuma/inazuma-images";
import { inazumaImageShortName, inazumaImageZipPath, inazumaZipMatcher } from "@/lib/inazuma/inazuma-zip-import";
import { looksLikeNdsRom } from "@/lib/nds/nds-rom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  compositeIntoRegion, detectRegionBounds, scaleRgbaContainFit, scaleRgbaStretch, cropRegion,
  type CompositeRect,
} from "@/lib/risen-image-composite";
import { decodePngRawNoCanvas } from "@/lib/png-decode";
import { encodePngRawNoCanvas } from "@/lib/png-encode";

/**
 * Inazuma Eleven's picture tool: the Risen images tool's layout and tools
 * (browse by section, preview, export, replace, composite into a region,
 * erase from a clean patch, undo), on the DS ROM's pic2d/pic3d pictures.
 *
 * The one thing Risen never needed: these files do not store a picture's
 * width, so each picture has a width stepper. The guess is usually right; a
 * torn picture is one click away from the right layout, and the choice is
 * remembered. Edits stay in memory and "حفظ الروم" writes one new ROM.
 */

const ACCENT = "#1d6fb8";
const WIDTHS_KEY = "inazuma-image-widths";

/** One picture from an Arabised ZIP, ready to write, waiting for review. */
interface PendingZipImage {
  id: string;
  name: string;
  width: number;
  /** What will be written, background already restored, at `width`. */
  rgba: Uint8ClampedArray;
  beforeUrl: string;
  /** How it will look in the game: after the game's own colours are applied. */
  afterUrl: string;
}

interface ZipReport { replaced: number; unchanged: number; declined: number; merged: number; problems: string[] }

type ThumbResult =
  | {
      kind: "ok"; dataUrl: string; width: number; height: number; rgba: Uint8ClampedArray;
      widths: number[]; guessed: boolean; format: string;
    }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

/** Scales `img` to fit inside w×h without distorting it, centred, transparent padding. */
function getScaledImageRgba(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const naturalW = img.naturalWidth || w;
  const naturalH = img.naturalHeight || h;
  const scale = Math.min(w / naturalW, h / naturalH);
  ctx.drawImage(img, (w - naturalW * scale) / 2, (h - naturalH * scale) / 2, naturalW * scale, naturalH * scale);
  return ctx.getImageData(0, 0, w, h).data;
}

function rgbaToDataUrl(rgba: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

function displayPath(ref: InazumaImageRef): string {
  return ref.entryName ? `${ref.romPath.replace(/^data_iz\//, "")} › ${ref.entryName}` : ref.romPath.replace(/^data_iz\//, "");
}

function loadSavedWidths(): Map<string, number> {
  try {
    const raw = localStorage.getItem(WIDTHS_KEY);
    return raw ? new Map(Object.entries(JSON.parse(raw) as Record<string, number>)) : new Map();
  } catch {
    return new Map();
  }
}

function saveWidths(widths: Map<string, number>): void {
  try {
    localStorage.setItem(WIDTHS_KEY, JSON.stringify(Object.fromEntries(widths)));
  } catch { /* a remembered width is a convenience only */ }
}

// ============================================================================
// Lazy thumbnail cell — decodes only once it is actually scrolled into view.
// ============================================================================

function LazyThumb({
  entry, revision, decode, selected, modified, onSelect, checked, onToggleCheck,
}: {
  entry: InazumaImageRef;
  revision: string;
  decode: (entry: InazumaImageRef) => ThumbResult;
  selected: boolean;
  modified: boolean;
  onSelect: () => void;
  checked: boolean;
  onToggleCheck: () => void;
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

  const decodeRef = useRef(decode);
  decodeRef.current = decode;

  useEffect(() => {
    if (!visible) return;
    // Yield first so a screenful of thumbnails does not freeze the page.
    const t = setTimeout(() => setResult(decodeRef.current(entry)), 0);
    return () => clearTimeout(t);
  }, [visible, entry, revision]);

  const name = entry.entryName ?? entry.romPath.slice(entry.romPath.lastIndexOf("/") + 1);

  return (
    <div className="relative">
    <button
      ref={ref}
      onClick={onSelect}
      className={`w-full flex flex-col gap-1 p-2 rounded border text-right transition-colors ${
        checked ? "border-emerald-500 bg-emerald-500/10" : selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
      }`}
      title={displayPath(entry)}
    >
      <div className="relative w-full aspect-square rounded bg-muted/40 flex items-center justify-center overflow-hidden">
        {result?.kind === "ok" ? (
          <img src={result.dataUrl} alt={name} className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />
        ) : result ? (
          <ImageOff className="w-5 h-5 text-muted-foreground" />
        ) : visible ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : null}
        {modified && <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-emerald-500" title="معدّلة" />}
      </div>
      <span className="text-[10px] text-muted-foreground truncate font-mono">{name}</span>
    </button>
    <label className="absolute top-1 right-1 p-1.5 cursor-pointer" title="تحديد للتحميل في ZIP">
      <input type="checkbox" checked={checked} onChange={onToggleCheck} className="w-4 h-4 accent-emerald-500 cursor-pointer" />
    </label>
    </div>
  );
}

// ============================================================================

export default function InazumaImages() {
  const [romName, setRomName] = useState<string | null>(null);
  const [rom, setRom] = useState<Uint8Array | null>(null);
  /** Every picture file, unpacked; an edited file's entry is replaced by its edited copy. */
  const [containers, setContainers] = useState<Map<string, Uint8Array>>(new Map());
  const [refs, setRefs] = useState<InazumaImageRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Bumped per picture whenever its bytes or its width change, to redraw it. */
  const [revisions, setRevisions] = useState<Map<string, number>>(new Map());
  const [widths, setWidths] = useState<Map<string, number>>(() => loadSavedWidths());
  const guessCache = useRef(new Map<string, number>());

  /** The entry's bytes as they were in the loaded ROM, for undo. */
  const [modifiedLog, setModifiedLog] = useState<Map<string, Uint8Array>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Pictures ticked for "تحميل المحدد ZIP". */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [zipImporting, setZipImporting] = useState(false);
  const [zipReview, setZipReview] = useState<{ items: PendingZipImage[]; unchanged: number; problems: string[] } | null>(null);
  const [reviewChecked, setReviewChecked] = useState<Set<number>>(new Set());
  const [reviewOpen, setReviewOpen] = useState<number | null>(null);
  const [zipReport, setZipReport] = useState<ZipReport | null>(null);
  const zipImportRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [useOriginalAlpha, setUseOriginalAlpha] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Region-composite mode: drag-select a rectangle on the current image, then
  // paste a replacement image (e.g. an Arabic word) into just that region.
  const [compositeMode, setCompositeMode] = useState(false);
  const [selectionRect, setSelectionRect] = useState<CompositeRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [compositeOverlayFile, setCompositeOverlayFile] = useState<File | null>(null);
  const [compositeOverlayImg, setCompositeOverlayImg] = useState<HTMLImageElement | null>(null);
  const [pickingEraseSource, setPickingEraseSource] = useState(false);
  const [eraseSourceRect, setEraseSourceRect] = useState<CompositeRect | null>(null);
  const [movingSelectionOffset, setMovingSelectionOffset] = useState<{ dx: number; dy: number } | null>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeOverlayInputRef = useRef<HTMLInputElement>(null);
  const [compositeZoom, setCompositeZoom] = useState(1);
  const compositeScrollRef = useRef<HTMLDivElement>(null);

  const loadRomFromFile = useCallback(async (f: File) => {
    setLoading(true);
    setLoadError(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (!looksLikeNdsRom(bytes)) throw new Error("هذا ليس ملف روم DS صالحاً (.nds)");
      const next = readInazumaContainers(bytes);
      if (next.size === 0) throw new Error("لم أجد مجلدات صور إينازوما (data_iz/pic2d و pic3d) — هل هذا روم Inazuma Eleven؟");
      const list: InazumaImageRef[] = [];
      for (const [p, d] of next) list.push(...inazumaContainerImages(p, d));
      setRom(bytes);
      setRomName(f.name);
      setContainers(next);
      setRefs(list);
      guessCache.current = new Map();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setRom(null);
      setRefs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePlainInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void loadRomFromFile(f);
  }, [loadRomFromFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (loading) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void loadRomFromFile(f);
  }, [loading, loadRomFromFile]);

  const handleClose = useCallback(() => {
    if (modifiedLog.size > 0 && !window.confirm("لديك تعديلات لم تُحفظ في روم. هل تريد الإغلاق وتركها؟")) return;
    setRom(null);
    setRomName(null);
    setContainers(new Map());
    setRefs([]);
    setSelectedId(null);
    setRevisions(new Map());
    setModifiedLog(new Map());
    setChecked(new Set());
    setZipReport(null);
    setActiveFilter("all");
    setSearch("");
  }, [modifiedLog]);

  const sections = useMemo(() => buildInazumaImageSections(refs), [refs]);

  const filteredRefs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return refs.filter((r) => {
      if (activeFilter !== "all" && classifyInazumaImage(r.romPath).id !== activeFilter) return false;
      if (q && !r.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [refs, activeFilter, search]);

  const bump = useCallback((id: string) => {
    setRevisions((prev) => new Map(prev).set(id, (prev.get(id) ?? 0) + 1));
  }, []);

  /** Draws one picture at its chosen (or guessed) width. Never throws. */
  const decode = useCallback((entry: InazumaImageRef): ThumbResult => {
    try {
      const d = containers.get(entry.romPath);
      if (!d) return { kind: "error", message: "الملف غير محمّل" };
      const img = parseInazumaImage(d, entry);
      if (!img) return { kind: "unsupported" };
      const all = inazumaImageWidths(img);
      let width = widths.get(entry.id);
      const guessed = width === undefined || !all.includes(width);
      if (guessed) {
        width = guessCache.current.get(entry.id);
        if (width === undefined) {
          width = all.length > 1 ? guessInazumaImageWidth(d, img) : all[0];
          guessCache.current.set(entry.id, width);
        }
      }
      const r = renderInazumaImage(d, img, width as number);
      const colours = img.kind === "tiled" ? `${img.palettes.length > 1 ? `${img.palettes.length}×` : ""}16 لوناً` : `${img.palette.length} لوناً`;
      return {
        kind: "ok",
        dataUrl: rgbaToDataUrl(r.rgba, r.width, r.height),
        width: r.width,
        height: r.height,
        rgba: r.rgba,
        widths: all,
        guessed,
        format: img.kind === "tiled" ? `مربّعات 8×8 — ${colours}` : `نسيج ${img.bpp}bpp — ${colours}`,
      };
    } catch (e) {
      return { kind: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }, [containers, widths]);

  const selectedEntry = useMemo(() => refs.find((r) => r.id === selectedId) || null, [refs, selectedId]);
  const selectedRevision = selectedEntry ? `${revisions.get(selectedEntry.id) ?? 0}:${widths.get(selectedEntry.id) ?? "a"}` : "";
  const selectedDecoded = useMemo(
    () => (selectedEntry ? decode(selectedEntry) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedEntry, selectedRevision, decode]
  );

  const setWidthFor = useCallback((id: string, width: number | null) => {
    setWidths((prev) => {
      const next = new Map(prev);
      if (width === null) next.delete(id); else next.set(id, width);
      saveWidths(next);
      return next;
    });
    bump(id);
  }, [bump]);

  /** Writes `rgba` (at the picture's current layout) into the entry; the common
   * tail of both the whole-picture replace and the region composite. */
  const applyRgba = useCallback(async (entry: InazumaImageRef, width: number, rgba: Uint8ClampedArray, note = "") => {
    const { toast } = await import("sonner");
    const current = containers.get(entry.romPath);
    if (!current) return;
    const d = current.slice();
    const img = parseInazumaImage(d, entry);
    if (!img) { toast.error("صيغة هذه الصورة غير مدعومة للكتابة"); return; }
    const { merged } = encodeInazumaImage(d, img, width, rgba);
    setModifiedLog((prev) => {
      if (prev.has(entry.id)) return prev;
      return new Map(prev).set(entry.id, current.slice(entry.dataOffset, entry.dataOffset + entry.size));
    });
    setContainers((prev) => new Map(prev).set(entry.romPath, d));
    bump(entry.id);
    toast.success(
      merged > 0
        ? `تم الاستبدال — دُمج ${merged} مربّعاً متشابهاً لأن مساحة الصورة لا تتّسع لكل المربّعات الجديدة`
        : "تم الاستبدال — اضغط «حفظ الروم» لتنزيل الروم المعدّل",
      note ? { description: note } : undefined
    );
  }, [containers, bump]);

  const handleReplaceSelected = useCallback(async (importFile: File) => {
    if (!selectedEntry || selectedDecoded?.kind !== "ok") return;
    const { toast } = await import("sonner");
    setBusyId(selectedEntry.id);
    try {
      const { width, height } = selectedDecoded;
      const pngBytes = new Uint8Array(await importFile.arrayBuffer());
      // Decode the PNG's own pixels when the size already matches (the usual
      // "re-import the exported PNG" case): Canvas2D rounds soft alpha edges.
      const direct = await decodePngRawNoCanvas(pngBytes);
      let rgba: Uint8ClampedArray;
      if (direct && direct.width === width && direct.height === height) {
        rgba = new Uint8ClampedArray(direct.rgba);
      } else {
        const img = await loadImageElement(importFile);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        rgba = ctx.getImageData(0, 0, width, height).data;
        if (direct) toast.info(`أبعاد الصورة ${direct.width}×${direct.height} لا تطابق الأصل ${width}×${height} — غُيّر حجمها لتطابقه`);
      }
      if (useOriginalAlpha) {
        for (let i = 3; i < rgba.length; i += 4) rgba[i] = selectedDecoded.rgba[i];
      }
      // A picture drawn on a background of its own gets the original's back.
      const restored = restoreOriginalBackground(rgba, selectedDecoded.rgba, width, height);
      await applyRgba(selectedEntry, width, rgba, restored > 0 ? `أُعيدت الخلفية الأصلية تلقائياً (${restored} بكسل)` : "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }, [selectedEntry, selectedDecoded, useOriginalAlpha, applyRgba]);

  const handleUndo = useCallback(async (id: string) => {
    const original = modifiedLog.get(id);
    const entry = refs.find((r) => r.id === id);
    if (!original || !entry) return;
    const { toast } = await import("sonner");
    const current = containers.get(entry.romPath);
    if (!current) return;
    const d = current.slice();
    d.set(original, entry.dataOffset);
    setContainers((prev) => new Map(prev).set(entry.romPath, d));
    setModifiedLog((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    bump(id);
    toast.success("تم التراجع عن التعديل");
  }, [modifiedLog, refs, containers, bump]);

  const handleSaveRom = useCallback(async () => {
    if (!rom || !romName || modifiedLog.size === 0) return;
    const { toast } = await import("sonner");
    setSaving(true);
    // Let the spinner paint before the work blocks the page.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const touched = new Map<string, Uint8Array>();
      for (const id of modifiedLog.keys()) {
        const entry = refs.find((r) => r.id === id);
        const d = entry && containers.get(entry.romPath);
        if (entry && d) touched.set(entry.romPath, d);
      }
      const out = buildInazumaImagesRom(rom, touched);
      downloadBlob(out, romName.replace(/\.nds$/i, "") + "-AR-IMG.nds");
      toast.success(`تم بناء الروم — ${modifiedLog.size} صورة في ${touched.size} ملف`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [rom, romName, modifiedLog, refs, containers]);

  /** Every ticked picture as a PNG at its current width, one folder per file. */
  const handleDownloadChecked = useCallback(async () => {
    if (checked.size === 0) return;
    const { toast } = await import("sonner");
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let added = 0;
      for (const id of checked) {
        const entry = refs.find((r) => r.id === id);
        if (!entry) continue;
        const d = decode(entry);
        if (d.kind !== "ok") continue;
        const png = await encodePngRawNoCanvas(d.rgba, d.width, d.height);
        if (!png) continue;
        zip.file(inazumaImageZipPath(entry, d.width, d.height), png);
        added++;
      }
      const bytes = await zip.generateAsync({ type: "uint8array" });
      downloadBlob(bytes, "inazuma-images.zip");
      toast.success(`تم تحميل ${added} صورة في ملف ZIP`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setZipping(false);
    }
  }, [checked, refs, decode]);

  // Import an Arabised ZIP, step 1: match every PNG to its picture by name,
  // lay it out at the width in that name, and keep only the ones that
  // actually change -- for review, nothing written yet.
  const handleImportZip = useCallback(async (zipFile: File) => {
    setZipImporting(true);
    setZipReport(null);
    const items: PendingZipImage[] = [];
    const problems: string[] = [];
    let unchanged = 0;
    try {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(zipFile);
      const match = inazumaZipMatcher(refs);
      const byId = new Map(refs.map((r) => [r.id, r]));
      const reasons: Record<string, string> = {
        "no-size": "لا يحمل العرض والارتفاع في اسمه (مثل _256x24)",
        "no-image": "لا توجد صورة بهذا الاسم في الروم",
        ambiguous: "الاسم يطابق أكثر من صورة — أبقِه داخل مجلده كما خرج",
      };
      const seen = new Set<string>();
      for (const entry of Object.values(zip.files).filter((e) => !e.dir)) {
        const m = match(entry.name);
        if (!m.ok) {
          if (m.reason !== "not-png") problems.push(`${entry.name}: ${reasons[m.reason]}`);
          continue;
        }
        if (seen.has(m.id)) { problems.push(`${entry.name}: صورة ثانية لنفس المكان — تُركت`); continue; }
        const ref = byId.get(m.id)!;
        const d = containers.get(ref.romPath);
        const img = d && parseInazumaImage(d, ref);
        if (!d || !img) { problems.push(`${entry.name}: صيغة هذه الصورة غير مدعومة`); continue; }
        if (!inazumaImageWidths(img).includes(m.width)) { problems.push(`${entry.name}: العرض ${m.width} لا يناسب هذه الصورة`); continue; }
        const before = renderInazumaImage(d, img, m.width);
        if (before.height !== m.height) { problems.push(`${entry.name}: الارتفاع ${m.height} لا يطابق ${before.height}`); continue; }

        const bytes = await entry.async("uint8array");
        const direct = await decodePngRawNoCanvas(bytes);
        let rgba: Uint8ClampedArray;
        if (direct && direct.width === before.width && direct.height === before.height) {
          rgba = new Uint8ClampedArray(direct.rgba);
        } else {
          try {
            const el = await loadImageElement(new File([bytes as BlobPart], "x.png", { type: "image/png" }));
            const canvas = document.createElement("canvas");
            canvas.width = before.width;
            canvas.height = before.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(el, 0, 0, before.width, before.height);
            rgba = ctx.getImageData(0, 0, before.width, before.height).data;
          } catch {
            problems.push(`${entry.name}: ليست صورة PNG صالحة`);
            continue;
          }
        }
        if (useOriginalAlpha) for (let i = 3; i < rgba.length; i += 4) rgba[i] = before.rgba[i];
        restoreOriginalBackground(rgba, before.rgba, before.width, before.height);

        // What the game would show, after its own colours are applied. A
        // picture that comes out the same as today is skipped: re-encoding it
        // would only spend tile slots for nothing.
        const scratch = d.slice();
        encodeInazumaImage(scratch, parseInazumaImage(scratch, ref)!, m.width, rgba);
        const after = renderInazumaImage(scratch, parseInazumaImage(scratch, ref)!, m.width);
        let same = true;
        for (let i = 0; i < after.rgba.length && same; i += 4) {
          if (after.rgba[i + 3] !== before.rgba[i + 3]) same = false;
          else if (after.rgba[i + 3] && (after.rgba[i] !== before.rgba[i] || after.rgba[i + 1] !== before.rgba[i + 1] || after.rgba[i + 2] !== before.rgba[i + 2])) same = false;
        }
        if (same) { unchanged++; continue; }
        seen.add(m.id);
        items.push({
          id: m.id,
          name: ref.entryName ? `${ref.romPath.replace(/^data_iz\//, "")} › ${ref.entryName}` : ref.romPath.replace(/^data_iz\//, ""),
          width: m.width,
          rgba,
          beforeUrl: rgbaToDataUrl(before.rgba, before.width, before.height),
          afterUrl: rgbaToDataUrl(after.rgba, after.width, after.height),
        });
      }
    } catch (e) {
      problems.push(`${zipFile.name}: ليس ملف ZIP صالحاً — ${e instanceof Error ? e.message : String(e)}`);
    }
    setZipImporting(false);
    if (items.length === 0) {
      setZipReport({ replaced: 0, unchanged, declined: 0, merged: 0, problems });
      return;
    }
    setZipReview({ items, unchanged, problems });
    setReviewChecked(new Set(items.map((_, i) => i)));
    setReviewOpen(null);
  }, [refs, containers, useOriginalAlpha]);

  // Step 2: write the chosen pictures, all in one pass over a copy of the
  // unpacked files, and remember the width each was drawn at.
  const applyZipImages = useCallback((chosen: number[]) => {
    if (!zipReview) return;
    const { items, unchanged, problems } = zipReview;
    const byId = new Map(refs.map((r) => [r.id, r]));
    const next = new Map(containers);
    const copied = new Set<string>();
    const originals = new Map<string, Uint8Array>();
    let merged = 0, replaced = 0;
    for (const it of chosen.map((i) => items[i])) {
      const ref = byId.get(it.id);
      const current = ref && containers.get(ref.romPath);
      if (!ref || !current) continue;
      if (!copied.has(ref.romPath)) { next.set(ref.romPath, current.slice()); copied.add(ref.romPath); }
      const d = next.get(ref.romPath)!;
      originals.set(it.id, current.slice(ref.dataOffset, ref.dataOffset + ref.size));
      merged += encodeInazumaImage(d, parseInazumaImage(d, ref)!, it.width, it.rgba).merged;
      replaced++;
    }
    setContainers(next);
    setModifiedLog((prev) => {
      const out = new Map(prev);
      for (const [id, bytes] of originals) if (!out.has(id)) out.set(id, bytes);
      return out;
    });
    setWidths((prev) => {
      const out = new Map(prev);
      for (const i of chosen) out.set(items[i].id, items[i].width);
      saveWidths(out);
      return out;
    });
    setRevisions((prev) => {
      const out = new Map(prev);
      for (const i of chosen) out.set(items[i].id, (out.get(items[i].id) ?? 0) + 1);
      return out;
    });
    setZipReview(null);
    setReviewOpen(null);
    setZipReport({ replaced, unchanged, declined: items.length - chosen.length, merged, problems });
  }, [zipReview, refs, containers]);

  const handleExportPng = useCallback(async () => {
    if (selectedDecoded?.kind !== "ok" || !selectedEntry) return;
    const name = `${inazumaImageShortName(selectedEntry)}_${selectedDecoded.width}x${selectedDecoded.height}.png`;
    // Encoded straight from the pixels: a canvas export zeroes the colour of
    // transparent pixels.
    const png = await encodePngRawNoCanvas(selectedDecoded.rgba, selectedDecoded.width, selectedDecoded.height);
    if (png) { downloadBlob(png, name); return; }
    const a = document.createElement("a");
    a.href = selectedDecoded.dataUrl;
    a.download = name;
    a.click();
  }, [selectedDecoded, selectedEntry]);

  const handleExportRaw = useCallback(() => {
    if (!selectedEntry) return;
    const d = containers.get(selectedEntry.romPath);
    if (!d) return;
    downloadBlob(d.slice(selectedEntry.dataOffset, selectedEntry.dataOffset + selectedEntry.size), `${inazumaImageShortName(selectedEntry)}.bin`);
  }, [selectedEntry, containers]);

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

  const [compositeBaseImageData, setCompositeBaseImageData] = useState<ImageData | null>(null);
  useEffect(() => {
    if (!compositeMode || selectedDecoded?.kind !== "ok") {
      setCompositeBaseImageData(null);
      return;
    }
    setCompositeBaseImageData(new ImageData(new Uint8ClampedArray(selectedDecoded.rgba), selectedDecoded.width, selectedDecoded.height));
    // Only on entering the mode: erasing edits this copy, a redraw must not undo it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compositeMode]);

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
    const x = Math.round((e.clientX - rect.left) * (selectedDecoded.width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (selectedDecoded.height / rect.height));
    return {
      x: Math.max(0, Math.min(selectedDecoded.width, x)),
      y: Math.max(0, Math.min(selectedDecoded.height, y)),
    };
  }, [selectedDecoded]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = getImagePixelCoords(e);
    if (!p) return;
    if (pickingEraseSource) {
      setDragStart(p);
      setEraseSourceRect({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
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
      setEraseSourceRect({
        x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y),
        w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y),
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
      x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y),
      w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y),
    });
  }, [dragStart, getImagePixelCoords, pickingEraseSource, movingSelectionOffset, selectionRect, selectedDecoded]);

  /** A click that barely moved auto-detects the element under it. */
  const handleCanvasMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const start = dragStart;
    const wasMovingSelection = !!movingSelectionOffset;
    setDragStart(null);
    setMovingSelectionOffset(null);
    if (pickingEraseSource) {
      setPickingEraseSource(false);
      return;
    }
    if (wasMovingSelection) return;
    if (!start || !compositeBaseImageData || selectedDecoded?.kind !== "ok") return;
    const p = getImagePixelCoords(e);
    if (!p) return;
    if (Math.abs(p.x - start.x) > 3 || Math.abs(p.y - start.y) > 3) return;
    setSelectionRect(detectRegionBounds(compositeBaseImageData.data, selectedDecoded.width, selectedDecoded.height, start.x, start.y));
  }, [dragStart, movingSelectionOffset, getImagePixelCoords, compositeBaseImageData, selectedDecoded, pickingEraseSource]);

  const handleCanvasMouseLeave = useCallback(() => { setDragStart(null); setMovingSelectionOffset(null); }, []);

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

  const handleExportSelectedRegionPng = useCallback(async () => {
    if (!compositeBaseImageData || !selectionRect || selectionRect.w <= 0 || selectionRect.h <= 0 || !selectedEntry) return;
    const cropped = cropRegion(compositeBaseImageData.data, compositeBaseImageData.width, compositeBaseImageData.height, selectionRect);
    const pngBytes = await encodePngRawNoCanvas(cropped, selectionRect.w, selectionRect.h);
    if (!pngBytes) return;
    downloadBlob(pngBytes, `${inazumaImageShortName(selectedEntry)}-region-${selectionRect.x}x${selectionRect.y}.png`);
  }, [compositeBaseImageData, selectionRect, selectedEntry]);

  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 16;

  const handleCompositeWheelZoom = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setCompositeZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, e.deltaY < 0 ? z * 1.2 : z / 1.2)));
  }, []);

  const fitCompositeZoomToContainer = useCallback(() => {
    if (selectedDecoded?.kind !== "ok") return;
    const container = compositeScrollRef.current;
    if (!container) return;
    const fit = Math.min(container.clientWidth / selectedDecoded.width, container.clientHeight / selectedDecoded.height);
    if (Number.isFinite(fit) && fit > 0) setCompositeZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit)));
  }, [selectedDecoded]);

  useEffect(() => {
    if (!compositeMode) return;
    const raf = requestAnimationFrame(() => fitCompositeZoomToContainer());
    return () => cancelAnimationFrame(raf);
  }, [compositeMode, fitCompositeZoomToContainer]);

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
    if (!selectedEntry || selectedDecoded?.kind !== "ok" || !compositeOverlayImg || !compositeOverlayFile || !selectionRect || selectionRect.w <= 0 || selectionRect.h <= 0 || !compositeBaseImageData) return;
    const { toast } = await import("sonner");
    setBusyId(selectedEntry.id);
    try {
      const { width, height } = selectedDecoded;
      const overlayBytes = new Uint8Array(await compositeOverlayFile.arrayBuffer());
      const direct = await decodePngRawNoCanvas(overlayBytes);
      const overlay = direct
        ? scaleRgbaContainFit(direct.rgba, direct.width, direct.height, selectionRect.w, selectionRect.h)
        : getScaledImageRgba(compositeOverlayImg, selectionRect.w, selectionRect.h);
      const composited = new Uint8ClampedArray(compositeIntoRegion(compositeBaseImageData.data, width, height, overlay, selectionRect));
      // The overlay's own background (its edge colour, or transparent) keeps
      // the picture underneath, so the word lands on the button cut out.
      const edge = direct ? overlayEdgeColour(direct.rgba, direct.width, direct.height) : overlayEdgeColour(overlay, selectionRect.w, selectionRect.h);
      const mask = overlayBackgroundMask(overlay, selectionRect.w, selectionRect.h, edge);
      for (let y = 0; y < selectionRect.h; y++) for (let x = 0; x < selectionRect.w; x++) {
        if (!mask[y * selectionRect.w + x]) continue;
        const dx = selectionRect.x + x, dy = selectionRect.y + y;
        if (dx >= width || dy >= height) continue;
        const o = (dy * width + dx) * 4;
        for (let k = 0; k < 4; k++) composited[o + k] = compositeBaseImageData.data[o + k];
      }
      if (useOriginalAlpha) {
        const x0 = Math.floor(selectionRect.x), y0 = Math.floor(selectionRect.y);
        const x1 = Math.min(width, x0 + Math.floor(selectionRect.w));
        const y1 = Math.min(height, y0 + Math.floor(selectionRect.h));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4 + 3;
          composited[i] = selectedDecoded.rgba[i];
        }
      }
      await applyRgba(selectedEntry, width, composited);
      exitCompositeMode();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }, [selectedEntry, selectedDecoded, compositeOverlayImg, compositeOverlayFile, selectionRect, compositeBaseImageData, useOriginalAlpha, applyRgba, exitCompositeMode]);

  // ==========================================================================

  if (!rom) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center px-4 text-center transition-colors ${dragOver ? "bg-primary/5" : ""}`}
        dir="rtl"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Link to="/inazuma" className="absolute top-4 right-4">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> رجوع</Button>
        </Link>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: `${ACCENT}1a` }}>
          <span className="text-3xl">🖼️</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-display font-bold mb-3">أداة صور Inazuma Eleven</h1>
        <p className="text-muted-foreground mb-8 max-w-lg font-body">
          افتح روم <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">.nds</code> لعرض واستخراج وتعديل صوره
          (القوائم، شاشة العنوان، واجهات المباراة، الصور ثلاثية الأبعاد) — أو اسحب الملف وأفلته هنا.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> جارٍ قراءة الروم...
          </div>
        ) : (
          <>
            <Button size="lg" onClick={() => fileInputRef.current?.click()} className="font-display font-bold text-lg px-10 py-6" style={{ backgroundColor: ACCENT, color: "white" }}>
              <FolderOpen className="w-5 h-5 ml-2" /> افتح روم إينازوما
            </Button>
            <input ref={fileInputRef} type="file" accept=".nds" className="hidden" onChange={handlePlainInput} />
            <p className="text-xs text-muted-foreground mt-4 max-w-md">
              الروم ٢٥٦ ميغابايت ويُقرأ في المتصفّح — استعمل حاسوباً. التعديلات تبقى في الذاكرة حتى تضغط «حفظ الروم»،
              فيُنزَّل روم جديد والأصلي لا يُمسّ. افتح الروم المعرَّب النصوص لتبقى ترجمته.
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
        <Link to="/inazuma"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> رجوع</Button></Link>
        <span className="font-display font-bold">🖼️ صور Inazuma Eleven</span>
        <span className="text-sm text-muted-foreground font-mono">{romName}</span>
        <span className="text-xs text-muted-foreground">({refs.length} صورة)</span>
        <div className="flex-1" />
        {checked.size > 0 && (
          <>
            <Button size="sm" variant="outline" onClick={handleDownloadChecked} disabled={zipping}>
              {zipping ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Download className="w-4 h-4 ml-1" />}
              تحميل المحدد ZIP ({checked.size})
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
              <X className="w-4 h-4 ml-1" /> إلغاء التحديد
            </Button>
          </>
        )}
        <input
          ref={zipImportRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handleImportZip(f); }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => zipImportRef.current?.click()}
          disabled={zipImporting}
          title="ارفع ZIP بنفس المجلدات والأسماء التي خرجت بها الصور، فتذهب كل صورة إلى مكانها وتراجعها قبل الاستبدال"
        >
          {zipImporting ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <PackageOpen className="w-4 h-4 ml-1" />}
          استيراد ZIP معرّب
        </Button>
        <Button size="sm" onClick={handleSaveRom} disabled={modifiedLog.size === 0 || saving} style={{ backgroundColor: ACCENT, color: "white" }}>
          {saving ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />}
          حفظ الروم ({modifiedLog.size})
        </Button>
        <Button variant="outline" size="sm" onClick={handleClose}>إغلاق</Button>
      </div>

      {zipReport && (
        <div className={`border-b px-4 py-2 flex items-start gap-2 ${zipReport.problems.length > 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-primary/10 border-primary/30"}`}>
          {zipReport.problems.length > 0 ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> : <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
          <div className="flex-1 text-xs space-y-0.5 max-h-32 overflow-y-auto">
            <p className="font-semibold">
              استُبدلت {zipReport.replaced} صورة
              {zipReport.unchanged > 0 && ` • تُخطّيت ${zipReport.unchanged} لم تتغيّر عن الأصل`}
              {zipReport.declined > 0 && ` • رفضتَ ${zipReport.declined} — بقيت كما هي`}
              {zipReport.merged > 0 && ` • دُمج ${zipReport.merged} مربّعاً لضيق المساحة`}
              {zipReport.problems.length > 0 && ` • ${zipReport.problems.length} لم تُطبَّق`}
              {zipReport.replaced > 0 && " — اضغط «حفظ الروم» لتنزيل الروم المعدّل"}
            </p>
            {zipReport.problems.map((p, i) => <p key={i} className="font-mono text-muted-foreground" dir="ltr">{p}</p>)}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setZipReport(null)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {compositeMode && selectedEntry && selectedDecoded?.kind === "ok" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="p-3 border-b border-border flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={exitCompositeMode} className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> رجوع
            </Button>
            <div className="font-mono text-xs text-muted-foreground truncate flex-1 min-w-[140px]">{displayPath(selectedEntry)}</div>
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
            انقر على الكلمة/العنصر لاكتشاف حدوده تلقائياً — أو اسحب لتحديد يدوي، أو اسحب من داخل التحديد الحالي لتحريكه. Ctrl/⌘ + عجلة الفأرة للتكبير، والتمرير العادي للتنقل.
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
                  بعد تحديد منطقة الكلمة الإنجليزية أعلاه، اسحب مربعاً بأي حجم فوق منطقة نظيفة من نفس الصورة (مثل خلفية الزر) — تُحجَّم تلقائياً لتغطية المنطقة القديمة بالكامل. يمكنك أيضاً السحب من داخل المربع الأخضر نفسه لتحريكه لمكان آخر قبل المسح أو اللصق.
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
              <label className="flex items-start gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={useOriginalAlpha} onChange={(e) => setUseOriginalAlpha(e.target.checked)} className="mt-0.5" />
                <span>استخدم شفافية الصورة الأصلية داخل منطقة التركيب (يتجاهل خلفية صورة التركيب ويستخدم مكانها مناطق الشفافية الحقيقية من الأصل)</span>
              </label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleCompositeConfirm}
                  disabled={!compositeOverlayImg || !selectionRect || selectionRect.w <= 0 || selectionRect.h <= 0 || busyId === selectedEntry.id}
                  style={{ backgroundColor: ACCENT, color: "white" }}
                >
                  {busyId === selectedEntry.id ? <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" /> : <Crop className="w-3.5 h-3.5 ml-1" />}
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
                الكل ({refs.length})
              </Button>
              {sections.localization.map((s) => (
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
                  صور اللعبة الأخرى — نادراً ما تحتاج تعريباً
                </button>
                {otherOpen && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {sections.other.map((s) => (
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
            {filteredRefs.map((entry) => (
              <LazyThumb
                key={entry.id}
                entry={entry}
                revision={`${revisions.get(entry.id) ?? 0}:${widths.get(entry.id) ?? "a"}`}
                decode={decode}
                selected={entry.id === selectedId}
                modified={modifiedLog.has(entry.id)}
                onSelect={() => setSelectedId(entry.id)}
                checked={checked.has(entry.id)}
                onToggleCheck={() => setChecked((prev) => {
                  const next = new Set(prev);
                  if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id);
                  return next;
                })}
              />
            ))}
            {filteredRefs.length === 0 && (
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
              <div className="font-mono text-xs text-muted-foreground break-all">{displayPath(selectedEntry)}</div>
              <div
                className="w-full aspect-square rounded flex items-center justify-center overflow-hidden"
                style={{ backgroundImage: "repeating-conic-gradient(#88888844 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" }}
              >
                {selectedDecoded?.kind === "ok" ? (
                  <img src={selectedDecoded.dataUrl} alt="" className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />
                ) : selectedDecoded?.kind === "unsupported" ? (
                  <div className="text-center text-xs text-muted-foreground p-3 space-y-1.5">
                    <ImageOff className="w-6 h-6 mx-auto" />
                    <div>صيغة غير مدعومة للعرض حالياً</div>
                    <div>يمكنك تنزيل الملف الخام لفتحه ببرنامج خارجي</div>
                  </div>
                ) : selectedDecoded?.kind === "error" ? (
                  <div className="text-center text-xs text-destructive p-3 flex flex-col items-center gap-1.5">
                    <AlertTriangle className="w-6 h-6" />
                    {selectedDecoded.message}
                  </div>
                ) : null}
              </div>
              {selectedDecoded?.kind === "ok" && (
                <div className="text-xs text-muted-foreground text-center space-y-0.5">
                  <div>{selectedDecoded.width}×{selectedDecoded.height} — {selectedDecoded.format} — {formatBytes(selectedEntry.size)}</div>
                </div>
              )}

              {selectedDecoded?.kind === "ok" && (() => {
                const d = selectedDecoded;
                const at = d.widths.indexOf(d.width);
                const step = (dir: number) => {
                  const next = d.widths[at + dir];
                  if (next !== undefined) setWidthFor(selectedEntry.id, next);
                };
                return (
                  <div className="flex flex-col gap-1.5 p-2 rounded border border-border bg-muted/30">
                    <div className="text-[11px] font-medium">📐 عرض الصورة</div>
                    <div className="flex items-center gap-1.5">
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => step(1)} disabled={at >= d.widths.length - 1} title="أعرض">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                      <div className="flex-1 text-center font-mono text-sm">{d.width}px</div>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => step(-1)} disabled={at <= 0} title="أضيق">
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setWidthFor(selectedEntry.id, null)} disabled={d.guessed} title="عرض تلقائي">
                        <Wand2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className={`text-[10px] ${d.guessed ? "text-amber-600" : "text-emerald-600"}`}>
                      {d.guessed
                        ? `⚠️ عرض تلقائي (${d.widths.length} احتمال) — إن ظهرت الصورة ممزّقة غيّر العرض حتى تستقيم، ويُحفظ اختيارك.`
                        : "✓ عرض اخترته أنت — محفوظ."}
                    </p>
                    {modifiedLog.has(selectedEntry.id) && (
                      <p className="text-[10px] text-muted-foreground">
                        عدّلت هذه الصورة على هذا العرض — غيّره للعرض فقط؛ الاستبدال التالي يُكتب على العرض الظاهر.
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={handleExportPng} disabled={selectedDecoded?.kind !== "ok"}>
                  <ImageDown className="w-3.5 h-3.5 ml-1" /> تنزيل PNG
                </Button>
                <Button size="sm" variant="outline" onClick={handleExportRaw}>
                  <Download className="w-3.5 h-3.5 ml-1" /> تنزيل الملف الخام
                </Button>
                <label className="flex items-start gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={useOriginalAlpha} onChange={(e) => setUseOriginalAlpha(e.target.checked)} className="mt-0.5" />
                  <span>استخدم شفافية الصورة الأصلية (تتجاهل خلفية الصورة الجديدة وتستخدم مكانها مناطق الشفافية الحقيقية من الأصل)</span>
                </label>
                <Button
                  size="sm"
                  onClick={() => replaceInputRef.current?.click()}
                  disabled={busyId === selectedEntry.id || selectedDecoded?.kind !== "ok"}
                  style={{ backgroundColor: ACCENT, color: "white" }}
                >
                  {busyId === selectedEntry.id ? <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" /> : <Replace className="w-3.5 h-3.5 ml-1" />}
                  استبدال...
                </Button>
                <input
                  ref={replaceInputRef}
                  type="file"
                  accept=".png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handleReplaceSelected(f);
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  PNG بنفس أبعاد الصورة الظاهرة يُرمَّز تلقائياً بألوان اللعبة نفسها. نزّل PNG أولاً وعدّل عليه.
                </p>
                <Button size="sm" variant="outline" onClick={() => setCompositeMode(true)} disabled={selectedDecoded?.kind !== "ok"}>
                  <Crop className="w-3.5 h-3.5 ml-1" /> تركيب صورة داخل منطقة محددة
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  لصور تحوي عدة كلمات أو أزرار — حدّد منطقة الكلمة بالسحب واستبدلها فقط، بلا تغيير بقية الصورة أو شفافيتها.
                </p>
              </div>

              {modifiedLog.has(selectedEntry.id) && (
                <Button size="sm" variant="ghost" onClick={() => handleUndo(selectedEntry.id)} disabled={busyId === selectedEntry.id}>
                  <Undo2 className="w-3.5 h-3.5 ml-1" /> تراجع عن هذا التعديل
                </Button>
              )}
            </>
          )}

          {modifiedLog.size > 0 && (
            <div className="mt-auto pt-3 border-t border-border">
              <div className="text-xs font-display font-bold mb-2">تعديلات هذه الجلسة ({modifiedLog.size})</div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {Array.from(modifiedLog.keys()).map((id) => (
                  <li key={id}>
                    <button className="text-[11px] font-mono text-muted-foreground truncate hover:text-foreground w-full text-right" onClick={() => setSelectedId(id)}>
                      {id.replace(/^data_iz\//, "")}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground mt-2">
                لم تُكتب بعد — اضغط «حفظ الروم» في الأعلى لتنزيل الروم المعدّل.
              </p>
            </div>
          )}
        </div>
      </div>
      )}

      <Dialog open={zipReview !== null} onOpenChange={(open) => { if (!open) { setZipReview(null); setReviewOpen(null); } }}>
        <DialogContent className="w-[96vw] max-w-3xl max-h-[90vh] p-3 sm:p-6 flex flex-col gap-3" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">مراجعة {zipReview?.items.length ?? 0} صورة قبل الاستبدال</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              اضغط على رقم لترى الصورة قبل وبعد — «بعد» كما ستظهر في اللعبة بألوانها. أزل العلامة عن أي صورة لا تريدها.
              {zipReview && zipReview.unchanged > 0 && ` (${zipReview.unchanged} صورة لم تتغيّر فلم تُعرض.)`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 -mx-1 px-1">
            {zipReview?.items.map((it, i) => {
              const open = reviewOpen === i;
              const isChecked = reviewChecked.has(i);
              return (
                <div key={it.id} className={`rounded-md border ${open ? "border-primary/50 bg-muted/30" : "border-border"}`}>
                  <div className="flex items-center gap-2 px-2 py-2 sm:py-1.5">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(v) => setReviewChecked((prev) => { const out = new Set(prev); if (v) out.add(i); else out.delete(i); return out; })}
                      className="h-5 w-5 sm:h-4 sm:w-4"
                      aria-label={`قبول ${it.name}`}
                    />
                    <button type="button" className="flex-1 flex items-center gap-2 min-w-0 text-right" onClick={() => setReviewOpen(open ? null : i)}>
                      <span className="shrink-0 w-7 text-center text-xs font-bold rounded bg-primary/15 text-primary py-0.5">{i + 1}</span>
                      <span className="truncate font-mono text-xs sm:text-sm" dir="ltr">{it.name}</span>
                      <ChevronLeft className={`w-4 h-4 shrink-0 mr-auto transition-transform ${open ? "-rotate-90" : ""}`} />
                    </button>
                  </div>
                  {open && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-2 pb-2">
                      {[{ label: "قبل", url: it.beforeUrl }, { label: "بعد", url: it.afterUrl }].map(({ label, url }) => (
                        <figure key={label} className="space-y-1">
                          <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
                          <div
                            className="rounded border border-border flex items-center justify-center h-40 sm:h-56"
                            style={{ backgroundImage: "repeating-conic-gradient(#88888844 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" }}
                          >
                            <img src={url} alt={label} className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />
                          </div>
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 sm:justify-start">
            <Button className="w-full sm:w-auto" onClick={() => zipReview && applyZipImages(zipReview.items.map((_, i) => i))} style={{ backgroundColor: ACCENT, color: "white" }}>
              <Check className="w-4 h-4 ml-1" /> قبول الكل ({zipReview?.items.length ?? 0})
            </Button>
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={reviewChecked.size === 0}
              onClick={() => applyZipImages([...reviewChecked].sort((a, b) => a - b))}
            >
              استبدال المحدّد ({reviewChecked.size})
            </Button>
            <Button variant="ghost" className="w-full sm:w-auto" onClick={() => { setZipReview(null); setReviewOpen(null); }}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
