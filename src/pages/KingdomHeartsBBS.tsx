/**
 * STYLE: بوابة عملية هادئة بلون كهرماني للانتقال من ملفات CTD إلى المحرر
 * المشترك؛ لا تعرض محرراً ثانياً، بل تجعل الرفع خطوة واحدة قبل أدوات الترجمة.
 */

import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, FolderArchive, Image, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openKHBbsInEditor } from "@/lib/khbbs-editor-bridge";

export default function KingdomHeartsBBS() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFiles = useCallback(async (uploads: File[]) => {
    if (uploads.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await openKHBbsInEditor(uploads);
      toast.success(`تم فتح ${result.fileCount} ملف CTD وفيها ${result.entryCount} نص في المحرر`);
      if (result.rejected.length > 0) {
        toast.warning(`تم تجاهل ${result.rejected.length} عنصر غير صالح`);
      }
      navigate("/editor");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر فتح الملفات.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border transition-colors hover:border-amber-500/60 hover:text-amber-500" aria-label="العودة للرئيسية">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <p className="font-mono text-xs text-amber-500">PSP · CTD TEXT CONTAINERS</p>
              <h1 className="truncate font-display text-xl font-black md:text-2xl">Kingdom Hearts: Birth by Sleep</h1>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-10 md:py-16">
        <Link to="/kingdom-hearts-images" className="group mb-8 block overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-br from-amber-500/20 via-card to-card p-6 shadow-lg shadow-amber-500/5 transition-all hover:border-amber-400 hover:shadow-xl hover:shadow-amber-500/10 md:p-9">
          <div className="flex min-h-[250px] flex-col items-center justify-center text-center sm:min-h-[280px]">
            <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-amber-400/35 bg-amber-500/20 text-amber-300 shadow-inner shadow-amber-100/10 transition-transform duration-200 group-hover:scale-105">
              <Image className="h-10 w-10" />
            </span>
            <p className="mb-2 font-mono text-xs tracking-[0.18em] text-amber-300">PSP · TIM2 IMAGE RESOURCES</p>
            <h2 className="font-display text-3xl font-black text-foreground md:text-4xl">أداة صور Kingdom Hearts</h2>
            <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">افتح صور TIM2 مثل NEW GAME والقوائم والشعارات المرسومة، ثم نزّلها وعدّلها وأعدها باللوحة والترميز الأصليين.</p>
            <span className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-amber-500 px-7 py-3 text-base font-black text-black shadow-md shadow-amber-500/25 transition-colors group-hover:bg-amber-400">
              <Image className="ml-2 h-5 w-5" />افتح أداة الصور
            </span>
          </div>
        </Link>
        <div
          onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (!loading) void openFiles(Array.from(event.dataTransfer.files));
          }}
          className={`rounded-3xl border-2 border-dashed p-8 text-center transition-colors md:p-14 ${dragActive ? "border-amber-500 bg-amber-500/10" : "border-border bg-card/40"}`}
        >
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
            <FolderArchive className="h-8 w-8" />
          </div>
          <h2 className="mb-3 font-display text-2xl font-black">افتح النصوص في محرر الأداة</h2>
          <p className="mx-auto mb-6 max-w-2xl leading-relaxed text-muted-foreground">
            ارفع ملفات <bdi>.CTD</bdi> متعددة أو أرشيف <bdi>ZIP</bdi> يحتويها. ستنتقل مباشرة إلى المحرر المشترك مع كل النصوص، الترجمة التلقائية، الفحص العميق وأدوات البحث والاستبدال.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".ctd,.zip,application/zip"
            multiple
            className="hidden"
            onChange={(event) => {
              const uploads = Array.from(event.target.files || []);
              event.target.value = "";
              void openFiles(uploads);
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={loading} size="lg" className="bg-amber-500 font-bold text-black hover:bg-amber-400">
            {loading ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : <Upload className="ml-2 h-5 w-5" />}
            {loading ? "جارٍ فتح الملفات" : "اختر ملفات CTD أو ZIP"}
          </Button>
          <p className="mt-5 text-xs text-muted-foreground">المعالجة محلية داخل المتصفح؛ لا يُرفع ملف اللعبة إلى خادم.</p>
        </div>

        {error && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm whitespace-pre-line">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-relaxed">
          <b>داخل المحرر:</b> تظهر وسوم التحكم بصيغة <code dir="ltr" className="rounded bg-background px-1 py-0.5">[CTD:F9 59]</code> وتبقى محمية عند البناء. زر البناء في المحرر ينشئ أرشيف ZIP واحداً يضم كل ملفات CTD بأسمائها ومساراتها الأصلية. معالجة العربية تُطبّق عند البناء؛ هذه المرحلة لا تحقن خط اللعبة.
        </div>
      </section>
    </main>
  );
}
