import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Disc3, FileText, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { idbGet, idbSet } from "@/lib/idb-storage";
import {
  importSteinsGateIso,
  STEINSGATE_SOURCE_GAME,
  STEINSGATE_WORKSPACE_KEY,
  type SteinsGateWorkspace,
} from "@/lib/steinsgate/steinsgate-format";

export default function SteinsGatePSP() {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ name: string; lines: number; files: number } | null>(null);
  const navigate = useNavigate();

  const inspectIso = useCallback(async (file: File) => {
    setBusy(true);
    try {
      if (!/\.(?:iso|chd)$/i.test(file.name) && file.type !== "application/x-iso9660-image") {
        throw new Error("اختر ملف Steins;Gate PSP بصيغة ISO. يمكن اختيار CHD لمعرفة أنه يحتاج فك ضغط.");
      }
      const imported = await importSteinsGateIso(file);
      const oldState = await idbGet<{ translations?: Record<string, string> }>("editorState:steinsgate");
      const allowed = new Set(imported.entries.map((entry) => `${entry.msbtFile}:${entry.index}`));
      const translations = Object.fromEntries(Object.entries(oldState?.translations ?? {}).filter(([key]) => allowed.has(key)));
      const editorState = { entries: imported.entries, translations, freshExtraction: true };
      const originals = Object.fromEntries(imported.entries.map((entry) => [`${entry.msbtFile}:${entry.index}`, entry.original]));
      await Promise.all([
        idbSet(STEINSGATE_WORKSPACE_KEY, imported.workspace satisfies SteinsGateWorkspace),
        idbSet("editorState", editorState),
        idbSet("editorState:steinsgate", editorState),
        idbSet("editor-source-game", STEINSGATE_SOURCE_GAME),
        idbSet("originalTexts", originals),
      ]);
      setSummary({ name: file.name, lines: imported.entries.length, files: imported.scriptFiles });
      toast.success(`استُخرج ${imported.entries.length.toLocaleString("ar")} نصاً من ${imported.scriptFiles.toLocaleString("ar")} ملف BIN.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فحص ملف اللعبة.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <section className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-primary">Steins;Gate · PSP · ULJM05887</p>
            <h1 className="text-2xl font-bold">مسار تعريب Steins;Gate PSP</h1>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">الرئيسية <ArrowRight className="inline h-4 w-4" /></Link>
        </header>

        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="flex gap-2 font-semibold"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" /> الاستخراج والبناء محليان داخل المتصفح؛ ملف اللعبة لا يُرفع إلى خادم.</p>
          <p className="mt-2 text-muted-foreground">يدعم ISO الإنجليزي v1.0.1. يحمي وسوم المحرك مثل <code>%K</code> و<code>%P</code> و<code>%CF…</code>، ويحقن الخط العربي المتصل أثناء البناء. ملفات CHD يجب فك ضغطها إلى ISO أولاً.</p>
        </div>

        <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-primary/35 bg-card p-7 text-center transition hover:border-primary">
          {busy ? <Loader2 className="h-12 w-12 animate-spin text-primary" /> : <Disc3 className="h-12 w-12 text-primary" />}
          <strong>ارفع ملف اللعبة الإنجليزي</strong>
          <span className="max-w-xl text-sm text-muted-foreground">يُقرأ DATA0.AFS فقط لاستخراج نصوص القصة والقوائم والنظام والمصطلحات. عند البناء سيُطلب منك اختيار ISO نفسه مرة أخرى.</span>
          <input
            aria-label="اختر ملف Steins;Gate PSP"
            className="block w-full max-w-md cursor-pointer rounded-md border border-primary/45 bg-background px-3 py-2 text-sm file:me-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-primary-foreground"
            type="file"
            accept=".iso,.chd,application/x-iso9660-image"
            disabled={busy}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectIso(file); }}
          />
          {summary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> {summary.name} · {summary.lines.toLocaleString("ar")} نص · {summary.files.toLocaleString("ar")} ملف
            </span>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <button type="button" disabled={!summary} onClick={() => navigate("/editor")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
            <FileText className="h-4 w-4" /> {summary ? "افتح النصوص في المحرر" : "ارفع ISO للمتابعة"}
          </button>
        </div>
      </section>
    </main>
  );
}
