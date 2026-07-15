import { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileArchive, Loader2, CheckCircle2, XCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { parseXgfn, buildXgfn, type XgfnDocument } from "@/lib/risen2-xgfn";
import { decodeDdsToRgba } from "@/lib/risen-ximg";

const ACCENT = "#4a7c3f";

interface RoundTripResult {
  ok: boolean;
  message: string;
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

  const decodeFontName = useCallback((headerPrefix: Uint8Array): string => {
    const nameBytes = headerPrefix.subarray(0x96, 0x96 + 64);
    return new TextDecoder("utf-16le").decode(nameBytes).replace(/\0+$/, "");
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setRoundTrip(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseXgfn(buffer);
      setOriginalBytes(new Uint8Array(buffer));
      setDoc(parsed);
      setFileName(file.name);
      setFontLabel(decodeFontName(parsed.headerPrefix));
      toast.success(`تم تحليل الملف: ${parsed.glyphCount} حرفاً`);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحليل الملف: " + (err as Error).message);
      setDoc(null);
      setOriginalBytes(null);
    } finally {
      setBusy(false);
    }
  }, [decodeFontName]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }, [busy, handleFile]);

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
      ctx.strokeStyle = "rgba(255, 0, 128, 0.85)";
      ctx.lineWidth = 1;
      for (const m of doc.measurements) {
        const atlasX = m.fields[0];
        if (atlasX === undefined || atlasX < 0 || atlasX > decoded.width) continue;
        ctx.beginPath();
        ctx.moveTo(atlasX + 0.5, 0);
        ctx.lineTo(atlasX + 0.5, decoded.height);
        ctx.stroke();
      }
      // Tentative cell-height/baseline overlay (fields[3]/[4] hypothesis — unconfirmed).
      ctx.strokeStyle = "rgba(0, 200, 255, 0.7)";
      ctx.setLineDash([4, 3]);
      const withGuess = doc.measurements.find((m) => m.fields.length > 4);
      if (withGuess) {
        const cellHeight = withGuess.fields[3];
        const baseline = withGuess.fields[4];
        if (cellHeight > 0 && cellHeight < decoded.height) {
          ctx.beginPath();
          ctx.moveTo(0, cellHeight + 0.5);
          ctx.lineTo(decoded.width, cellHeight + 0.5);
          ctx.stroke();
        }
        if (baseline > 0 && baseline < decoded.height) {
          ctx.beginPath();
          ctx.moveTo(0, baseline + 0.5);
          ctx.lineTo(decoded.width, baseline + 0.5);
          ctx.stroke();
        }
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
            هذه المرحلة الأولى: فحص ملف .xgfn واحد (مفكوك الضغط مسبقاً) واختبار round-trip ومعاينة الأطلس مع شبكة تشخيصية.
            توليد الخطوط العربية والحقن في fonts.pak سيأتي لاحقاً بعد تأكيد معنى حقول القياسات.
          </p>
        </div>

        {/* Upload */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-bold">ارفع ملف .xgfn (مفكوك الضغط)</h2>
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

            <div>
              <p className="text-xs text-muted-foreground mb-2">
                الخطوط الوردية: مواضع atlas_x لكل حرف (مؤكدة). الخطوط الزرقاء المتقطعة: تخمين حالي لارتفاع الخلية/خط الأساس (غير مؤكد بعد — قارنه بصرياً مع الحروف).
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
