import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { idbSet, idbGet } from "@/lib/idb-storage";
import {
  extractGoldenSunEditorEntries,
  restoreGoldenSunTranslations,
  looksLikeGoldenSunRom,
  GOLDENSUN_BUFFER_KEY,
  GOLDENSUN_SOURCE_GAME,
} from "@/lib/goldensun/goldensun-editor-bridge";
import { APP_VERSION } from "@/lib/version";

/**
 * Golden Sun opener: reads the cartridge's Huffman-compressed string table
 * into the shared editor (`/editor`), which rewrites it and overlays the
 * Arabic font when it builds the `.gba` back out. Right-to-left display
 * isn't wired in yet (see goldensun-engine-patch.ts) -- the built ROM has
 * the Arabic text and font, but still reads left-to-right.
 */
export default function GoldenSun() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const loadRom = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const rom = new Uint8Array(await file.arrayBuffer());
        if (!looksLikeGoldenSunRom(rom)) {
          throw new Error("لم يُعثر على توقيع Golden Sun في هذا الملف — ارفع روم ‎.gba‎ الأمريكي للعبة");
        }
        const entries = extractGoldenSunEditorEntries(rom);
        if (entries.length === 0) throw new Error("لم يُعثر على نصوص في هذا الروم");

        const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
        const translations = restoreGoldenSunTranslations(entries, existing?.translations || {});

        await idbSet("editorState", { entries, translations, freshExtraction: true });
        await idbSet("editor-source-game", GOLDENSUN_SOURCE_GAME);
        await idbSet(GOLDENSUN_BUFFER_KEY, rom.buffer.slice(0));

        const originals: Record<string, string> = {
          ...((await idbGet<Record<string, string>>("originalTexts")) || {}),
        };
        for (const e of entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
        await idbSet("originalTexts", originals);

        const restored = Object.keys(translations).length;
        toast.success(
          `استُخرج ${entries.length.toLocaleString("ar")} نصاً` +
            (restored > 0 ? ` — واسترجاع ${restored.toLocaleString("ar")} ترجمة محفوظة` : "")
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
          <div>
            <h1 className="text-2xl font-bold">تعريب Golden Sun</h1>
            <p className="text-xs text-muted-foreground">نسخة الأداة {APP_VERSION}</p>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            الرجوع <ArrowRight className="inline h-4 w-4" />
          </Link>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          ارفع روم Golden Sun الأمريكي. تُقرأ منه كل النصوص (١٠,٧٢٢ سطراً) مضغوطة بطريقة
          Huffman، تترجمها في المحرّر، ثم يعيد بناء الروم بجدول نصوص عربي والخط العربي مرسوماً
          فوق خط اللعبة.
        </p>

        <div className="mb-4 flex items-start gap-2 rounded-xl border border-secondary/40 bg-secondary/8 p-3 text-xs text-secondary">
          ⚠️ اتجاه الكتابة من اليمين لليسار لم يُربط بالموقع بعد — الروم المبني فيه النص والخط
          العربيان، لكنه يُعرض من اليسار لليمين حتى الآن.
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
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition ${
            dragOver ? "border-primary bg-primary/5" : "border-muted"
          }`}
        >
          {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
          <span className="font-medium">{busy ? "يُقرأ الروم…" : "أفلت ملف ‎.gba‎ هنا أو اضغط للاختيار"}</span>
          <span className="text-xs text-muted-foreground">الملف ٨ ميغابايت ويُقرأ في المتصفّح</span>
          <input
            type="file"
            accept=".gba"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadRom(f);
              e.target.value = "";
            }}
          />
        </label>

        <div className="mt-6 space-y-2 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">الرموز التقنية</strong> تظهر كـ<code>{"\\xNN"}</code>{" "}
            (مثلاً <code>{"\\x02"}</code> نهاية الصندوق، <code>{"\\x03"}</code> سطر جديد،
            <code>{"\\x11\\x01"}</code> اسم البطل). السطر الذي يسقط منه واحد منها يُرفض ولا يُكتب.
          </p>
          <p>
            <strong className="text-foreground">حد الطول</strong> فعلي: كل سطر يُضغَط بعد الترجمة
            ويجب ألا يتجاوز ٢٥٤ بايتاً مضغوطاً — البناء يرفض ويسمّي أي سطر يتجاوزه.
          </p>
        </div>
      </div>
    </div>
  );
}
