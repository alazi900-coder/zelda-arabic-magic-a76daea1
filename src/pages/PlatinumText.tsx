import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { idbSet, idbGet } from "@/lib/idb-storage";
import { ensurePlatTables } from "@/lib/nds/plat-charmap";
import {
  extractPlatEntries,
  restorePlatTranslations,
  looksLikePlatRom,
  PLAT_BUFFER_KEY,
  PLAT_SOURCE_GAME,
} from "@/lib/nds/plat-editor-bridge";
import { APP_VERSION } from "@/lib/version";

/**
 * Pokémon Platinum opener: reads the message archive out of the .nds and loads
 * every line into the shared translation editor (`/editor`).
 *
 * The ROM to open is the Arabic build — the one whose font, right-to-left
 * drawing and letter joining are already in place. There is no reason to
 * refuse an already-translated one the way the Gen 3 opener does: Arabic here
 * lives in ordinary character codes that read back as Arabic, so re-opening a
 * translated ROM returns the translations rather than losing them.
 */
export default function PlatinumText() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const loadRom = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        await ensurePlatTables();
        const rom = new Uint8Array(await file.arrayBuffer());
        if (!looksLikePlatRom(rom)) {
          throw new Error("لم يُعثر على أرشيف نصوص Platinum في هذا الملف — ارفع روم ‎.nds‎ الخاص باللعبة");
        }
        const { entries, packed, archives } = extractPlatEntries(rom);
        if (entries.length === 0) throw new Error("لم يُعثر على نصوص في هذا الروم");

        const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
        const translations = restorePlatTranslations(entries, existing?.translations || {});

        await idbSet("editorState", { entries, translations, freshExtraction: true });
        await idbSet("editor-source-game", PLAT_SOURCE_GAME);
        await idbSet(PLAT_BUFFER_KEY, rom.buffer.slice(0));

        const originals: Record<string, string> = {
          ...((await idbGet<Record<string, string>>("originalTexts")) || {}),
        };
        for (const e of entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
        await idbSet("originalTexts", originals);

        const restored = Object.keys(translations).length;
        toast.success(
          `استُخرج ${entries.length} سطراً من ${archives} أرشيفاً` +
            (packed > 0 ? ` — و${packed} اسم مدرّب مضغوط تُرك كما هو` : "") +
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
          <div>
            <h1 className="text-2xl font-bold">تعريب نصوص Pokémon Platinum</h1>
            <p className="text-xs text-muted-foreground">نسخة الأداة {APP_VERSION}</p>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            الرجوع <ArrowRight className="inline h-4 w-4" />
          </Link>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          ارفع روم Platinum المعرَّب — الذي خطّه العربي وعكس اتجاهه ووصل حروفه جاهزة فيه. تُقرأ
          منه رسائل اللعبة كلّها، تترجمها في المحرّر، ثم تبني منه روماً مترجَماً وتنزّله.
          إعادة رفع روم مترجَم لا تفقد شيئاً: العربية هنا تُقرأ عربيةً.
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
            الملف ١٢٨ ميغابايت ويُقرأ في المتصفّح — استعمل حاسوباً لا هاتفاً
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

        <div className="mt-6 space-y-2 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">حدّ الطول</strong> لكل سطر هو أطول رسالة أصلية في
            أرشيفه: أرشيفٌ واحد تقرأه شيفرةٌ واحدة إلى ذاكرةٍ واحدة، وتلك الذاكرة تسع أطول سطرٍ
            فيه فعلاً. لذلك يتّسع الحوار لمئات الحروف بينما تبقى قائمة الأسماء ضيّقة.
          </p>
          <p>
            <strong className="text-foreground">الوسوم</strong> مثل <code>{"{STRVAR_1 3, 0, 0}"}</code>{" "}
            هي مواضع تحقن فيها اللعبة اسماً أو رقماً وقت التشغيل. انقلها كما هي؛ السطر الذي يسقط
            منه وسمٌ يُرفَض ولا يُكتب، لأن سقوطه يعني فراغاً في الجملة لا يفسّره شيء على الشاشة.
          </p>
        </div>
      </div>
    </div>
  );
}
