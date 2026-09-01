/** Fire Emblem 12 (NDS) design: upload one .nds ROM; extraction reads every
 * translatable text record under NitroFS's m/ folder (see
 * fe12-editor-bridge.ts for the format and the control-code safety rules).
 * Building always redraws the 124-glyph Arabic charmap into fonts/talk and
 * rewrites every edited text file, using the cartridge's own unused padding
 * space for anything that grew — see nds-rom-builder.ts. */
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, FileCode2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  extractFireEmblem12Entries,
  FE12_BUFFER_KEY,
  FE12_SOURCE_GAME,
  FE12_SOURCE_NAME_KEY,
  type Fe12EditorImport,
} from "@/lib/fireemblem12/fe12-editor-bridge";
import { idbSet } from "@/lib/idb-storage";

export default function FireEmblem12() {
  const [summary, setSummary] = useState<Fe12EditorImport | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const inspectRom = useCallback(async (file: File) => {
    setBusy(true);
    try {
      if (!/\.nds$/i.test(file.name)) throw new Error("اختر ملف روم بصيغة .nds.");
      const buffer = await file.arrayBuffer();
      const imported = extractFireEmblem12Entries(buffer);
      if (imported.entries.length === 0) throw new Error("لم يُعثر على أي نصٍّ قابلٍ للترجمة داخل هذا الروم.");

      const editorState = { entries: imported.entries, translations: {}, freshExtraction: true };
      const originals = Object.fromEntries(imported.entries.map((entry) => [`${entry.msbtFile}:${entry.index}`, entry.original]));
      await idbSet("editorState", editorState);
      await idbSet("editorState:fe12", editorState);
      await idbSet("editor-source-game", FE12_SOURCE_GAME);
      await idbSet("originalTexts", originals);
      await idbSet(FE12_BUFFER_KEY, buffer.slice(0));
      await idbSet(FE12_SOURCE_NAME_KEY, file.name);

      setSummary(imported);
      setSourceName(file.name);
      toast.success(`قُرئ الروم: ${imported.translatableRecordCount.toLocaleString("ar")} سطراً قابلاً للترجمة عبر ${imported.fileCount.toLocaleString("ar")} ملفّ.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّرت قراءة ملف الروم.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <section className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-primary">Fire Emblem 12 · NDS</p>
            <h1 className="text-2xl font-bold">مسار ترجمة Fire Emblem 12</h1>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">الرئيسية <ArrowRight className="inline h-4 w-4" /></Link>
        </header>

        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
          <p className="flex gap-2 font-semibold"><FileCode2 className="h-5 w-5 shrink-0 text-primary" /> ارفع ملف الروم (.nds) — يُستخرَج منه كل نصٍّ قابلٍ للترجمة، ويُبنى النسخة المعرَّبة منه نفسه.</p>
          <p className="mt-2 text-muted-foreground">الحروف العربية تُرسَم داخل خانات الخطّ غير المستخدمة (كانجي لا تظهر في نسخةٍ إنجليزية)، والبناء لا يتقيّد بحجم الملفّ — الروم يملك مساحةً فارغة كافية داخله.</p>
        </div>

        <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/35 bg-card p-6 text-center transition hover:border-primary">
          {busy ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <FileCode2 className="h-10 w-10 text-primary" />}
          <strong>ملفّ الروم</strong>
          <span className="text-sm text-muted-foreground">صيغة <code>.nds</code></span>
          <label className="sr-only" htmlFor="fe12-rom-input">اختر ملف الروم</label>
          <input id="fe12-rom-input" aria-label="اختر ملف الروم" className="block w-full max-w-sm cursor-pointer rounded-md border border-primary/45 bg-background px-3 py-2 text-sm text-foreground file:me-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-primary-foreground" type="file" accept=".nds" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectRom(file); }} />
          {summary && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {sourceName} · {summary.translatableRecordCount.toLocaleString("ar")} سطراً</span>}
        </div>

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            disabled={!summary}
            onClick={() => navigate("/editor")}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {summary ? "افتح المحرر" : "ارفع الروم للمتابعة"}
          </button>
        </div>

        {summary && <section className="mt-6 space-y-4 rounded-xl border bg-card p-5">
          <h2 className="font-bold">نتيجة الفحص</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="ملفّات نصّية" value={summary.fileCount.toLocaleString("ar")} />
            <Metric label="أسطرٌ قابلة للترجمة" value={summary.translatableRecordCount.toLocaleString("ar")} />
            <Metric label="أسطرٌ مُستثناة" value={summary.excludedRecordCount.toLocaleString("ar")} />
          </div>
          {summary.excludedRecordCount > 0 && (
            <p className="text-xs text-muted-foreground">الأسطر المُستثناة تحمل رموز تحكّمٍ لم يُتحقَّق من صيغتها بعد (أكثر من غلاف نصٍّ واحد، أو رمز غير معروف) — استُبعدت بدل المخاطرة بإفساد بنية الملفّ.</p>
          )}
        </section>}

        <section className="mt-6 space-y-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          <p className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" /> يُتحقَّق من بنية كل ملفٍّ (رأسٍ وجدول سجلّات) قبل قبوله كنصٍّ قابلٍ للترجمة — أي ملفٍّ لا يطابق البنية يُتجاهَل تلقائياً.</p>
          <p className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> رموز فتح/إغلاق الحوار وأوامر المشهد تُحفَظ حرفياً حول ترجمتك، ولا تُترجَم.</p>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
