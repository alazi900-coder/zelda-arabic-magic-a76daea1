/** STYLE: قسم أداة داخلي هادئ؛ يوضح حدود الاستيراد بصدق ويحافظ على المصدر الأصلي بلا تنفيذ أو بناء تجريبي. */
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FileCode2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { idbGet, idbSet } from "@/lib/idb-storage";
import {
  extractPokemonXpEntries,
  POKEMON_XP_BUFFER_KEY,
  POKEMON_XP_SOURCE_GAME,
  POKEMON_XP_SOURCE_NAME_KEY,
} from "@/lib/pokemon-xp/pokemon-xp-editor-bridge";

export default function PokemonUnbreakableTies() {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const importEnglishDat = useCallback(async (file: File) => {
    setBusy(true);
    try {
      if (!/^english\.dat$/i.test(file.name)) throw new Error("اختر ملف english.dat من مجلد Data في اللعبة.");
      const buffer = await file.arrayBuffer();
      const imported = extractPokemonXpEntries(buffer);
      const oldState = await idbGet<{ translations?: Record<string, string> }>("editorState:pokemon-xp");
      const allowed = new Set(imported.entries.map((entry) => `${entry.msbtFile}:${entry.index}`));
      const translations = Object.fromEntries(Object.entries(oldState?.translations || {}).filter(([key, value]) => allowed.has(key) && value));
      const editorState = { entries: imported.entries, translations, freshExtraction: true };
      const originals = Object.fromEntries(imported.entries.map((entry) => [`${entry.msbtFile}:${entry.index}`, entry.original]));
      await idbSet("editorState", editorState);
      await idbSet("editorState:pokemon-xp", editorState);
      await idbSet("editor-source-game", POKEMON_XP_SOURCE_GAME);
      await idbSet("originalTexts", originals);
      await idbSet(POKEMON_XP_BUFFER_KEY, buffer.slice(0));
      await idbSet(POKEMON_XP_SOURCE_NAME_KEY, file.name);
      toast.success(`قُرئت ${imported.summary.entries.toLocaleString("ar")} رسالة من ${file.name} محلياً.`);
      navigate("/editor");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر قراءة ملف لغة Pokémon.");
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <section className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-primary">Pokémon Unbreakable Ties · RPG Maker XP</p>
            <h1 className="text-2xl font-bold">مسار النصوص الإنجليزية</h1>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">الرئيسية <ArrowRight className="inline h-4 w-4" /></Link>
        </header>

        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-semibold">الملف المطلوب: <code>Data/english.dat</code></p>
          <p className="mt-2 text-muted-foreground">هو جدول اللغة الذي تحمّله هذه النسخة عند التشغيل. يُقرأ بالكامل داخل المتصفح ولا يُرفع إلى خادم.</p>
        </div>

        <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/35 bg-card p-6 text-center transition hover:border-primary">
          {busy ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <FileCode2 className="h-10 w-10 text-primary" />}
          <strong>افتح جدول اللغة في المحرر</strong>
          <span className="text-sm text-muted-foreground"><code>Pokemon Unbreakable Ties/Data/english.dat</code></span>
          <label className="sr-only" htmlFor="pokemon-xp-input">اختر english.dat</label>
          <input id="pokemon-xp-input" aria-label="اختر ملف english.dat" className="block w-full max-w-md cursor-pointer rounded-md border border-primary/45 bg-background px-3 py-2 text-sm file:me-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-primary-foreground" type="file" accept=".dat,application/octet-stream" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importEnglishDat(file); }} />
        </div>

        <section className="mt-6 space-y-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          <p className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" /> القارئ يفك بنية Ruby Marshal 4.8 محلياً لقراءة الجداول والسلاسل فقط؛ لا يشغّل Ruby أو سكربتات اللعبة أو بياناتها.</p>
          <p>تظهر أوامر Pokémon Essentials مثل <code>\PN</code> و<code>\v[1]</code> و<code>\c[2]</code> كرموز تقنية محمية أثناء الترجمة.</p>
          <p className="text-amber-700 dark:text-amber-300">تصدير <code>english.dat</code> المعدّل غير مفعّل في هذه الدفعة؛ لن يُنشأ ملف لعبة غير متحقق منه. يمكنك تحرير النصوص وتصدير ترجماتك من المحرر بصيغة JSON للمراجعة.</p>
        </section>
      </section>
    </main>
  );
}
