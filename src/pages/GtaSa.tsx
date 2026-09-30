import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileJson, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { idbSet } from "@/lib/idb-storage";
import { GTASA_SOURCE_GAME, importGtaSaJson } from "@/lib/gtasa/gtasa-editor-bridge";

export default function GtaSa() {
  const navigate = useNavigate(); const [busy, setBusy] = useState(false); const [count, setCount] = useState(0);
  const load = async (file: File) => {
    setBusy(true); try {
      const imported = importGtaSaJson(JSON.parse((await file.text()).replace(/^\uFEFF/, "")));
      const state = { entries: imported.entries, translations: imported.translations, freshExtraction: true };
      await Promise.all([idbSet("editorState", state), idbSet("editorState:gtasa", state), idbSet("editor-source-game", GTASA_SOURCE_GAME), idbSet("originalTexts", Object.fromEntries(imported.entries.map(e => [`${e.msbtFile}:${e.index}`, e.original])))]);
      setCount(imported.entries.length); toast.success(`تم تحميل ${imported.entries.length.toLocaleString("ar")} نصاً.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر قراءة ملف GTA San Andreas."); } finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-background text-foreground" dir="rtl"><section className="mx-auto max-w-3xl px-4 py-10"><Link to="/" className="text-sm text-muted-foreground hover:underline">الرئيسية</Link><h1 className="mt-4 text-2xl font-bold">GTA San Andreas — محرر النصوص</h1><p className="mt-2 text-sm text-muted-foreground">ارفع ملف JSON الخاص باللعبة (table وhash وsource وarabic). يعرض المحرر الأصل الإنجليزي والترجمة العربية، والسطر الذي ما زال إنجليزياً في حقل arabic يظهر بلا ترجمة، ويصدّر ملفاً بنفس الشكل لا يتغير فيه إلا حقل arabic.</p><div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm leading-7"><b>الرموز بين ~ ~</b> مثل <code dir="ltr">~s~</code> و<code dir="ltr">~b~</code> (ألوان) و<code dir="ltr">~n~</code> (سطر جديد) و<code dir="ltr">~1~</code> (رقم تضعه اللعبة) و<code dir="ltr">~widget_brake~</code> (أيقونة زر): أبقها كما هي وبالترتيب نفسه، وترجم الكلام الذي حولها فقط. علامة <code dir="ltr">$</code> والأرقام تبقى كما هي.</div><label className="mt-7 flex min-h-48 cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-primary/35 bg-card p-6 text-center"><FileJson className="h-11 w-11 text-primary"/><b>{busy ? "جارٍ قراءة الملف…" : "اختر ملف GTA-SA-Arabic.json"}</b><input className="hidden" type="file" accept="application/json,.json" disabled={busy} onChange={e => { const f=e.target.files?.[0]; if(f) void load(f); e.target.value=""; }}/>{busy && <Loader2 className="h-5 w-5 animate-spin"/>}</label>{count > 0 && <button className="mt-5 rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground" onClick={() => navigate("/editor")}>فتح المحرر ({count.toLocaleString("ar")} نص)</button>}</section></main>;
}
