import { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileArchive, Loader2, CheckCircle2, XCircle, Upload, Package } from "lucide-react";
import { toast } from "sonner";
import { parseXgfn, buildXgfn, type XgfnDocument } from "@/lib/risen2-xgfn";
import { renderArabicGlyphsFromFont, appendArabicGlyphsToXgfn } from "@/lib/risen2-arabic-font-gen";
import { decodeDdsToRgba } from "@/lib/risen-ximg";
import {
  parseImagesPakHeader,
  parseImagesPakFileInfoTree,
  inflateFontsPakEntry,
  type RisenPakHeader,
  type RisenPakNode,
  type RisenPakFileEntry,
} from "@/lib/risen2-fontspak";

const ACCENT = "#4a7c3f";

interface RoundTripResult {
  ok: boolean;
  message: string;
}

interface PakEntryRef {
  path: string;
  node: RisenPakFileEntry;
}

/** The 35-file list a real Chinese mod successfully modified — every Trajan
 * Pro + every Georgia entry (confirmed by counting: 21 + 14 = 35 exactly). */
function isTargetFont(path: string): boolean {
  return path.startsWith("Trajan Pro_") || path.startsWith("Georgia_");
}

/** Most common (mode) row height across existing measurement records — used
 * as the target draw size when rendering new Arabic glyphs, so they're
 * visually comparable in scale to the font's existing Latin glyphs. */
function computeRowHeightPx(doc: XgfnDocument): number {
  const counts = new Map<number, number>();
  for (const m of doc.measurements) {
    if (m.fields.length < 4) continue;
    const h = m.fields[3] - m.fields[1];
    if (h <= 0) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let best = 20;
  let bestCount = 0;
  for (const [h, count] of counts) {
    if (count > bestCount) { best = h; bestCount = count; }
  }
  return best;
}

function walkFileEntries(tree: RisenPakNode[], prefix = ""): PakEntryRef[] {
  const out: PakEntryRef[] = [];
  for (const n of tree) {
    const path = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === "folder") out.push(...walkFileEntries(n.children, path));
    else out.push({ path, node: n });
  }
  return out;
}

const RisenFonts = () => {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [originalBytes, setOriginalBytes] = useState<Uint8Array | null>(null);
  const [doc, setDoc] = useState<XgfnDocument | null>(null);
  const [fontLabel, setFontLabel] = useState<string>("");
  const [showGrid, setShowGrid] = useState(true);
  const [roundTrip, setRoundTrip] = useState<RoundTripResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // fonts.pak container state — lets the user pick any real font directly
  // from the archive instead of needing to extract/decompress one manually first.
  const [pakBusy, setPakBusy] = useState(false);
  const [pakDragOver, setPakDragOver] = useState(false);
  const [pakName, setPakName] = useState<string | null>(null);
  const [pakBytes, setPakBytes] = useState<Uint8Array | null>(null);
  const [pakHeader, setPakHeader] = useState<RisenPakHeader | null>(null);
  const [pakEntries, setPakEntries] = useState<PakEntryRef[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Arabic glyph generator (Phase 3, preview-only) — merges rendered Arabic
  // glyphs into the currently-displayed font for visual inspection.
  const [arabicFontBytes, setArabicFontBytes] = useState<ArrayBuffer | null>(null);
  const [arabicFontName, setArabicFontName] = useState<string | null>(null);
  const [arabicBusy, setArabicBusy] = useState(false);

  const decodeFontName = useCallback((headerPrefix: Uint8Array): string => {
    const nameBytes = headerPrefix.subarray(0x96, 0x96 + 64);
    return new TextDecoder("utf-16le").decode(nameBytes).replace(/\0+$/, "");
  }, []);

  /** Parses already-decompressed .xgfn bytes and updates the shared preview state
   * (used both for a direct .xgfn upload and for a font selected from fonts.pak). */
  const loadXgfnBytes = useCallback((buffer: ArrayBuffer, label: string) => {
    const parsed = parseXgfn(buffer);
    setOriginalBytes(new Uint8Array(buffer));
    setDoc(parsed);
    setFileName(label);
    setFontLabel(decodeFontName(parsed.headerPrefix));
    setRoundTrip(null);
    toast.success(`تم تحليل الملف: ${parsed.glyphCount} حرفاً`);
  }, [decodeFontName]);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      loadXgfnBytes(buffer, file.name);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحليل الملف: " + (err as Error).message);
      setDoc(null);
      setOriginalBytes(null);
    } finally {
      setBusy(false);
    }
  }, [loadXgfnBytes]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }, [busy, handleFile]);

  const handlePakFile = useCallback(async (file: File) => {
    setPakBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const header = parseImagesPakHeader(bytes.slice(0, 48));
      const { tree, endOffset } = parseImagesPakFileInfoTree(bytes.subarray(header.fileInfoOffset), header);
      if (endOffset !== bytes.length) {
        throw new Error("نهاية شجرة الملفات لا تطابق نهاية الملف — الملف قد يكون غير مكتمل أو غير مدعوم");
      }
      const entries = walkFileEntries(tree).filter((e) => e.path.endsWith("._xgfn"));
      setPakBytes(bytes);
      setPakHeader(header);
      setPakEntries(entries);
      setPakName(file.name);
      setSelectedPath(null);
      toast.success(`تم فتح الحاوية: ${entries.length} خطاً`);
    } catch (err) {
      console.error(err);
      toast.error("فشل فتح fonts.pak: " + (err as Error).message);
      setPakBytes(null);
      setPakEntries([]);
    } finally {
      setPakBusy(false);
    }
  }, []);

  const handlePakDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setPakDragOver(false);
    if (pakBusy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void handlePakFile(f);
  }, [pakBusy, handlePakFile]);

  const handleSelectPakEntry = useCallback((entry: PakEntryRef) => {
    if (!pakBytes) return;
    try {
      const decompressed = inflateFontsPakEntry(pakBytes, entry.node);
      const buf = decompressed.buffer.slice(decompressed.byteOffset, decompressed.byteOffset + decompressed.byteLength);
      loadXgfnBytes(buf, entry.path);
      setSelectedPath(entry.path);
    } catch (err) {
      console.error(err);
      toast.error(`فشل استخراج "${entry.path}": ` + (err as Error).message);
    }
  }, [pakBytes, loadXgfnBytes]);

  const handleArabicFontFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    setArabicFontBytes(buffer);
    setArabicFontName(file.name);
  }, []);

  const handleGenerateArabic = useCallback(async () => {
    if (!doc || !arabicFontBytes) return;
    setArabicBusy(true);
    try {
      const rowHeightPx = computeRowHeightPx(doc);
      const glyphs = await renderArabicGlyphsFromFont(arabicFontBytes, rowHeightPx);
      const merged = appendArabicGlyphsToXgfn(doc, glyphs);
      setDoc(merged);
      setOriginalBytes(null); // merged doc no longer corresponds to any single original byte stream
      setRoundTrip(null);
      toast.success(`تم توليد ${glyphs.length} حرفاً عربياً ودمجها للمعاينة (بدون حقن في fonts.pak)`);
    } catch (err) {
      console.error(err);
      toast.error("فشل توليد الحروف العربية: " + (err as Error).message);
    } finally {
      setArabicBusy(false);
    }
  }, [doc, arabicFontBytes]);

  const handleRoundTripTest = useCallback(() => {
    if (!doc || !originalBytes) return;
    try {
      const rebuilt = new Uint8Array(buildXgfn(doc));
      if (rebuilt.length !== originalBytes.length) {
        setRoundTrip({ ok: false, message: `اختلاف بالحجم: أصلي ${originalBytes.length} بايت، مُعاد بناؤه ${rebuilt.length} بايت` });
        return;
      }
      let match = true;
      for (let i = 0; i < rebuilt.length; i++) {
        if (rebuilt[i] !== originalBytes[i]) { match = false; break; }
      }
      setRoundTrip(match
        ? { ok: true, message: "مطابقة كاملة بايت-بايت ✅" }
        : { ok: false, message: "اختلاف في المحتوى رغم تطابق الحجم — تحقق من منطق البناء" });
    } catch (err) {
      setRoundTrip({ ok: false, message: "خطأ أثناء إعادة البناء: " + (err as Error).message });
    }
  }, [doc, originalBytes]);

  // Render the DDS atlas + diagnostic grid overlay whenever the doc or grid toggle changes.
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    const decoded = decodeDdsToRgba(doc.ddsBytes);
    if (!decoded.supported) {
      toast.error("صيغة DDS غير مدعومة للمعاينة");
      return;
    }
    const canvas = canvasRef.current;
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = new ImageData(new Uint8ClampedArray(decoded.rgba), decoded.width, decoded.height);
    ctx.putImageData(imageData, 0, 0);

    if (showGrid) {
      ctx.save();
      // Per-glyph atlas bounding box: fields[0..3] = [x0, y0, x1, y1] —
      // confirmed by checking real ink pixel bounds against these fields on
      // the Georgia sample (276 glyphs): the actual non-transparent pixels
      // always sit comfortably inside this rectangle, for both single-row
      // (numbers) and multi-row (full-alphabet) atlases alike.
      ctx.strokeStyle = "rgba(255, 0, 128, 0.85)";
      ctx.lineWidth = 1;
      for (const m of doc.measurements) {
        const [x0, y0, x1, y1] = m.fields;
        if (x0 === undefined || x1 === undefined || y1 === undefined) continue;
        if (x1 <= x0 || y1 <= y0) continue; // skip zero-size cells (e.g. space)
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
      }
      ctx.restore();
    }
  }, [doc, showGrid]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/risen" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="w-4 h-4" /> الرجوع
          </Link>
          <h1 className="text-2xl font-display font-bold">أداة خطوط Risen 2 (تجريبية)</h1>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <strong className="font-display block mb-1">مرحلة تحليل الصيغة</strong>
          <p className="text-muted-foreground">
            هذه مرحلة تحليل الصيغة: افتح fonts.pak كاملاً واختر أي خط منه (أو ملف .xgfn منفرد)، شغّل اختبار round-trip، وقارن الشبكة التشخيصية بصرياً مع الحروف.
            توليد الخطوط العربية والحقن في fonts.pak سيأتي لاحقاً بعد تأكيد معنى حقول القياسات.
          </p>
        </div>

        {/* fonts.pak container upload — pick any real font directly from the archive */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-bold">أو ارفع fonts.pak كاملاً واختر خطاً منه</h2>
              <p className="text-sm text-muted-foreground">يفتح الحاوية ويفك ضغط أي خط تختاره تلقائياً</p>
            </div>
          </div>
          <label className="block">
            <input
              type="file"
              accept=".pak"
              className="hidden"
              disabled={pakBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePakFile(f);
              }}
            />
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${pakBusy ? "opacity-50 pointer-events-none border-border" : pakDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              onDragOver={(e) => { e.preventDefault(); setPakDragOver(true); }}
              onDragLeave={() => setPakDragOver(false)}
              onDrop={handlePakDrop}
            >
              {pakBusy ? (
                <>
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">جاري الفتح...</p>
                </>
              ) : (
                <>
                  <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm">اضغط لاختيار fonts.pak، أو اسحبه وأفلته هنا</p>
                </>
              )}
            </div>
          </label>

          {pakEntries.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">
                تم فتح <span className="font-mono">{pakName}</span> — {pakEntries.length} خطاً (المميّزة بالأخضر من قائمة الـ35 المستهدفة):
              </p>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {pakEntries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => handleSelectPakEntry(entry)}
                    className={`w-full text-right px-3 py-2 text-sm font-mono hover:bg-primary/10 transition-colors ${selectedPath === entry.path ? "bg-primary/20" : ""} ${isTargetFont(entry.path) ? "text-emerald-500" : ""}`}
                  >
                    {entry.path}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Upload */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-bold">أو ارفع ملف .xgfn منفرداً (مفكوك الضغط)</h2>
              <p className="text-sm text-muted-foreground">مثال: خط واحد مستخرج ومفكوك مسبقاً من fonts.pak</p>
            </div>
          </div>
          <label className="block">
            <input
              type="file"
              accept=".xgfn"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${busy ? "opacity-50 pointer-events-none border-border" : dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {busy ? (
                <>
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">جاري التحليل...</p>
                </>
              ) : (
                <>
                  <FileArchive className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm">اضغط لاختيار ملف .xgfn، أو اسحبه وأفلته هنا</p>
                </>
              )}
            </div>
          </label>
        </div>

        {doc && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h2 className="font-display font-bold">تم التحليل: <span className="font-mono">{fileName}</span></h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="rounded-lg bg-background/50 p-3 text-center">
                <div className="font-mono text-xs text-muted-foreground">اسم الخط</div>
                <div className="font-display font-bold">{fontLabel || "—"}</div>
              </div>
              <div className="rounded-lg bg-background/50 p-3 text-center">
                <div className="font-mono text-xs text-muted-foreground">عدد الحروف</div>
                <div className="font-display font-bold text-lg">{doc.glyphCount}</div>
              </div>
              <div className="rounded-lg bg-background/50 p-3 text-center">
                <div className="font-mono text-xs text-muted-foreground">مدخلات charmap</div>
                <div className="font-display font-bold text-lg">{doc.charmap.length}</div>
              </div>
              <div className="rounded-lg bg-background/50 p-3 text-center">
                <div className="font-mono text-xs text-muted-foreground">حجم DDS</div>
                <div className="font-display font-bold text-lg">{doc.ddsBytes.length.toLocaleString()} بايت</div>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={handleRoundTripTest} variant="outline" className="font-display">
                اختبار Round-trip
              </Button>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="rounded border-border" />
                إظهار الشبكة التشخيصية
              </label>
            </div>

            {roundTrip && (
              <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${roundTrip.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
                {roundTrip.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {roundTrip.message}
              </div>
            )}

            <div className="rounded-lg border border-border p-4 space-y-3">
              <h3 className="font-display font-bold text-sm">توليد ودمج الحروف العربية (معاينة فقط — بلا حقن في fonts.pak)</h3>
              <p className="text-xs text-muted-foreground">
                يرسم كل نقاط اليونيكود التي يحتاجها نظام تشكيل Risen العربي الحالي (الأشكال السياقية + لامات الألف + الأرقام العربية الهندية) من خط TTF، ويضيفها أسفل أطلس هذا الخط لمعاينتها في الشبكة التشخيصية.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="block">
                  <input
                    type="file"
                    accept=".ttf,.otf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleArabicFontFile(f); }}
                  />
                  <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm cursor-pointer hover:border-primary/50">
                    <Upload className="w-4 h-4" /> {arabicFontName ?? "اختر خط TTF عربي"}
                  </span>
                </label>
                <Button onClick={handleGenerateArabic} disabled={!arabicFontBytes || arabicBusy} className="font-display">
                  {arabicBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "توليد ودمج"}
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2">
                المربعات الوردية: صندوق كل حرف في الأطلس (fields[0..3] = [x0,y0,x1,y1]) — تحقق منها فعلياً بمطابقة بكسلات الحروف الحقيقية داخلها على عيّنة Georgia (276 حرفاً).
              </p>
              <div className="overflow-auto rounded-lg border border-border bg-[repeating-conic-gradient(#0002_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-2">
                <canvas ref={canvasRef} className="max-w-none" style={{ imageRendering: "pixelated" }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RisenFonts;
