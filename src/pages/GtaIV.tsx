/** GTA IV design: translate from american.gxt (plain English, no font quirks); building writes the translation into russian.gxt — the Russian-slot Arabic mod's own GXT, the only file whose font can draw Arabic. See gtaiv-editor-bridge.ts and gtaiv-ru-charmap.ts. */
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, FileCode2, Loader2, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { gtaIvRawUnitsToString, inspectGtaIvGxt, parseGtaIvGxt, type GtaIvGxtSummary } from "@/lib/gtaiv/gxt-format";
import {
  extractGtaIvEntries,
  GTAIV_BUFFER_KEY,
  GTAIV_CONTAINER_BUFFER_KEY,
  GTAIV_CONTAINER_NAME_KEY,
  GTAIV_SOURCE_GAME,
  GTAIV_SOURCE_NAME_KEY,
} from "@/lib/gtaiv/gtaiv-editor-bridge";
import { idbGet, idbSet } from "@/lib/idb-storage";

type EnglishSourceRow = { table: string; crc: number; value: string };

export default function GtaIV() {
  const [gxt, setGxt] = useState<GtaIvGxtSummary | null>(null);
  const [rows, setRows] = useState<EnglishSourceRow[]>([]);
  const [sourceName, setSourceName] = useState("");
  const [container, setContainer] = useState<{ name: string; summary: GtaIvGxtSummary } | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTable, setSelectedTable] = useState("ALL");
  const navigate = useNavigate();

  const inspectEnglishGxt = useCallback(async (file: File) => {
    setBusy(true);
    try {
      if (!/\.gxt$/i.test(file.name)) throw new Error("اختر ملف american.gxt بصيغة .gxt.");
      const buffer = await file.arrayBuffer();
      const summary = inspectGtaIvGxt(buffer);
      const parsed = parseGtaIvGxt(buffer);
      const sourceRows = parsed.tables.flatMap((table) => table.entries.map((entry) => ({
        table: table.name,
        crc: entry.crc,
        value: gtaIvRawUnitsToString(entry.textUnits),
      })));

      setGxt(summary);
      setRows(sourceRows);
      setSourceName(file.name);
      setQuery("");
      setSelectedTable("ALL");
      const imported = extractGtaIvEntries(buffer);
      const oldState = await idbGet<{ translations?: Record<string, string> }>("editorState:gtaiv");
      const allowed = new Set(imported.entries.map((entry) => `${entry.msbtFile}:${entry.index}`));
      const translations = Object.fromEntries(Object.entries(oldState?.translations || {}).filter(([key, value]) => allowed.has(key) && value));
      const editorState = { entries: imported.entries, translations, freshExtraction: true };
      const originals = Object.fromEntries(imported.entries.map((entry) => [`${entry.msbtFile}:${entry.index}`, entry.original]));
      await idbSet("editorState", editorState);
      await idbSet("editorState:gtaiv", editorState);
      await idbSet("editor-source-game", GTAIV_SOURCE_GAME);
      await idbSet("originalTexts", originals);
      await idbSet(GTAIV_BUFFER_KEY, buffer.slice(0));
      await idbSet(GTAIV_SOURCE_NAME_KEY, file.name);
      toast.success(`قُرئ المصدر الإنجليزي: ${summary.entries.toLocaleString("ar")} سطراً.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر قراءة american.gxt.");
    } finally {
      setBusy(false);
    }
  }, []);

  const inspectRussianContainer = useCallback(async (file: File) => {
    setBusy(true);
    try {
      if (!/\.gxt$/i.test(file.name)) throw new Error("اختر ملف russian.gxt بصيغة .gxt.");
      const buffer = await file.arrayBuffer();
      const summary = inspectGtaIvGxt(buffer);
      setContainer({ name: file.name, summary });
      await idbSet(GTAIV_CONTAINER_BUFFER_KEY, buffer.slice(0));
      await idbSet(GTAIV_CONTAINER_NAME_KEY, file.name);
      toast.success(`قُرئت حاوية البناء: ${summary.entries.toLocaleString("ar")} سطراً.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر قراءة russian.gxt.");
    } finally {
      setBusy(false);
    }
  }, []);

  const bothReady = Boolean(gxt && container);

  const tables = useMemo(() => Array.from(new Set(rows.map((row) => row.table))).sort(), [rows]);
  const filteredRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (selectedTable !== "ALL" && row.table !== selectedTable) return false;
      return !term || row.value.toLocaleLowerCase().includes(term) || row.crc.toString(16).includes(term.replace(/^0x/i, ""));
    });
  }, [query, rows, selectedTable]);
  const visibleRows = filteredRows.slice(0, 120);

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <section className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-primary">GTA IV · ترجمة إنجليزية، بناء في حاوية المود الروسي</p>
            <h1 className="text-2xl font-bold">مسار ترجمة GTA IV</h1>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">الرئيسية <ArrowRight className="inline h-4 w-4" /></Link>
        </header>

        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
          <p className="flex gap-2 font-semibold"><FileCode2 className="h-5 w-5 shrink-0 text-primary" /> ترجم من النص الإنجليزي العادي؛ البناء يكتب ترجمتك داخل russian.gxt.</p>
          <p className="mt-2 text-muted-foreground">حمّل الملفّين مرّةً واحدة: <code>american.gxt</code> لتُترجم منه، و<code>russian.gxt</code> (مود GTA IV العربي) كحاوية بناء — هو الوحيد الذي يملك خطاً يرسم العربية. أي سطرٍ لا تترجمه يبقى بترجمته القديمة في الروسي.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/35 bg-card p-6 text-center transition hover:border-primary">
            {busy ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <FileCode2 className="h-10 w-10 text-primary" />}
            <strong>١. النص الإنجليزي لتترجم منه</strong>
            <span className="text-sm text-muted-foreground"><code>american.gxt</code> من GTA IV</span>
            <label className="sr-only" htmlFor="american-gxt-input">اختر ملف american.gxt</label>
            <input id="american-gxt-input" aria-label="اختر ملف american.gxt" className="block w-full max-w-sm cursor-pointer rounded-md border border-primary/45 bg-background px-3 py-2 text-sm text-foreground file:me-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-primary-foreground" type="file" accept=".gxt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectEnglishGxt(file); }} />
            {gxt && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {sourceName} · {gxt.entries.toLocaleString("ar")} سطراً</span>}
          </div>

          <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/35 bg-card p-6 text-center transition hover:border-primary">
            {busy ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <FileCode2 className="h-10 w-10 text-primary" />}
            <strong>٢. حاوية البناء العربية</strong>
            <span className="text-sm text-muted-foreground"><code>russian.gxt</code> من مود GTA IV العربي</span>
            <label className="sr-only" htmlFor="russian-gxt-input">اختر ملف russian.gxt</label>
            <input id="russian-gxt-input" aria-label="اختر ملف russian.gxt" className="block w-full max-w-sm cursor-pointer rounded-md border border-primary/45 bg-background px-3 py-2 text-sm text-foreground file:me-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-primary-foreground" type="file" accept=".gxt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectRussianContainer(file); }} />
            {container && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {container.name} · {container.summary.entries.toLocaleString("ar")} سطراً</span>}
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            disabled={!bothReady}
            onClick={() => navigate("/editor")}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {bothReady ? "افتح المحرر" : "ارفع الملفّين للمتابعة"}
          </button>
        </div>

        {gxt && <section className="mt-6 space-y-4 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">النص الإنجليزي المصدر</h2>
              <p className="mt-1 text-sm text-muted-foreground"><code>{sourceName}</code> · عرض للقراءة فقط</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> جاهز للتحرير والبناء داخل المحرر</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="GXT" value={`Version ${gxt.version} · ${gxt.charSize}-bit`} />
            <Metric label="جداول GXT" value={gxt.tables.length.toLocaleString("ar")} />
            <Metric label="مدخلات GXT" value={gxt.entries.toLocaleString("ar")} />
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <label className="relative block"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border bg-background py-2 pr-10 pl-3 text-sm outline-none ring-primary focus:ring-2" placeholder="ابحث بالنص الإنجليزي أو CRC…" /></label>
            <select value={selectedTable} onChange={(event) => setSelectedTable(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="ALL">كل الجداول</option>{tables.map((table) => <option key={table} value={table}>{table}</option>)}</select>
          </div>
          <p className="text-xs text-muted-foreground">{filteredRows.length.toLocaleString("ar")} نتيجة. يعرض الجدول أول {visibleRows.length.toLocaleString("ar")} نتيجة فقط للحفاظ على سرعة الصفحة.</p>
          <div className="max-h-[34rem] overflow-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-right text-sm">
              <thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="p-3">الجدول</th><th className="p-3">CRC</th><th className="p-3">النص الإنجليزي</th></tr></thead>
              <tbody>{visibleRows.map((row) => <tr className="border-t border-border/60 align-top" key={`${row.table}:${row.crc}`}><td className="p-3 font-mono text-xs">{row.table}</td><td className="p-3 font-mono text-xs">0x{row.crc.toString(16).padStart(8, "0")}</td><td className="p-3" dir="ltr"><EnglishValue value={row.value} /></td></tr>)}</tbody>
            </table>
          </div>
        </section>}

        <section className="mt-6 space-y-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          <p className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" /> يتحقق القارئ من Version 4 وCharSize 16 وكتل <code>TABL</code> و<code>TKEY</code> و<code>TDAT</code> وإزاحات كل سجل قبل عرض النتيجة.</p>
          <p className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> تُميز رموز GTA IV مثل <code>~n~</code> و<code>~r~</code> و<code>~z~</code> بلون منفصل، وتُفحص دائماً مقابل النص الإنجليزي — لا مقابل ما كان موجوداً بالروسي.</p>
          <p>الجدول والهوية (CRC) يطابقان بين الملفّين تلقائياً حتى لو اختلفت حالة أحرف اسم الجدول. أي هويةٍ إنجليزية بلا مقابلٍ في الروسي تُستثنى من البناء مع تنبيهٍ بالعدد.</p>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function EnglishValue({ value }: { value: string }) {
  return <>{value.split(/(~[^~]+~)/g).map((part, index) => /^~[^~]+~$/.test(part) ? <code className="rounded bg-primary/10 px-1 py-0.5 text-primary" key={`${part}-${index}`}>{part}</code> : <span key={`${part}-${index}`}>{part}</span>)}</>;
}
