import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Download, FileJson2, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { idbGet, idbSet } from "@/lib/idb-storage";
import type { ExtractedEntry } from "@/components/editor/types";
import {
  BLACK2_DOCUMENT_KEY, BLACK2_SOURCE_GAME, exportBlack2Json, parseBlack2Json,
  type Black2JsonDocument,
} from "@/lib/pokemon-black2/black2-json";

/** JSON-only translation workspace. ROM insertion is deliberately not claimed. */
export default function Black2Text() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  // FileReader works on Android WebView with large exported JSON files.
  const readJsonFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("فشل قراءة ملف JSON"));
    reader.readAsText(file, "utf-8");
  });

  const loadFile = async (file: File) => {
    if (!/\.json$/i.test(file.name)) { toast.error("اختر ملف JSON الخاص بـ Pokémon Black 2"); return; }
    setBusy(true);
    try {
      const { document, entries, translations } = parseBlack2Json(await readJsonFile(file));
      const saved = await idbGet<{ entries: ExtractedEntry[]; translations: Record<string, string> }>(
        "editorState:black2"
      );
      if (saved?.entries?.length === entries.length) {
        const oldByKey = new Map(saved.entries.map(e => [e.msbtFile + ":" + e.index, e.original]));
        for (const e of entries) {
          const key = e.msbtFile + ":" + e.index;
          if (oldByKey.get(key) === e.original && typeof saved.translations?.[key] === "string") {
            translations[key] = saved.translations[key];
          }
        }
      }
      // Guard the existing shared editor session before switching games.
      const previousSource = await idbGet<string>("editor-source-game");
      const previous = await idbGet<{ entries?: ExtractedEntry[]; translations?: Record<string, string> }>("editorState");
      if (previousSource && previous?.entries?.length && previousSource !== BLACK2_SOURCE_GAME) {
        await idbSet("editorState:" + previousSource, previous);
      }
      await idbSet(BLACK2_DOCUMENT_KEY, document);
      const snapshot = { entries, translations, freshExtraction: true };
      await idbSet("editorState:black2", snapshot);
      await idbSet("originalTexts", Object.fromEntries(entries.map(e => [e.msbtFile + ":" + e.index, e.original])));
      await idbSet("editor-source-game", BLACK2_SOURCE_GAME);
      await idbSet("editorState", snapshot);
      toast.success("تم فتح " + entries.length.toLocaleString("ar") + " نصًا من Pokémon Black 2 — اختر بطاقات الفلاتر أعلى المحرر");
      navigate("/editor");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فتح ملف الترجمة");
    } finally {
      setBusy(false);
    }
  };

  const downloadJson = async () => {
    setBusy(true);
    try {
      const doc = await idbGet<Black2JsonDocument>(BLACK2_DOCUMENT_KEY);
      const activeGame = await idbGet<string>("editor-source-game");
      const snapshot = activeGame === BLACK2_SOURCE_GAME
        ? await idbGet<{ entries: ExtractedEntry[]; translations: Record<string, string> }>("editorState")
        : await idbGet<{ entries: ExtractedEntry[]; translations: Record<string, string> }>("editorState:black2");
      if (!doc || !snapshot?.entries?.length) throw new Error("ارفع JSON أولًا وافتحه في المحرر");
      const output = exportBlack2Json(doc, snapshot.entries, snapshot.translations || {});
      const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "Pokemon-Black-2-Arabic-Translated.json";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير الترجمة مع الحفاظ على البنوك والمعرفات والوسوم");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل تصدير JSON");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/platinum/text" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="h-4 w-4" /> العودة إلى Pokémon Platinum
        </Link>
        <div className="my-8 rounded-2xl border bg-gradient-to-bl from-slate-900 to-blue-950 p-7 text-white shadow-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm">
            <ShieldCheck className="h-4 w-4" /> مشروع تعريب مستقل ومحمي
          </span>
          <h1 className="mt-5 text-3xl font-black">Pokémon Black 2</h1>
          <p className="mt-3 leading-7 text-slate-200">
            استيراد ملف JSON الكامل، تحرير النصوص في المحرر المشترك، وحفظ الترجمات بعيدًا عن Pokémon Platinum.
          </p>
        </div>
        <label
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) void loadFile(file); }}
          className={"flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition " + (dragOver ? "border-primary bg-primary/5" : "border-muted")}
        >
          {busy ? <Loader2 className="h-9 w-9 animate-spin" /> : <Upload className="h-9 w-9 text-primary" />}
          <strong>ارفع Pokemon-Black-2-English-Translatable-Texts.json</strong>
          <span className="text-sm text-muted-foreground">ملفك الصحيح: 52,636 نصًا موزعة على 918 بنكًا • بطاقات فلاتر مستقلة في المحرر</span>
          <input type="file" accept=".json,application/json" disabled={busy} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }} />
        </label>
        <button type="button" disabled={busy} onClick={() => void downloadJson()}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-card p-4 font-semibold hover:bg-accent disabled:opacity-50">
          <Download className="h-5 w-5" /> تصدير ملف JSON بعد الترجمة
        </button>
        <div className="mt-7 space-y-3 rounded-xl border p-5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-bold text-foreground"><FileJson2 className="h-5 w-5" /> قواعد الحماية</p>
          <p>تُقارن أوامر <code dir="ltr">[CTRL:...]</code> و<code dir="ltr">[CHAR:...]</code> حرفيًا وبالترتيب. يُرفض حفظ أي ترجمة تحذفها أو تغيّر فواصل الأسطر.</p>
          <p>لا يُعدّل التصدير سوى حقل <code>arabic</code>. تبقى بيانات <code>metadata</code> و<code>banks</code> والمعرّفات والمراجع وحقول الضغط كما هي. السطر ذو الترجمة الفارغة يبقى دون تغيير.</p>
          <p>النتيجة ملف JSON صالح للاستيراد في أدوات إعادة تركيب Black 2 المتوافقة. هذه الصفحة لا تعيد بناء ملف NDS تلقائيًا ولا تستخدم باني Platinum.</p>
        </div>
      </main>
    </div>
  );
}
