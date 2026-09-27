import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileJson, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { idbSet } from "@/lib/idb-storage";
import { TWOM_SOURCE_GAME, importTwomJson } from "@/lib/twom/twom-editor-bridge";

export default function TwomStories() {
  const navigate = useNavigate(); const [busy, setBusy] = useState(false); const [count, setCount] = useState(0);
  const load = async (file: File) => {
    setBusy(true); try {
      const imported = importTwomJson(JSON.parse((await file.text()).replace(/^\uFEFF/, "")));
      const state = { entries: imported.entries, translations: imported.translations, freshExtraction: true };
      await Promise.all([idbSet("editorState", state), idbSet("editorState:twom", state), idbSet("editor-source-game", TWOM_SOURCE_GAME), idbSet("originalTexts", Object.fromEntries(imported.entries.map(e => [`${e.msbtFile}:${e.index}`, e.original])))]);
      setCount(imported.entries.length); toast.success(`تم تحميل ${imported.entries.length.toLocaleString("ar")} نصاً.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر قراءة ملف This War of Mine: Stories."); } finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-background text-foreground" dir="rtl"><section className="mx-auto max-w-3xl px-4 py-10"><Link to="/" className="text-sm text-muted-foreground hover:underline">الرئيسية</Link><h1 className="mt-4 text-2xl font-bold">This War of Mine: Stories — محرر النصوص</h1><p className="mt-2 text-sm text-muted-foreground">ارفع ملف JSON الخاص باللعبة. يعرض المحرر الأصل الإنجليزي، والترجمات الموجودة مسبقاً تظهر جاهزة، ويصدّر ملفاً بنفس الشكل لا يتغير فيه إلا حقل الترجمة.</p><div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm leading-7"><b>وسوم الجنس</b> مثل <code dir="ltr">{"{mr|he}{fr|she}"}</code>: اترك البداية <code dir="ltr">{"{mr|"}</code> والنهاية <code dir="ltr">{"}"}</code> كما هما وترجم الكلمة التي بينهما، مثل <code dir="ltr">{"{mr|هو}{fr|هي}"}</code>. يمكنك وضع فعل كامل داخل الوسم، مثل <code dir="ltr">{"{mr|ذهب}{fr|ذهبت}"}</code>. الرموز الأخرى مثل <code dir="ltr">^CharacterName^</code> و<code dir="ltr">{"<BR>"}</code> و<code dir="ltr">|XPadA|</code> تبقى كما هي.</div><label className="mt-7 flex min-h-48 cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-primary/35 bg-card p-6 text-center"><FileJson className="h-11 w-11 text-primary"/><b>{busy ? "جارٍ قراءة الملف…" : "اختر ملف TWoM-Stories-All-Texts.json"}</b><input className="hidden" type="file" disabled={busy} onChange={e => { const f=e.target.files?.[0]; if(f) void load(f); e.target.value=""; }}/>{busy && <Loader2 className="h-5 w-5 animate-spin"/>}</label>{count > 0 && <button className="mt-5 rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground" onClick={() => navigate("/editor")}>فتح المحرر ({count.toLocaleString("ar")} نص)</button>}</section></main>;
}
