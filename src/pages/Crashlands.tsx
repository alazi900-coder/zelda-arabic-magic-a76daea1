import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileJson, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { idbSet } from "@/lib/idb-storage";
import { CRASHLANDS_SOURCE_GAME, importCrashlandsJson } from "@/lib/crashlands/crashlands-editor-bridge";

export default function Crashlands() {
  const navigate = useNavigate(); const [busy, setBusy] = useState(false); const [count, setCount] = useState(0);
  const load = async (file: File) => {
    setBusy(true); try {
      const imported = importCrashlandsJson(JSON.parse(await file.text()));
      const state = { entries: imported.entries, translations: imported.translations, freshExtraction: true };
      await Promise.all([idbSet("editorState", state), idbSet("editorState:crashlands", state), idbSet("editor-source-game", CRASHLANDS_SOURCE_GAME), idbSet("originalTexts", Object.fromEntries(imported.entries.map(e => [`${e.msbtFile}:${e.index}`, e.original])))]);
      setCount(imported.entries.length); toast.success(`تم تحميل ${imported.entries.length.toLocaleString("ar")} نصاً.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر قراءة ملف Crashlands."); } finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-background text-foreground" dir="rtl"><section className="mx-auto max-w-3xl px-4 py-10"><Link to="/" className="text-sm text-muted-foreground hover:underline">الرئيسية</Link><h1 className="mt-4 text-2xl font-bold">Crashlands — محرر النصوص</h1><p className="mt-2 text-sm text-muted-foreground">ارفع ملف JSON الذي أرسلته لك. يعرض المحرر الأصل الإنجليزي والترجمة العربية ويصدّر ملفاً آمناً لإرساله لي لتطبيقه داخل APK.</p><label className="mt-7 flex min-h-48 cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-primary/35 bg-card p-6 text-center"><FileJson className="h-11 w-11 text-primary"/><b>{busy ? "جارٍ قراءة الملف…" : "اختر Crashlands-Arabic-Editable-All-Texts.json"}</b><input className="hidden" type="file" accept="application/json,.json" disabled={busy} onChange={e => { const f=e.target.files?.[0]; if(f) void load(f); }}/>{busy && <Loader2 className="h-5 w-5 animate-spin"/>}</label>{count > 0 && <button className="mt-5 rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground" onClick={() => navigate("/editor")}>فتح المحرر ({count.toLocaleString("ar")} نص)</button>}</section></main>;
}
