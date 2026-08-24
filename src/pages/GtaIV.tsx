import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, FileCode2, FileText, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { inspectGtaIvGxt, inspectGtaIvOxt, type GtaIvGxtSummary, type GtaIvOxtSummary } from "@/lib/gtaiv/gxt-format";

/** GTA IV design: forensic, read-only GXT/OXT intake until a verified Arabic glyph map exists. */
export default function GtaIV() {
  const [gxt, setGxt] = useState<GtaIvGxtSummary | null>(null);
  const [oxt, setOxt] = useState<GtaIvOxtSummary | null>(null);
  const [busy, setBusy] = useState<"gxt" | "oxt" | null>(null);

  const inspectGxt = useCallback(async (file: File) => {
    setBusy("gxt");
    try {
      if (!/\.gxt$/i.test(file.name)) throw new Error("اختر ملف لغة GTA IV بصيغة .gxt.");
      const summary = inspectGtaIvGxt(await file.arrayBuffer());
      setGxt(summary);
      toast.success(`تم التحقق من ${summary.tables.length} جدولاً و${summary.entries.toLocaleString("ar")} سطراً.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فحص ملف GXT.");
    } finally {
      setBusy(null);
    }
  }, []);

  const inspectOxt = useCallback(async (file: File) => {
    setBusy("oxt");
    try {
      if (!/\.oxt$/i.test(file.name)) throw new Error("اختر ملف التصدير بصيغة .oxt.");
      const summary = inspectGtaIvOxt(await file.text());
      setOxt(summary);
      toast.success(`تم التحقق من OXT: ${summary.tables} جدولاً و${summary.entries.toLocaleString("ar")} مدخلاً.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فحص ملف OXT.");
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <section className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-primary">GTA IV · GXT / OXT</p>
            <h1 className="text-2xl font-bold">فاحص ملفات لغة GTA IV</h1>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">الرئيسية <ArrowRight className="inline h-4 w-4" /></Link>
        </header>

        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground">
          <p className="flex gap-2 font-semibold"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" /> المرحلة الحالية: فحص بنيوي للقراءة فقط.</p>
          <p className="mt-2 text-muted-foreground">لا يحرر هذا القسم النصوص ولا يبني GXT بعد. ملف GTA IV يستخدم وحدات محارف مرتبطة بالخط؛ لا يمكن كتابة العربية بأمان قبل فحص خط اللعبة وإنشاء خريطة ترميز عربية فعلية.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/35 bg-card p-6 text-center transition hover:border-primary">
            {busy === "gxt" ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <FileCode2 className="h-10 w-10 text-primary" />}
            <strong>1. افحص ملف اللغة الحقيقي</strong>
            <span className="text-sm text-muted-foreground"><code>russian.gxt</code> أو ملف <code>.gxt</code> آخر من GTA IV</span>
            <input className="sr-only" type="file" accept=".gxt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectGxt(file); }} />
            <span className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Upload className="me-1 inline h-4 w-4" /> اختيار GXT</span>
          </label>

          <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted bg-card p-6 text-center transition hover:border-primary">
            {busy === "oxt" ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <FileText className="h-10 w-10 text-muted-foreground" />}
            <strong>2. افحص ملف التصدير الاختياري</strong>
            <span className="text-sm text-muted-foreground"><code>russian.oxt</code> — نسخة تحريرية مطابقة لـGXT وليست ملفاً تقرأه اللعبة.</span>
            <input className="sr-only" type="file" accept=".oxt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectOxt(file); }} />
            <span className="rounded-md border border-border px-3 py-2 text-sm font-semibold"><Upload className="me-1 inline h-4 w-4" /> اختيار OXT</span>
          </label>
        </div>

        {(gxt || oxt) && <section className="mt-6 space-y-4 rounded-xl border bg-card p-5">
          <h2 className="font-bold">نتيجة الفحص</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {gxt && <Metric label="GXT" value={`Version ${gxt.version} · ${gxt.charSize}-bit`} />}
            {gxt && <Metric label="جداول GXT" value={gxt.tables.length.toLocaleString("ar")} />}
            {gxt && <Metric label="مدخلات GXT" value={gxt.entries.toLocaleString("ar")} />}
            {oxt && <Metric label="OXT" value={`${oxt.tables.toLocaleString("ar")} جدولاً · ${oxt.entries.toLocaleString("ar")} مدخلاً`} />}
          </div>
          {gxt && <div className="overflow-x-auto"><table className="w-full min-w-[460px] text-right text-sm"><thead className="border-b text-muted-foreground"><tr><th className="p-2">أول الجداول</th><th className="p-2">المدخلات</th><th className="p-2">حجم TDAT</th></tr></thead><tbody>{gxt.tables.slice(0, 12).map((table) => <tr className="border-b border-border/50" key={table.name}><td className="p-2 font-mono">{table.name}</td><td className="p-2">{table.entries.toLocaleString("ar")}</td><td className="p-2">{table.textBytes.toLocaleString("ar")} بايت</td></tr>)}</tbody></table></div>}
        </section>}

        <section className="mt-6 space-y-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          <p className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" /> يتحقق الفاحص من Version 4 وCharSize 16 وكتل <code>TABL</code> و<code>TKEY</code> و<code>TDAT</code> وإزاحات كل سجل قبل عرض أي نتيجة.</p>
          <p className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> تُعامل رموز GTA IV مثل <code>~n~</code> و<code>~r~</code> و<code>~z~</code> كرموز وقت تشغيل لا يجوز ترجمتها أو حذفها عند تفعيل محرر النصوص لاحقاً.</p>
          <p>الخطوة المطلوبة قبل التحرير والبناء: توفير ملفات خط GTA IV/المود أو تحديد مسارها، لفحص خريطة المحارف التي تستطيع اللعبة عرضها فعلياً. لا يكفي وجود <code>GXT</code> أو <code>OXT</code> وحدهما لإنتاج عربية قابلة للعرض.</p>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
