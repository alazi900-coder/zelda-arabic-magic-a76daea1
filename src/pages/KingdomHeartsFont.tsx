/**
 * STYLE: أداة فنية هادئة بلون كهرماني لتقرير خط Kingdom Hearts؛ توضح حدود
 * التعديل وتعرض نتيجة يمكن التحقق منها محلياً على الهاتف دون وعود مبهمة.
 */

import { ChangeEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileCheck2, FileWarning, Hash, ShieldCheck, Type, Upload } from "lucide-react";

const ARABIC_FONT_DOWNLOAD_URL = "/manus-storage/Font.arabic.fixed_1ef34122.arc";
const ARABIC_REPORT_DOWNLOAD_URL = "/manus-storage/Font.arabic.fixed.report_ef9765f2.json";

const FONT_REPORT = {
  source: {
    fileName: "Font.arc",
    size: 218348,
    sha256: "d91fd77963e7519fc319a3ea5e2d975c5e0e4bdcb5a41d9a428f03e453c88415",
  },
  output: {
    fileName: "Font.arabic.arc",
    size: 218348,
    sha256: "534fcc4873a9768a8529e427c3dbbb31f567ef22b3a544192eeb64979ad7a13c",
  },
  glyphCount: 126,
  changedResources: ["mesfont.inf", "mesfont.mtx"],
  unchangedResourceCount: 20,
  adjustedGlyphs: 8,
  sourceResourceHashes: {
    "mesfont.inf": "50edcd6c86f13146f24f1d90930280d7f675a49a2a65270876abc00e2537d29d",
    "mesfont.mtx": "6506cddcaedfc4014e3c84d53496dcf8e704a0ccf3e4802928939065a86c71a0",
  },
  outputResourceHashes: {
    "mesfont.inf": "3dafcbc3d2677e688de5555d443eae3bee51ccbccfb031d6137e06cd3fc0aa6e",
    "mesfont.mtx": "b61fd928ee0eeb6cc5c81b2578630db5ee59371ed84f5761f59e64c00ac648e3",
  },
} as const;

type ValidationState =
  | { kind: "idle" }
  | { kind: "reading"; fileName: string }
  | { kind: "source"; fileName: string }
  | { kind: "output"; fileName: string }
  | { kind: "mismatch"; fileName: string; size: number; sha256: string }
  | { kind: "error"; fileName?: string; message: string };

function bytesLabel(bytes: number) {
  return new Intl.NumberFormat("ar").format(bytes) + " بايت";
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function KingdomHeartsFont() {
  const [validation, setValidation] = useState<ValidationState>({ kind: "idle" });

  const sourceShortHash = useMemo(() => FONT_REPORT.source.sha256.slice(0, 12), []);
  const outputShortHash = useMemo(() => FONT_REPORT.output.sha256.slice(0, 12), []);

  const verifyFont = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setValidation({ kind: "reading", fileName: file.name });
    try {
      const contents = await file.arrayBuffer();
      const sha256 = hex(await crypto.subtle.digest("SHA-256", contents));
      if (file.size === FONT_REPORT.source.size && sha256 === FONT_REPORT.source.sha256) {
        setValidation({ kind: "source", fileName: file.name });
      } else if (file.size === FONT_REPORT.output.size && sha256 === FONT_REPORT.output.sha256) {
        setValidation({ kind: "output", fileName: file.name });
      } else {
        setValidation({ kind: "mismatch", fileName: file.name, size: file.size, sha256 });
      }
    } catch (error) {
      setValidation({
        kind: "error",
        fileName: file.name,
        message: error instanceof Error ? error.message : "تعذر فحص الملف محلياً.",
      });
    }
  };

  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/kingdom-hearts-bbs" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border transition-colors hover:border-amber-500/60 hover:text-amber-500" aria-label="العودة لأدوات Kingdom Hearts">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <p className="font-mono text-xs text-amber-500">PSP · FONT.ARC · VERIFIED INJECTION</p>
              <h1 className="truncate font-display text-xl font-black md:text-2xl">خط Kingdom Hearts العربي</h1>
            </div>
          </div>
          <Type className="h-7 w-7 shrink-0 text-amber-500" />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        <div className="rounded-3xl border border-amber-500/35 bg-gradient-to-bl from-amber-500/15 via-card to-card p-6 md:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <p className="font-mono text-xs tracking-[0.16em] text-amber-400">FONT.ARABIC.ARC</p>
              <h2 className="mt-2 font-display text-3xl font-black md:text-4xl">تقرير حقن العربية</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">هذا الملف مبني من <bdi>Font.arc</bdi> الخاص بالباتش الإنجليزي العامل. لم تتغير معالجة ترتيب العربية في المحرر؛ تغيرت صفحة الحروف وجدول مواضعها فقط.</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:min-w-52">
              <a href={ARABIC_FONT_DOWNLOAD_URL} download="Font.arabic.arc" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-amber-500 px-5 py-3 font-black text-black transition-colors hover:bg-amber-400 active:scale-[0.98]">
                <Download className="ml-2 h-5 w-5" />تنزيل Font.arabic.arc
              </a>
              <a href={ARABIC_REPORT_DOWNLOAD_URL} download="Font.arabic.report.json" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-500/45 px-4 py-2 text-sm font-bold text-amber-300 transition-colors hover:bg-amber-500/10">
                <FileCheck2 className="ml-2 h-4 w-4" />تنزيل تقرير الحقن JSON
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">أشكال عربية محقونة</p><p className="mt-1 font-mono text-2xl font-black text-amber-500">{FONT_REPORT.glyphCount}</p></div>
          <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">موارد عدّلت فقط</p><p className="mt-1 font-mono text-2xl font-black text-amber-500">2</p><p className="mt-1 text-xs text-muted-foreground">inf + mtx</p></div>
          <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">موارد بقيت مطابقة</p><p className="mt-1 font-mono text-2xl font-black text-emerald-500">{FONT_REPORT.unchangedResourceCount}</p></div>
          <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">أشكال ضُبطت منفردة</p><p className="mt-1 font-mono text-2xl font-black text-amber-500">{FONT_REPORT.adjustedGlyphs}</p><p className="mt-1 text-xs text-muted-foreground">لا تصغير شامل</p></div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-border bg-card p-5 md:p-6">
            <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-emerald-500" /><div><h2 className="font-display text-xl font-black">فحص الملف على هاتفك</h2><p className="mt-1 text-sm text-muted-foreground">يُحسب SHA-256 محلياً داخل المتصفح، ولا يرفع الملف.</p></div></div>
            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-amber-500/35 bg-amber-500/5 px-5 py-8 text-center transition-colors hover:border-amber-400 hover:bg-amber-500/10">
              <Upload className="mb-3 h-7 w-7 text-amber-500" />
              <span className="font-bold">اختر Font.arc أو Font.arabic.arc للفحص</span>
              <span className="mt-1 text-xs text-muted-foreground">يقبل ملف الخط فقط؛ لا ترفع ملف DAT أو ROM هنا.</span>
              <input className="hidden" type="file" accept=".arc,application/octet-stream" onChange={verifyFont} />
            </label>

            {validation.kind === "reading" && <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">جارٍ حساب بصمة <bdi>{validation.fileName}</bdi> محلياً…</div>}
            {validation.kind === "source" && <div className="mt-4 flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm leading-relaxed"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /><span><b>هذا هو Font.arc الإنجليزي المطابق للمرجع.</b> يمكنك استبداله بملف <bdi>Font.arabic.arc</bdi> المسلم مع هذا التقرير.</span></div>}
            {validation.kind === "output" && <div className="mt-4 flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm leading-relaxed"><FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /><span><b>ملف العربية مطابق تماماً للملف المبني.</b> حجمه وبصمته صحيحان.</span></div>}
            {validation.kind === "mismatch" && <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm leading-relaxed"><FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /><span><b>هذا ليس ملف الخط المرجعي ولا ملف العربية الناتج.</b><br />الحجم: {bytesLabel(validation.size)} · البصمة: <code dir="ltr" className="break-all">{validation.sha256}</code><br />لا تستبدل به شيئاً؛ قد يكون من نسخة لعبة أو باتش مختلف.</span></div>}
            {validation.kind === "error" && <div className="mt-4 flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />{validation.message}</div>}
          </section>

          <aside className="rounded-3xl border border-border bg-card p-5 md:p-6">
            <h2 className="font-display text-xl font-black">طريقة الاستبدال</h2>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <li><b className="text-foreground">1.</b> طبّق الباتش الإنجليزي على النسخة اليابانية أولاً.</li>
              <li><b className="text-foreground">2.</b> افتح الأرشيف الذي يحتوي <bdi>Font.arc</bdi> في مساره نفسه.</li>
              <li><b className="text-foreground">3.</b> احتفظ بنسخة من الملف الأصلي ثم استبدله بملف <bdi>Font.arabic.arc</bdi> وسمّه <bdi>Font.arc</bdi>.</li>
              <li><b className="text-foreground">4.</b> استخدم محرر CTD في الأداة لبناء النصوص العربية؛ المعالجة الحالية تكتب الرموز المناسبة لهذا الخط.</li>
            </ol>
            <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed"><b>تنبيه:</b> ملف العربية مخصص فقط لـ<em>نفس</em> Font.arc الإنجليزي الذي يحمل البصمة أدناه. لا يُستعمل مع Font.arc الياباني الخام أو مع باتش آخر.</div>
          </aside>
        </div>

        <section className="mt-6 rounded-3xl border border-border bg-card p-5 md:p-6">
          <div className="flex items-center gap-3"><Hash className="h-5 w-5 text-amber-500" /><h2 className="font-display text-xl font-black">بصمات التحقق</h2></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-muted/45 p-4"><p className="text-sm font-bold">الخط الإنجليزي قبل الحقن</p><p className="mt-2 font-mono text-xs break-all" dir="ltr">{FONT_REPORT.source.sha256}</p><p className="mt-2 text-xs text-muted-foreground">{bytesLabel(FONT_REPORT.source.size)} · {sourceShortHash}…</p></div>
            <div className="rounded-xl bg-muted/45 p-4"><p className="text-sm font-bold">الخط العربي الناتج</p><p className="mt-2 font-mono text-xs break-all" dir="ltr">{FONT_REPORT.output.sha256}</p><p className="mt-2 text-xs text-muted-foreground">{bytesLabel(FONT_REPORT.output.size)} · {outputShortHash}…</p></div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">الموارد المعدلة حصراً: <bdi className="font-mono text-foreground">mesfont.inf</bdi> (صورة الحروف) و<bdi className="font-mono text-foreground">mesfont.mtx</bdi> (مواقعها وعروضها). بقية موارد الأرشيف بقيت مطابقة بايتاً ببايت.</p>
        </section>
      </section>
    </main>
  );
}
