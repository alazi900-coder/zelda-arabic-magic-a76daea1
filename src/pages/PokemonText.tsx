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
  PKM_SOURCE_GAME,
} from "@/lib/pokemon/pkm-editor-bridge";

/**
 * Pokémon Ruby Destiny opener: reads the .gba ROM, recognises every line of
 * text in it, and loads them into the shared translation editor (`/editor`).
 * The ROM bytes are stashed in IndexedDB so the editor's build step can write
 * a translated ROM.
 */
export default function PokemonText() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const loadRom = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const rom = new Uint8Array(await file.arrayBuffer());
        if (!looksLikePkmRom(rom)) {
          throw new Error("هذا ليس ملف روم GBA — ارفع ملف ‎.gba‎ الأصلي");
        }
        // Refused before anything is saved: the Arabic already written into a
        // built ROM is not readable back, so opening one would replace the
        // session with the handful of lines still in English and drop every
        // translation belonging to the rest.
        if (isBuiltPkmRom(rom)) {
          throw new Error(
            "هذا روم مبني (يحمل الخط العربي) — افتح الروم الأصلي. الأسطر المكتوبة بالعربية لا يقرأها المستخرِج، وفتحه هنا كان يمسح ترجماتها."
          );
        }
        const { entries, textBytes } = extractPkmEntries(rom);
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
        await idbSet(PKM_BUFFER_KEY, rom.buffer.slice(0));

        const originals: Record<string, string> = {
          ...((await idbGet<Record<string, string>>("originalTexts")) || {}),
        };
        for (const e of entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
        await idbSet("originalTexts", originals);

        const restored = Object.keys(translations).length;
        toast.success(
          `تم استخراج ${entries.length} سطراً (${Math.round(textBytes / 1024)} ك.ب من النص)` +
            (restored > 0 ? ` — واسترجاع ${restored} ترجمة محفوظة` : "")
        );
        navigate("/editor");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [navigate]
  );

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">تعريب نصوص Pokémon Ruby Destiny</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/pokemon/font" className="hover:underline">أداة الخط</Link>
            <Link to="/pokemon" className="hover:underline">
              الرجوع <ArrowRight className="inline h-4 w-4" />
            </Link>
          </div>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void loadRom(f);
          }}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-12 transition ${
            dragOver ? "border-primary bg-primary/5" : "border-muted"
          }`}
        >
          {busy ? (
            <Loader2 className="h-10 w-10 animate-spin" />
          ) : (
            <Upload className="h-10 w-10 text-muted-foreground" />
          )}
          <span className="text-lg font-medium">افتح ملف ‎.gba‎</span>
          <span className="text-sm text-muted-foreground">
            روم اللعبة الأصلي — يُفتح مباشرة في المحرر الرئيسي
          </span>
          <input
            type="file"
            accept=".gba"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadRom(f);
            }}
          />
        </label>

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
            العربية تسكن خانات الكانا التي لا تستعملها النسخة الإنجليزية، فالحروف اللاتينية والأرقام تبقى كما هي — تستطيع
            ترك ما شئت بالإنجليزية.
          </p>
        </div>
      </div>
    </div>
  );
}
