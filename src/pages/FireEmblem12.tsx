/**
 * Design note: this is a focused RTL tool page within the existing dark editor.
 * Its sparse, reassuring layout foregrounds local-only ROM handling and the
 * single verified English Beta 2 source version rather than presenting a separate app.
 */
import { Link, useNavigate } from "react-router-dom";
import { useCallback, useState } from "react";
import { ArrowRight, FileWarning, HardDrive, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { idbGet, idbSet } from "@/lib/idb-storage";
import {
  extractFE12Entries,
  FE12_BUFFER_KEY,
  FE12_SOURCE_GAME,
  verifyFE12Rom,
} from "@/lib/fe12/fe12-editor-bridge";

export default function FireEmblem12() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const loadRom = useCallback(async (file: File) => {
    setBusy(true);
    try {
      if (!file.name.toLowerCase().endsWith(".nds")) throw new Error("اختر ملف Nintendo DS بصيغة .nds.");
      const rom = new Uint8Array(await file.arrayBuffer());
      const verified = await verifyFE12Rom(rom);
      if (!verified.valid) throw new Error(verified.reason || "تعذّر التحقق من ROM.");
      const result = extractFE12Entries(rom);
      const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
      const previousTranslations = existing?.translations || {};
      const validKeys = new Set(result.entries.map((entry) => `${entry.msbtFile}:${entry.index}`));
      const translations: Record<string, string> = {};
      for (const [key, value] of Object.entries(previousTranslations)) {
        if (validKeys.has(key) && value) translations[key] = value;
      }
      const originals: Record<string, string> = {};
      result.entries.forEach((entry) => { originals[`${entry.msbtFile}:${entry.index}`] = entry.original; });

      // This is a copy held in browser IndexedDB for the later local build; the
      // File object and the supplied original ROM are never uploaded or changed.
      await idbSet("editorState", { entries: result.entries, translations, freshExtraction: true });
      await idbSet("editor-source-game", FE12_SOURCE_GAME);
      await idbSet(FE12_BUFFER_KEY, rom.buffer.slice(0));
      await idbSet("originalTexts", originals);
      toast.success(
        `تم استخراج ${result.entries.length.toLocaleString("ar-EG")} سجل حوار من ${result.files.length} ملف` +
          (Object.keys(translations).length ? ` — استُعيدت ${Object.keys(translations).length} ترجمة محفوظة` : "")
      );
      navigate("/editor");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-4xl px-4 py-10 md:py-16">
        <header className="mb-9 flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-primary">Nintendo DS · بناء محلي</p>
            <h1 className="font-display text-3xl font-black md:text-4xl">Fire Emblem: Shin Monshou no Nazo</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              افتح النسخة الإنجليزية Beta 2، حرّر نصوص الحوار داخل المحرر نفسه، ثم نزّل نسخة عربية جديدة. يبقى ملفك الأصلي محفوظاً دون أي تعديل.
            </p>
          </div>
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary">
            الرئيسية <ArrowRight className="h-4 w-4" />
          </Link>
        </header>

        <label
          onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files[0];
            if (file) void loadRom(file);
          }}
          className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/10" : "border-primary/30 bg-card/40 hover:border-primary/60 hover:bg-card"
          }`}
        >
          <div className="rounded-full border border-primary/30 bg-primary/10 p-4 text-primary">
            {busy ? <Loader2 className="h-9 w-9 animate-spin" /> : <Upload className="h-9 w-9" />}
          </div>
          <div>
            <p className="font-display text-lg font-bold">افتح ROM لعبة Fire Emblem 12 الإنجليزية Beta 2</p>
            <p className="mt-2 text-sm text-muted-foreground">اسحب ملف ‎.nds‎ هنا أو اضغط لاختياره من جهازك</p>
          </div>
          <input
            type="file"
            accept=".nds,application/octet-stream"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadRom(file);
            }}
          />
        </label>

        <section className="mt-7 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card/50 p-4">
            <ShieldCheck className="mb-3 h-5 w-5 text-primary" />
            <h2 className="font-display text-sm font-bold">تحقق صارم</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">تُقبل فقط النسخة الإنجليزية Beta 2 المتحققة: طبّق v3.01 ثم Beta 2 على الروم الياباني النظيف. لا تستخدم ROM مبنياً سابقاً.</p>
          </div>
          <div className="rounded-xl border border-border bg-card/50 p-4">
            <HardDrive className="mb-3 h-5 w-5 text-primary" />
            <h2 className="font-display text-sm font-bold">داخل المتصفح</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">استخراج النص وبناء ROM وخط العربية كلها تعمل محلياً في المتصفح؛ لا يُرفع ROM إلى أي خادم.</p>
          </div>
          <div className="rounded-xl border border-border bg-card/50 p-4">
            <FileWarning className="mb-3 h-5 w-5 text-primary" />
            <h2 className="font-display text-sm font-bold">رموز التحكم محمية</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">تظهر الأوامر مثل <code className="rounded bg-muted px-1">{"{10}"}</code> داخل النص؛ إذا حُذفت يعيد الباني وضعها قبل إنشاء ROM.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
