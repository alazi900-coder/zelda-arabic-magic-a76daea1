import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { idbGet, idbSet } from "@/lib/idb-storage";

/** V2 performance: load the Unity bundle bridge only after the user chooses a bundle. */
export default function LumenTale() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [summary, setSummary] = useState<{ tables: number; entries: number } | null>(null);
  const navigate = useNavigate();

  const openBundle = useCallback(async (file: File) => {
    setBusy(true);
    try {
      if (!file.name.endsWith(".bundle")) {
        throw new Error("اختر ملف Unity Bundle الخاص بالنص الإنجليزي (.bundle).");
      }
      const bridgePromise = import("@/lib/lumentale/lumentale-editor-bridge");
      const bytes = await file.arrayBuffer();
      const {
        extractLumenTaleEntries,
        LUMENTALE_BUFFER_KEY,
        LUMENTALE_META_KEY,
        LUMENTALE_SOURCE_GAME,
      } = await bridgePromise;
      const { entries, tables } = await extractLumenTaleEntries(bytes);
      const previous = await idbGet<{ translations?: Record<string, string>; entries?: { msbtFile: string; index: number }[] }>("editorState");
      const previousMeta = await idbGet<{
        tables?: Array<{ table: string; rows?: Array<{ editorKey: string; m_Id: string }> }>;
      }>(LUMENTALE_META_KEY);
      const allowed = new Set(entries.map((entry) => `${entry.msbtFile}:${entry.index}`));
      const translations: Record<string, string> = {};
      const previousIdentityByKey = new Map<string, string>();
      for (const table of previousMeta?.tables ?? []) {
        for (const row of table.rows ?? []) previousIdentityByKey.set(row.editorKey, `${table.table}\u0000${row.m_Id}`);
      }
      const nextKeyByIdentity = new Map<string, string>();
      for (const table of tables) {
        for (const row of table.rows) nextKeyByIdentity.set(`${table.table}\u0000${row.m_Id}`, row.editorKey);
      }
      for (const [oldKey, value] of Object.entries(previous?.translations ?? {})) {
        const identity = previousIdentityByKey.get(oldKey);
        const nextKey = identity ? nextKeyByIdentity.get(identity) : oldKey;
        if (nextKey && allowed.has(nextKey) && value) translations[nextKey] = value;
      }
      await idbSet("editorState", { entries, translations, freshExtraction: true });
      await idbSet("editor-source-game", LUMENTALE_SOURCE_GAME);
      await idbSet(LUMENTALE_BUFFER_KEY, bytes.slice(0));
      await idbSet(LUMENTALE_META_KEY, { originalName: file.name, tables });
      const originals: Record<string, string> = {};
      for (const entry of entries) originals[`${entry.msbtFile}:${entry.index}`] = entry.original;
      await idbSet("originalTexts", originals);
      setSummary({ tables: tables.length, entries: entries.length });
      toast.success(`فُتح ${tables.length} جدولاً و${entries.length} سطراً بأمان`);
      navigate("/editor");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فتح حزمة LumenTale");
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <section className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-primary">Unity Localization Tables</p>
            <h1 className="text-2xl font-bold">تعريب LumenTale: Memories of Trey</h1>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">الرئيسية <ArrowRight className="inline h-4 w-4" /></Link>
        </header>

        <label
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-12 text-center transition ${dragOver ? "border-primary bg-primary/5" : "border-muted"}`}
          onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => { event.preventDefault(); setDragOver(false); const file = event.dataTransfer.files[0]; if (file) void openBundle(file); }}
        >
          {busy ? <Loader2 className="h-10 w-10 animate-spin" /> : <Upload className="h-10 w-10 text-muted-foreground" />}
          <strong>افتح حزمة اللغة الإنجليزية</strong>
          <span className="text-sm text-muted-foreground"><code>localization-string-tables-english_assets_all.bundle</code></span>
          <input
            className="block w-full max-w-md cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground file:me-3 file:cursor-pointer file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground"
            type="file"
            accept=".bundle"
            aria-label="اختيار حزمة LumenTale الإنجليزية"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void openBundle(file); }}
          />
        </label>

        {summary && <div className="mt-5 flex gap-2 rounded-lg border p-4 text-sm"><FileText className="h-5 w-5 text-primary" /> فُهرس {summary.tables} جدولاً و{summary.entries} سجلاً.</div>}
        <div className="mt-8 space-y-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          <p className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" /> تحفظ الأداة اسم الجدول و<code>m_Id</code> كهوية تقنية ثابتة. لا يُترجمان ولا يُعاد ترتيبهما.</p>
          <p>تحمي الأداة أيضاً المتغيرات مثل <code>{"{0}"}</code> ووسوم Unity مثل <code>{"<color>…</color>"}</code> وأوامر السطر. أي ترجمة تغيّر رمزاً تقنياً ستُعلَّم للمراجعة ولن تدخل البناء.</p>
          <p>من المحرر استخدم البرومبتات الخاصة بأسماء Animon، والحوارات، والوصف الموسوعي، والعناصر والواجهة. لا يُبنى ملف نهائي قبل أن تتوافق كل الرموز المحمية.</p>
        </div>
      </section>
    </main>
  );
}
