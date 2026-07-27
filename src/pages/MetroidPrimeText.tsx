import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { idbSet, idbGet } from "@/lib/idb-storage";
import {
  extractMetroidPrimeEntries,
  partitionTranslations,
  METROID_PRIME_BUFFER_KEY,
  METROID_PRIME_PARKED_KEY,
  METROID_PRIME_SOURCE_GAME,
} from "@/lib/metroid-prime/mp-editor-bridge";

/**
 * Metroid Prime Remastered opener: reads a .pak file (GuiSysMP1.pak or
 * 1PreloadFrontEndMPT.pak), decodes every MSBT text asset's USEN (US
 * English) locale strings, and loads them into the shared translation editor
 * (`/editor`) — same auto-translation, quality tools, and AI features as the
 * other games. The .pak bytes are stashed in IndexedDB so the editor's build
 * step can produce a translated .pak (only USEN is touched; the other 12
 * bundled locales are preserved byte-for-byte).
 */
export default function MetroidPrimeText() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const loadPak = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const pak = new Uint8Array(await file.arrayBuffer());
        const { entries, assetCount } = await extractMetroidPrimeEntries(pak);
        if (entries.length === 0) {
          throw new Error("لم يُعثر على نصوص Metroid Prime في هذا الملف");
        }

        // Preserve any translations already saved from a previous upload of
        // this same .pak — matched by the same entry key (msbtFile:index) —
        // mirroring how Xenoblade's opener avoids wiping the user's work on
        // re-upload. `freshExtraction: true` tells the editor to load this
        // merged state directly instead of showing the recovery-dialog.
        //
        // Translations whose key isn't in THIS .pak are not stale work to be
        // thrown away: a .pak carries only part of the game's text, so opening
        // the front-end pak after translating the main one used to delete
        // every translation the front-end pak didn't happen to contain. They
        // are parked in a side store and merged back on every later upload,
        // so no upload can ever lose work again.
        const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
        const parked = (await idbGet<Record<string, string>>(METROID_PRIME_PARKED_KEY)) || {};
        const known: Record<string, string> = { ...parked, ...(existing?.translations || {}) };

        const validKeys = new Set(entries.map((e) => `${e.msbtFile}:${e.index}`));

        // Last-resort recovery: the build step keeps a snapshot of everything
        // it wrote. Anything this .pak needs that the live state no longer has
        // is pulled back from there — that snapshot is the only surviving copy
        // of work an earlier upload discarded. Only keys this .pak actually
        // contains are taken, so snapshots left by other games stay out.
        const buildSnapshot = (await idbGet<Record<string, string>>("buildTranslations")) || {};
        let recovered = 0;
        for (const [key, value] of Object.entries(buildSnapshot)) {
          if (value && validKeys.has(key) && !known[key]) {
            known[key] = value;
            recovered++;
          }
        }

        const { active: translations, parked: stillParked } = partitionTranslations(known, validKeys);

        await idbSet(METROID_PRIME_PARKED_KEY, stillParked);
        await idbSet("editorState", { entries, translations, freshExtraction: true });
        await idbSet("editor-source-game", METROID_PRIME_SOURCE_GAME);
        await idbSet(METROID_PRIME_BUFFER_KEY, pak.buffer.slice(0));

        const originals: Record<string, string> = {};
        for (const e of entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
        await idbSet("originalTexts", originals);

        const restoredCount = Object.keys(translations).length;
        const parkedCount = Object.keys(stillParked).length;
        toast.success(
          `تم استخراج ${entries.length} نص من ${assetCount} ملف نصوص` +
            (restoredCount > 0 ? ` — تم استرجاع ${restoredCount} ترجمة محفوظة` : "") +
            (recovered > 0 ? ` (منها ${recovered} استُعيدت من نسخة البناء الاحتياطية)` : "") +
            (parkedCount > 0 ? ` — و${parkedCount} ترجمة أخرى محفوظة لملفات .pak غير هذا الملف` : "")
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
          <h1 className="text-2xl font-bold">تعريب نصوص Metroid Prime Remastered</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/metroid-prime/font" className="hover:underline">أداة الخط</Link>
            <Link to="/" className="hover:underline">
              الرئيسية <ArrowRight className="inline h-4 w-4" />
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
          <span className="text-lg font-medium">افتح ملف .pak</span>
          <span className="text-sm text-muted-foreground">
            GuiSysMP1.pak أو 1PreloadFrontEndMPT.pak — يُفتح مباشرة في المحرر الرئيسي
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

        <div className="mt-8 space-y-2 text-sm text-muted-foreground">
          <p>بعد الفتح ستحصل في المحرر على: الترجمة التلقائية، فحوص الجودة، والذكاء الاصطناعي — مثل بقية الألعاب.</p>
          <p>
            أكواد التحكم تظهر مثل <code className="rounded bg-muted px-1">[TAG:000e:...]</code> — اتركها كما هي داخل النص، فهي محميّة تلقائياً.
          </p>
          <p>يُترجَم قسم النص الإنجليزي (USEN) فقط داخل كل ملف؛ باقي اللغات المرفقة (فرنسي، ياباني، صيني...) تبقى دون أي تغيير.</p>
          <p>لإضافة دعم الحروف العربية للخط نفسه استخدم <Link to="/metroid-prime/font" className="text-primary hover:underline">أداة الخط</Link> بشكل منفصل.</p>
        </div>
      </div>
    </div>
  );
}
