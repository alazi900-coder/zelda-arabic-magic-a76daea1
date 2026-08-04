import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { idbSet, idbGet } from "@/lib/idb-storage";
import { extractDsEntries, DS_BUFFER_KEY, DS_SOURCE_GAME } from "@/lib/dragonsword/ds-editor-bridge";
import { dsCategoryLabel } from "@/lib/dragonsword/ds-categories";

/**
 * DragonSword Awakening opener: reads the game's Unreal `.pak`, pulls the four
 * JSON string tables out of it, and hands them to the shared editor. The pak's
 * bytes are kept so the build step can put a translated one back together.
 *
 * Nothing is shaped or reversed for this game. Unreal draws text with a real
 * shaper and a real bidi pass, so what the translator writes is what the engine
 * gets — the opposite of every ROM game in this tool. What it does need is a
 * font that carries Arabic, and that is not something this page can check.
 */
export default function DragonSword() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [report, setReport] = useState<{ file: string; rows: number }[] | null>(null);
  const navigate = useNavigate();

  const loadPak = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const pak = new Uint8Array(await file.arrayBuffer());
        const { entries, tables, skipped } = extractDsEntries(pak);
        if (entries.length === 0) {
          throw new Error("لم يُعثر على نصوص داخل الحاوية — تأكّد أنه ملفّ اللغة الصحيح");
        }
        setReport(tables.map((t) => ({ file: t.file, rows: t.rows })));

        // Translations saved from an earlier upload of the same pak are kept:
        // a line's key is its own ID, which never moves.
        const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
        const saved = existing?.translations || {};
        const valid = new Set(entries.map((e) => `${e.msbtFile}:${e.index}`));
        const translations: Record<string, string> = {};
        for (const [key, value] of Object.entries(saved)) {
          if (valid.has(key) && value) translations[key] = value;
        }

        await idbSet("editorState", { entries, translations, freshExtraction: true });
        await idbSet("editor-source-game", DS_SOURCE_GAME);
        await idbSet(DS_BUFFER_KEY, pak.buffer.slice(0));

        const originals: Record<string, string> = {};
        for (const e of entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
        await idbSet("originalTexts", originals);

        const restored = Object.keys(translations).length;
        toast.success(
          `تم استخراج ${entries.length} سطر من ${tables.length} جدول` +
            (skipped > 0 ? ` — تُخطّي ${skipped} سطراً بلا كلمات` : "") +
            (restored > 0 ? ` — استُرجعت ${restored} ترجمة محفوظة` : "")
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
          <h1 className="text-2xl font-bold">تعريب DragonSword Awakening</h1>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            الرئيسية <ArrowRight className="inline h-4 w-4" />
          </Link>
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
            if (f) void loadPak(f);
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
          <span className="text-lg font-medium">افتح ملفّ اللغة (.pak)</span>
          <span className="text-sm text-muted-foreground">
            مثل <code className="rounded bg-muted px-1">DragonSword_IT.pak</code> — يُفتح مباشرة في المحرّر
          </span>
          <input
            type="file"
            accept=".pak"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadPak(f);
            }}
          />
        </label>

        {report && (
          <div className="mt-6 rounded-xl border p-4">
            <div className="mb-2 text-sm font-medium">ما وجدته في الحاوية</div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {report.map((t) => (
                <li key={t.file} className="flex justify-between">
                  <span>{dsCategoryLabel(t.file)}</span>
                  <span className="tabular-nums">{t.rows} سطر</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 space-y-2 text-sm text-muted-foreground">
          <p>
            بعد الفتح ستحصل في المحرّر على الترجمة التلقائية وحماية الرموز وفحوص الجودة، مثل بقيّة الألعاب.
          </p>
          <p>
            الرموز التقنية محميّة: <code className="rounded bg-muted px-1">{"{0}"}</code> قيمةٌ تضعها اللعبة،
            و<code className="rounded bg-muted px-1">&lt;orange&gt;</code> يفتح لوناً و
            <code className="rounded bg-muted px-1">&lt;/&gt;</code> يغلقه. أي سطرٍ يفقد رمزاً أو يغيّر ترتيبه
            يُرفض عند البناء ويبقى بلغته الأصلية، ولا يُكتب معطوباً.
          </p>
          <p>
            الاتجاه والوصل ليسا من عملك هنا: محرّك Unreal يشكّل العربية ويعكس اتجاهها بنفسه — بخلاف ألعاب الروم في
            هذه الأداة. لكنّه يحتاج خطّاً يحمل العربية، وذاك عملٌ منفصل عن النصّ.
          </p>
        </div>
      </div>
    </div>
  );
}
