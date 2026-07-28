import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FolderOpen, Loader2, AlertTriangle, Download, ImageDown,
  Replace, Undo2, Search, ImageOff, ZoomIn, ZoomOut, Maximize,
} from "lucide-react";
import {
  listTextures, decodeTextureToPng, replaceTexture,
  type MetroidPrimeTextureInfo,
} from "@/lib/metroid-prime/mp-wasm";
import { decodePngRawNoCanvas } from "@/lib/png-decode";

const ACCENT = "#c0392b";
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;

/** Formats this tool can write back. Anything else is listed and previewed
 *  but its replace button stays disabled, which is kinder than letting the
 *  user prepare artwork and only then hit a failure. */
const WRITABLE = new Set(["BptcUnorm", "BptcUnormSrgb", "Rgba8Unorm", "Rgba8Srgb", "R8Unorm"]);

type ThumbResult =
  | { kind: "ok"; dataUrl: string }
  | { kind: "error"; message: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
}

/** Human name for retrolib's format identifiers — "BptcUnorm" means nothing
 *  to a translator, "BC7" is what every image tool calls it. */
function formatLabel(f: string): string {
  if (f === "BptcUnorm") return "BC7";
  if (f === "BptcUnormSrgb") return "BC7 (sRGB)";
  if (f.startsWith("RgbaBc1")) return "BC1/DXT1";
  if (f.startsWith("RgbaBc3")) return "BC3/DXT5";
  if (f.startsWith("RgbaAstc")) return f.replace("Rgba", "");
  return f;
}

/** One texture card. Decoding a 4K BC7 image is expensive and a .pak holds
 *  hundreds, so a card only decodes once it has actually been scrolled into
 *  view — the same lazy approach the Risen tool uses. */
function TextureCard({
  info, selected, onSelect, decode,
}: {
  info: MetroidPrimeTextureInfo;
  selected: boolean;
  onSelect: () => void;
  decode: (id: string) => Promise<ThumbResult>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<ThumbResult | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible(true);
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || result || !info.readable) return;
    let cancelled = false;
    void decode(info.id).then((r) => { if (!cancelled) setResult(r); });
    return () => { cancelled = true; };
  }, [visible, result, info.id, info.readable, decode]);

  const name = info.names[0] || info.id.slice(0, 8);
  return (
    <button
      ref={ref}
      onClick={onSelect}
      className={`flex flex-col gap-1 p-2 rounded border text-right transition-colors ${
        selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
      }`}
      title={`${name}\n${info.width}×${info.height} ${formatLabel(info.format)}`}
    >
      <div className="w-full aspect-square rounded bg-muted/40 flex items-center justify-center overflow-hidden">
        {result?.kind === "ok" ? (
          <img src={result.dataUrl} alt={name} className="max-w-full max-h-full object-contain" style={{ imageRendering: "pixelated" }} />
        ) : result || !info.readable ? (
          <ImageOff className="w-5 h-5 text-muted-foreground" />
        ) : visible ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <span className="text-[10px] text-muted-foreground truncate font-mono">{name}</span>
      <span className="text-[9px] text-muted-foreground truncate font-mono">
        {info.readable ? `${info.width}×${info.height} · ${formatLabel(info.format)}` : "غير مقروء"}
      </span>
    </button>
  );
}

/**
 * Metroid Prime Remastered image tool — the same shape as the Risen image
 * tool (browse, preview, replace, undo, write back), adapted to MP's .pak:
 * textures are TXTR assets inside the package rather than loose DDS files,
 * and the whole package is rebuilt in memory on every edit, so the file has
 * to be read in full rather than streamed.
 */
export default function MetroidPrimeImages() {
  const [pakBytes, setPakBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [textures, setTextures] = useState<MetroidPrimeTextureInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; dataUrl: string } | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  /** One level of undo, keyed by texture id: the whole .pak before the edit.
   *  Cheap in code, and the only thing that makes experimenting safe. */
  const undoRef = useRef<Map<string, Uint8Array>>(new Map());
  const [modified, setModified] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const fsaSupported = typeof window !== "undefined" && "showOpenFilePicker" in window;

  const loadPak = useCallback(async (bytes: Uint8Array, name: string, handle: FileSystemFileHandle | null) => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await listTextures(bytes);
      if (list.length === 0) throw new Error("لا توجد صور (TXTR) في هذا الملف");
      setPakBytes(bytes);
      setFileName(name);
      setFileHandle(handle);
      setTextures(list);
      setSelectedId(null);
      setPreview(null);
      undoRef.current = new Map();
      setModified(new Set());
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFile = useCallback(async (file: File, handle: FileSystemFileHandle | null) => {
    setLoading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await loadPak(bytes, file.name, handle);
    } catch (e) {
      setLoadError((e as Error).message);
      setLoading(false);
    }
  }, [loadPak]);

  const handleOpenFsa = useCallback(async () => {
    if (!window.showOpenFilePicker) return;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "Metroid Prime Remastered .pak", accept: { "application/octet-stream": [".pak", ".PAK"] } }],
      });
      await handleFile(await handle.getFile(), handle);
    } catch {
      // the user dismissed the picker
    }
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void handleFile(f, null);
  }, [handleFile]);

  /** Decodes one texture to a data URL. Used for both thumbnails and the
   *  large preview, so a texture is never decoded by two different paths. */
  const decodeToDataUrl = useCallback(async (id: string): Promise<ThumbResult> => {
    if (!pakBytes) return { kind: "error", message: "لا يوجد ملف" };
    try {
      const png = await decodeTextureToPng(pakBytes, id);
      const blob = new Blob([png as unknown as BlobPart], { type: "image/png" });
      return { kind: "ok", dataUrl: URL.createObjectURL(blob) };
    } catch (e) {
      return { kind: "error", message: (e as Error).message };
    }
  }, [pakBytes]);

  const selectTexture = useCallback(async (id: string) => {
    setSelectedId(id);
    setStatus(null);
    setDecoding(true);
    try {
      const r = await decodeToDataUrl(id);
      setPreview(r.kind === "ok" ? { id, dataUrl: r.dataUrl } : null);
      if (r.kind !== "ok") setStatus(`تعذّر فك هذه الصورة: ${r.message}`);
      setZoom(1);
    } finally {
      setDecoding(false);
    }
  }, [decodeToDataUrl]);

  const selected = useMemo(
    () => textures.find((t) => t.id === selectedId) ?? null,
    [textures, selectedId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return textures;
    return textures.filter(
      (t) => t.names.some((n) => n.toLowerCase().includes(q)) || t.id.includes(q) || `${t.width}x${t.height}`.includes(q)
    );
  }, [textures, search]);

  const handleReplaceFile = useCallback(async (file: File) => {
    if (!pakBytes || !selected) return;
    setBusy(selected.id);
    setStatus(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const decoded = await decodePngRawNoCanvas(bytes);
      if (!decoded) throw new Error("تعذّر قراءة ملف PNG هذا");
      if (decoded.width !== selected.width || decoded.height !== selected.height) {
        throw new Error(
          `أبعاد الصورة ${decoded.width}×${decoded.height} لا تطابق الأصل ${selected.width}×${selected.height} — ` +
          "حجم الصورة مرتبط بما يرسمها في اللعبة، فلا بد أن يتطابق"
        );
      }
      if (!undoRef.current.has(selected.id)) undoRef.current.set(selected.id, pakBytes);
      const rebuilt = await replaceTexture(
        pakBytes, selected.id, new Uint8Array(decoded.rgba.buffer, decoded.rgba.byteOffset, decoded.rgba.length),
        decoded.width, decoded.height
      );
      setPakBytes(rebuilt);
      setModified((prev) => new Set(prev).add(selected.id));
      setStatus("تم استبدال الصورة — احفظ الملف لتثبيت التغيير");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [pakBytes, selected]);

  // Re-decode the preview whenever the .pak behind it changes, so the pane
  // shows what is actually in the file rather than what was there before the
  // edit — this doubles as the check that the replacement really landed.
  useEffect(() => {
    if (!pakBytes || !selectedId) return;
    let cancelled = false;
    void decodeToDataUrl(selectedId).then((r) => {
      if (!cancelled && r.kind === "ok") setPreview({ id: selectedId, dataUrl: r.dataUrl });
    });
    return () => { cancelled = true; };
  }, [pakBytes, selectedId, decodeToDataUrl]);

  const handleUndo = useCallback(() => {
    if (!selected) return;
    const before = undoRef.current.get(selected.id);
    if (!before) return;
    setPakBytes(before);
    undoRef.current.delete(selected.id);
    setModified((prev) => {
      const next = new Set(prev);
      next.delete(selected.id);
      return next;
    });
    setStatus("تمت استعادة الصورة الأصلية");
  }, [selected]);

  const handleExportPng = useCallback(async () => {
    if (!pakBytes || !selected) return;
    const png = await decodeTextureToPng(pakBytes, selected.id);
    const blob = new Blob([png as unknown as BlobPart], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.names[0] || selected.id}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pakBytes, selected]);

  const handleSave = useCallback(async () => {
    if (!pakBytes) return;
    setBusy("save");
    setStatus(null);
    try {
      if (fileHandle) {
        const ok = window.confirm(
          `أنت على وشك الكتابة مباشرة في ${fileName}. يُنصح بعمل نسخة احتياطية أولاً.\n\nهل تريد الاستمرار؟`
        );
        if (!ok) return;
        const writable = await fileHandle.createWritable();
        await writable.write(pakBytes as unknown as BufferSource);
        await writable.close();
        setStatus(`تمت الكتابة مباشرة في ${fileName}`);
      } else {
        const blob = new Blob([pakBytes as unknown as BlobPart], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName || "UIMP1.PAK";
        a.click();
        URL.revokeObjectURL(url);
        setStatus("تم تنزيل الملف المعدَّل — ضعه مكان الأصلي");
      }
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [pakBytes, fileHandle, fileName]);

  const fitZoom = useCallback(() => {
    const el = previewScrollRef.current;
    if (!el || !selected) return;
    setZoom(Math.min(el.clientWidth / selected.width, el.clientHeight / selected.height, 1));
  }, [selected]);

  // ==========================================================================

  if (!pakBytes) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center px-4 text-center transition-colors ${dragOver ? "bg-primary/5" : ""}`}
        dir="rtl"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Link to="/metroid-prime" className="absolute top-4 right-4">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> رجوع</Button>
        </Link>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: `${ACCENT}1a` }}>
          <span className="text-3xl">🖼️</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-display font-bold mb-3">أداة صور Metroid Prime Remastered</h1>
        <p className="text-muted-foreground mb-8 max-w-lg font-body">
          افتح ملف <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">UIMP1.PAK</code> أو أي حزمة أخرى
          لعرض صورها واستخراجها واستبدالها بصور معرَّبة — أو اسحب الملف وأفلته هنا.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> جارٍ قراءة الملف...
          </div>
        ) : (
          <>
            {fsaSupported ? (
              <Button size="lg" onClick={handleOpenFsa} className="font-display font-bold text-lg px-10 py-6" style={{ backgroundColor: ACCENT, color: "white" }}>
                <FolderOpen className="w-5 h-5 ml-2" /> افتح ملف .pak
              </Button>
            ) : (
              <>
                <Button size="lg" onClick={() => fileInputRef.current?.click()} className="font-display font-bold text-lg px-10 py-6" style={{ backgroundColor: ACCENT, color: "white" }}>
                  <FolderOpen className="w-5 h-5 ml-2" /> افتح ملف .pak
                </Button>
                <input ref={fileInputRef} type="file" accept=".pak,.PAK" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f, null); }} />
                <p className="text-xs text-muted-foreground mt-4 max-w-md">
                  متصفحك لا يدعم الكتابة المباشرة بالملف (متاحة في Chrome/Edge)؛ سيُنزَّل الملف المعدَّل بدلاً منها.
                </p>
              </>
            )}
            <p className="text-xs text-muted-foreground mt-4 max-w-md">
              الحزمة تُقرأ كاملة في الذاكرة (على عكس أداة Risen التي تقرأ تدريجياً)، لأن كل تعديل يعيد بناء الحزمة.
              ملف بحجم 100 م.ب أو أكثر قد يستغرق دقيقة ويحتاج ذاكرة كافية.
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

  const canWrite = selected != null && selected.readable && WRITABLE.has(selected.format);

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <div className="border-b border-border px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link to="/metroid-prime"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> رجوع</Button></Link>
        <span className="font-display font-bold">🖼️ صور Metroid Prime</span>
        <span className="text-sm text-muted-foreground font-mono">{fileName}</span>
        <span className="text-xs text-muted-foreground">({textures.length} صورة{modified.size > 0 ? ` · ${modified.size} معدَّلة` : ""})</span>
        <div className="flex-1" />
        <Button size="sm" onClick={handleSave} disabled={modified.size === 0 || busy === "save"} style={modified.size > 0 ? { backgroundColor: ACCENT, color: "white" } : undefined}>
          {busy === "save" ? <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" /> : <Download className="w-3.5 h-3.5 ml-1" />}
          {fileHandle ? "احفظ في الملف" : "نزّل الملف المعدَّل"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setPakBytes(null); setTextures([]); }}>إغلاق</Button>
      </div>

      {status && (
        <div className="px-4 py-2 bg-muted/50 text-xs flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {status}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 p-3">
        <div className="w-full md:w-80 shrink-0 flex flex-col gap-2 min-h-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو المقاس..."
              className="w-full pr-7 pl-2 py-1.5 rounded bg-background border border-border text-xs"
            />
          </div>
          <div className="flex-1 min-h-[240px] overflow-y-auto grid grid-cols-3 gap-1.5 content-start">
            {filtered.map((t) => (
              <TextureCard
                key={t.id}
                info={t}
                selected={t.id === selectedId}
                onSelect={() => void selectTexture(t.id)}
                decode={decodeToDataUrl}
              />
            ))}
            {filtered.length === 0 && (
              <p className="col-span-3 text-center text-xs text-muted-foreground py-6">لا توجد نتائج مطابقة.</p>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-mono text-xs text-muted-foreground truncate flex-1 min-w-[140px]">
              {selected ? `${selected.names[0] || selected.id} — ${selected.width}×${selected.height} · ${formatLabel(selected.format)} · ${selected.mips} مستوى · ${formatBytes(selected.data_len)}` : "اختر صورة"}
            </div>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / 1.25))} title="تصغير"><ZoomOut className="w-3.5 h-3.5" /></Button>
            <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * 1.25))} title="تكبير"><ZoomIn className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="outline" onClick={fitZoom} className="gap-1.5" title="ملائمة الشاشة"><Maximize className="w-3.5 h-3.5" /> ملائمة</Button>
            <Button size="sm" variant="outline" onClick={() => setZoom(1)}>100%</Button>
          </div>

          <div
            ref={previewScrollRef}
            className="flex-1 min-h-[320px] overflow-auto rounded border border-border flex items-start justify-center"
            style={{ backgroundImage: "repeating-conic-gradient(#88888844 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" }}
          >
            {decoding ? (
              <div className="m-auto"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
            ) : preview && selected ? (
              <img
                src={preview.dataUrl}
                alt=""
                style={{ width: selected.width * zoom, height: selected.height * zoom, imageRendering: "pixelated", display: "block" }}
              />
            ) : (
              <span className="m-auto text-sm text-muted-foreground">اختر صورة من القائمة لعرضها</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleExportPng} disabled={!selected || !selected.readable}>
              <ImageDown className="w-3.5 h-3.5 ml-1" /> صدّر PNG
            </Button>
            <Button size="sm" variant="secondary" onClick={() => replaceInputRef.current?.click()} disabled={!canWrite || busy === selected?.id}>
              {busy === selected?.id ? <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" /> : <Replace className="w-3.5 h-3.5 ml-1" />}
              استبدل بصورة PNG
            </Button>
            <Button size="sm" variant="ghost" onClick={handleUndo} disabled={!selected || !modified.has(selected.id)}>
              <Undo2 className="w-3.5 h-3.5 ml-1" /> استعادة الأصل
            </Button>
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/png"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void handleReplaceFile(f);
              }}
            />
            {selected && selected.readable && !WRITABLE.has(selected.format) && (
              <span className="text-[11px] text-muted-foreground">
                صيغة {formatLabel(selected.format)} تُعرض وتُصدَّر، لكن الكتابة إليها غير مدعومة بعد.
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            صورة الاستبدال يجب أن تكون PNG بنفس أبعاد الأصل بالضبط. تُعاد كتابتها بصيغة الأصل نفسها (BC7 للصور الملوّنة)،
            وهو ترميز ضاغط، فقد تختلف بضعة مستويات لون عن ملفك — والمعاينة أعلاه تُظهر النتيجة الفعلية بعد الترميز لا صورتك الأصلية.
          </p>
        </div>
      </div>
    </div>
  );
}
