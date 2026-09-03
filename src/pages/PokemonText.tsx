import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { idbSet, idbGet } from "@/lib/idb-storage";
import {
  extractPkmEntries,
  isBuiltPkmRom,
  looksLikePkmRom,
  restorePkmTranslations,
  PKM_BUFFER_KEY,
  PKM_GAME_KEY,
  PKM_SOURCE_GAME,
} from "@/lib/pokemon/pkm-editor-bridge";
import { PKM_CODECS, pkmCodecByGame, type PkmGame } from "@/lib/pokemon/pkm-codec";
import { APP_VERSION } from "@/lib/version";

/**
 * Gen 3 Pokémon opener: reads the .gba ROM, recognises every line of text in
 * it, and loads them into the shared translation editor (`/editor`). The ROM
 * bytes are stashed in IndexedDB so the editor's build step can write a
 * translated ROM.
 *
 * Two games come through here, and the translator says which by choosing a box
 * rather than letting the header be read. Reading it is only a guess — a hack
 * or a trimmed dump can carry any header — and a wrong guess is the one fault
 * that cannot be seen until the game runs: the text is written in one game's
 * codes and drawn with the other game's font, so every letter on screen is
 * real Arabic and every letter is the wrong one. Choosing cannot be wrong.
 *
 * The version is on screen for the same reason. A page serving an older bundle
 * looks identical to a current one, and the difference showed up only inside a
 * built ROM, hours later.
 */
export default function PokemonText() {
  const [busy, setBusy] = useState<PkmGame | null>(null);
  const [dragOver, setDragOver] = useState<PkmGame | null>(null);
  const navigate = useNavigate();

  const loadRom = useCallback(
    async (file: File, game: PkmGame) => {
      setBusy(game);
      try {
        const rom = new Uint8Array(await file.arrayBuffer());
        if (!looksLikePkmRom(rom)) {
          throw new Error("هذا ليس ملف روم GBA — ارفع ملف ‎.gba‎ الأصلي");
        }
        // Refused before anything is saved: the Arabic already written into a
        // built ROM is not readable back, so opening one would replace the
        // session with the handful of lines still in English and drop every
        // translation belonging to the rest. A ROM carrying the *other* game's
        // font is refused by the same check, because building on it gives the
        // wrong letter for every letter.
        // The build made from source is refused by the same check: it stamps
        // itself as translated on the way out, so the file to open is always
        // the English variant.
        if (isBuiltPkmRom(rom, game)) {
          throw new Error(
            "هذا روم مبني (يحمل خطّاً عربياً) — افتح الروم الأصلي. الأسطر المكتوبة بالعربية لا يقرأها المستخرِج، وفتحه هنا كان يمسح ترجماتها."
          );
        }
        const { entries, textBytes } = extractPkmEntries(rom, game);
        if (entries.length === 0) {
          throw new Error("لم يُعثر على نصوص في هذا الروم");
        }

        // Keep whatever is already translated. A line is identified by its
        // offset in the ROM, not by the name of the list it sits in — that
        // name has changed once already, and matching on it dropped every
        // saved translation for a renamed list.
        const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
        const translations = restorePkmTranslations(entries, existing?.translations || {});

        await idbSet("editorState", { entries, translations, freshExtraction: true });
        await idbSet("editor-source-game", PKM_SOURCE_GAME);
        await idbSet(PKM_GAME_KEY, game);
        await idbSet(PKM_BUFFER_KEY, rom.buffer.slice(0));

        const originals: Record<string, string> = {
          ...((await idbGet<Record<string, string>>("originalTexts")) || {}),
        };
        for (const e of entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
        await idbSet("originalTexts", originals);

        const restored = Object.keys(translations).length;
        const name = PKM_CODECS.find((c) => c.game === game)!.name;
        toast.success(
          `${name}: استُخرج ${entries.length} سطراً (${Math.round(textBytes / 1024)} ك.ب من النص)` +
            (restored > 0 ? ` — واسترجاع ${restored} ترجمة محفوظة` : "")
        );
        navigate("/editor");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [navigate]
  );

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">تعريب نصوص Pokémon</h1>
            <p className="text-xs text-muted-foreground">نسخة الأداة {APP_VERSION}</p>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/pokemon/font" className="hover:underline">أداة الخط</Link>
            <Link to="/pokemon" className="hover:underline">
              الرجوع <ArrowRight className="inline h-4 w-4" />
            </Link>
          </div>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          اختر لعبتك وارفع رومها في مربّعها. الألعاب على محرّك واحد، لكن لكلٍّ منها خانات حروفٍ
          مختلفة — ورفعُ روم في المربّع الخطأ يكتب النصّ بخانات لعبةٍ أخرى، فتظهر حروفٌ عربية
          كلّها خاطئة. البناء من الكود المصدري وحده يُرفع <strong>معرَّباً</strong>: نصوصه العربية
          يقرأها المستخرِج، ومعها جدولٌ بداخله يحمل الإنجليزية التي حلّت محلّها — فترى الأصل
          والترجمة معاً من ملف واحد.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {PKM_CODECS.map((codec) => (
            <label
              key={codec.game}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(codec.game);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const f = e.dataTransfer.files[0];
                if (f) void loadRom(f, codec.game);
              }}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
                dragOver === codec.game ? "border-primary bg-primary/5" : "border-muted"
              } ${busy && busy !== codec.game ? "opacity-40" : ""}`}
            >
              {busy === codec.game ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <span className="text-lg font-medium">{codec.name}</span>
              <span className="text-xs text-muted-foreground">
                {codec.game === "emerald-source"
                  ? "١٢٩ خانةً اختيرت وقت التجميع — كلّها بايت واحد"
                  : codec.game === "emerald"
                  ? "١٢٨ خانةً فارغةً أو لحروفٍ مشكولة"
                  : "١٢٩ خانةً من خانات الكانا"}
              </span>
              <span className="text-xs text-muted-foreground">
                {codec.game === "emerald-source"
                  ? "ارفع النسخة الإنجليزية من البناء (‎‑en.gba‎)"
                  : "ارفع ملف ‎.gba‎ الأصلي"}
              </span>
              <input
                type="file"
                accept=".gba"
                className="hidden"
                disabled={busy !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void loadRom(f, codec.game);
                }}
              />
            </label>
          ))}
        </div>

        <div className="mt-8 space-y-2 text-sm text-muted-foreground">
          <p>بعد الفتح ستحصل في المحرر على: الترجمة التلقائية، فحوص الجودة، والذكاء الاصطناعي — مثل بقية الألعاب.</p>
          <p>
            <code className="rounded bg-muted px-1">{"{FD:01}"}</code> قيمة تضعها اللعبة وقت التشغيل (اسم اللاعب مثلاً) —
            اتركها كما هي وإلّا فقدت الشخصية اسمها.
          </p>
          <p>
            كل سطر يُكتب في <strong>مكانه نفسه</strong> داخل الروم، فلا يجوز أن تزيد ترجمته عن طول النص الأصلي. المحرر
            يعرض لك الحدّ، والبناء يرفض ما يتجاوزه ويسمّيه لك بدل أن يقصّه.
          </p>
          <p>
            العربية تسكن خانات لا تطبعها النسخة الإنجليزية، فالحروف اللاتينية والأرقام تبقى كما هي، وتستطيع ترك ما شئت
            بالإنجليزية.
          </p>
          <p>
            الكلمة الواحدة قد تكون مكتوبة في الروم مرّاتٍ عدّة — <code className="rounded bg-muted px-1">BAG</code> أربع
            مرّات و<code className="rounded bg-muted px-1">EXIT</code> إحدى عشرة — وكلٌّ منها سطرٌ مستقلّ في المحرر.
          </p>
        </div>
      </div>
    </div>
  );
}
