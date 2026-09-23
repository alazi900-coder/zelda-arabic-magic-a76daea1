import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { idbSet, idbGet } from "@/lib/idb-storage";
import {
  extractInazumaEntries,
  restoreInazumaTranslations,
  looksLikeInazumaRom,
  INAZUMA_BUFFER_KEY,
  INAZUMA_SOURCE_GAME,
} from "@/lib/inazuma/inazuma-editor-bridge";
import { APP_VERSION } from "@/lib/version";

/**
 * Inazuma Eleven opener: reads the cartridge's script archives and its
 * fixed-slot description table into the shared editor (`/editor`), which
 * builds the translated `.nds` back out again.
 */
export default function Inazuma() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const loadRom = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const rom = new Uint8Array(await file.arrayBuffer());
        if (!looksLikeInazumaRom(rom)) {
          throw new Error("لم يُعثر على نصوص إينازوما في هذا الملف — ارفع روم ‎.nds‎ الأوروبي للعبة");
        }
        const { entries, japanese } = extractInazumaEntries(rom);
        if (entries.length === 0) throw new Error("لم يُعثر على نصوص إنجليزية في هذا الروم");

        const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
        const translations = restoreInazumaTranslations(entries, existing?.translations || {});

        await idbSet("editorState", { entries, translations, freshExtraction: true });
        await idbSet("editor-source-game", INAZUMA_SOURCE_GAME);
        await idbSet(INAZUMA_BUFFER_KEY, rom.buffer.slice(0));

        const originals: Record<string, string> = {
          ...((await idbGet<Record<string, string>>("originalTexts")) || {}),
        };
        for (const e of entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
        await idbSet("originalTexts", originals);

        const restored = Object.keys(translations).length;
        toast.success(
          `استُخرج ${entries.length.toLocaleString("ar")} سطراً` +
            (japanese > 0 ? ` — و${japanese.toLocaleString("ar")} سطراً يابانياً غير مترجَم تُرك كما هو` : "") +
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
            <h1 className="text-2xl font-bold">تعريب Inazuma Eleven</h1>
            <p className="text-xs text-muted-foreground">نسخة الأداة {APP_VERSION}</p>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            الرجوع <ArrowRight className="inline h-4 w-4" />
          </Link>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          ارفع روم إينازوما إليفن الأوروبي. تُقرأ منه حوارات القصة وقوائم النظام وأوصاف اللاعبين،
          تترجمها في المحرّر، ثم يبني الروم معرّباً مع حقن الخط العربي في خطوط اللعبة الثلاثة.
        </p>

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
          <span className="font-medium">{busy ? "يُقرأ الروم…" : "أفلت ملف ‎.nds‎ هنا أو اضغط للاختيار"}</span>
          <span className="text-xs text-muted-foreground">
            الملف ٢٥٦ ميغابايت ويُقرأ في المتصفّح — استعمل حاسوباً لا هاتفاً
          </span>
          <input
            type="file"
            accept=".nds"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadRom(f);
              e.target.value = "";
            }}
          />
        </label>

        <Link
          to="/inazuma/images"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border p-4 text-sm font-medium transition hover:bg-muted/50"
        >
          🖼️ أداة صور اللعبة — القوائم وشاشة العنوان وواجهات المباراة
        </Link>

        <div className="mt-6 space-y-2 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">الرموز التقنية</strong>: <code>{"\\n"}</code> سطر جديد،
            و<code>{"\\f"}</code> صفحة جديدة يتوقّف عندها النصّ حتى يضغط اللاعب، و
            <code>{"%1F"}</code> و<code>{"%d"}</code> و<code>{"%s"}</code> قيم تضعها اللعبة وقت التشغيل.
            السطر الذي يسقط منه واحد منها يُرفض ولا يُكتب.
          </p>
          <p>
            <strong className="text-foreground">أوصاف اللاعبين</strong> تجلس في خانات ثابتة سعتها
            ١٢٧ بايتاً لكلٍّ منها، والأطول من ذلك يُرفض بدل أن يمتدّ على الوصف التالي.
          </p>
          <p>
            <strong className="text-foreground">النصّ الياباني</strong> المتبقّي في النسخة الأوروبية
            (نحو ٤٠٪ من السجلّات) لا يظهر في المحرّر: ليس إنجليزيّاً لتُترجم منه، ونصفه رسائل تشخيص
            داخلية لا تظهر للاعب أصلاً.
          </p>
        </div>
      </div>
    </div>
  );
}
