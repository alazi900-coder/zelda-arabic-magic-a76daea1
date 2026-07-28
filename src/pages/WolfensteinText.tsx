import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { idbSet, idbGet } from "@/lib/idb-storage";
import {
  extractWolfEntries,
  WOLF_BUFFER_KEY,
  WOLF_FONTS_KEY,
  WOLF_SOURCE_GAME,
} from "@/lib/wolfrpg/wolf-editor-bridge";

/**
 * Wolfenstein RPG opener: reads the game's .ipa, decodes every string in the
 * shipped banks, and loads them into the shared translation editor
 * (`/editor`). The .ipa bytes are stashed in IndexedDB so the editor's build
 * step can produce a translated .ipa.
 */
export default function WolfensteinText() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const loadIpa = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const ipa = new Uint8Array(await file.arrayBuffer());
        const { entries, totalStrings, sectionCount } = await extractWolfEntries(ipa);
        if (entries.length === 0) {
          throw new Error("لم يُعثر على نصوص Wolfenstein RPG في هذا الملف");
        }

        // Keep whatever is already translated for the same keys. The keys come
        // from the index file, so they are the same for every copy of the game
        // and re-opening the .ipa never costs the translator their work.
        const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
        const validKeys = new Set(entries.map((e) => `${e.msbtFile}:${e.index}`));
        const translations: Record<string, string> = {};
        for (const [k, v] of Object.entries(existing?.translations || {})) {
          if (v && validKeys.has(k)) translations[k] = v;
        }

        await idbSet("editorState", { entries, translations, freshExtraction: true });
        await idbSet("editor-source-game", WOLF_SOURCE_GAME);
        await idbSet(WOLF_BUFFER_KEY, ipa.buffer.slice(0));

        const originals: Record<string, string> = {
          ...((await idbGet<Record<string, string>>("originalTexts")) || {}),
        };
        for (const e of entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
        await idbSet("originalTexts", originals);

        const fonts = await idbGet<Record<string, ArrayBuffer>>(WOLF_FONTS_KEY);
        const restored = Object.keys(translations).length;
        toast.success(
          `تم استخراج ${entries.length} نص قابل للترجمة من ${totalStrings} سلسلة في ${sectionCount} قسم` +
            (restored > 0 ? ` — واسترجاع ${restored} ترجمة محفوظة` : "") +
            (fonts ? "" : " — لم يُبنَ الخط العربي بعد")
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
          <h1 className="text-2xl font-bold">تعريب نصوص Wolfenstein RPG</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/wolfenstein/font" className="hover:underline">أداة الخط</Link>
            <Link to="/wolfenstein" className="hover:underline">
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
            if (f) void loadIpa(f);
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
          <span className="text-lg font-medium">افتح ملف .ipa</span>
          <span className="text-sm text-muted-foreground">
            ملف اللعبة الأصلي — يُفتح مباشرة في المحرر الرئيسي
          </span>
          <input
            type="file"
            accept=".ipa,.zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadIpa(f);
            }}
          />
        </label>

        <div className="mt-8 space-y-2 text-sm text-muted-foreground">
          <p>بعد الفتح ستحصل في المحرر على: الترجمة التلقائية، فحوص الجودة، والذكاء الاصطناعي — مثل بقية الألعاب.</p>
          <p>
            الرمز <code className="rounded bg-muted px-1">|</code> هو فاصل الأسطر في المحرّك، و
            <code className="rounded bg-muted px-1">%01</code> قيمة تضعها اللعبة وقت التشغيل — اتركهما كما هما.
          </p>
          <p>
            خطّ اللعبة ١٤٤ خانة والعربية تحتاج ١٢٩، فالحروف اللاتينية تفقد أشكالها. أي نصّ لا تترجمه سيظهر حروفاً عربية
            عشوائية — <strong>الترجمة هنا كلٌّ لا يتجزأ</strong>.
          </p>
          <p>
            ابنِ الخط أولاً من <Link to="/wolfenstein/font" className="text-primary hover:underline">أداة الخط</Link>، ثم
            سيُدرَج تلقائياً في ملف الـ.ipa الذي يبنيه المحرر.
          </p>
        </div>
      </div>
    </div>
  );
}
