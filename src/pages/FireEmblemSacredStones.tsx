/** Sacred Stones opener — concise RTL upload path into the shared editor. */
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { idbGet, idbSet } from "@/lib/idb-storage";
import {
  extractFE8Entries,
  FE8_BUFFER_KEY,
  FE8_SOURCE_GAME,
  looksLikeFE8Rom,
  restoreFE8Translations,
} from "@/lib/fe8/fe8-editor-bridge";

export default function FireEmblemSacredStones() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const loadRom = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const rom = new Uint8Array(await file.arrayBuffer());
      if (!looksLikeFE8Rom(rom)) {
        throw new Error("ارفع النسخة الأوروبية الأصلية من Fire Emblem: The Sacred Stones (رمز BE8P). لا تقبل الأداة نسخة الولايات المتحدة أو ROM مبنياً سابقاً.");
      }
      const { entries, textBytes } = extractFE8Entries(rom);
      if (!entries.length) throw new Error("لم يُعثر على نصوص إنجليزية قابلة للتحرير في هذا ROM.");
      const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
      const translations = restoreFE8Translations(entries, existing?.translations || {});
      await idbSet("editorState", { entries, translations, freshExtraction: true });
      await idbSet("editor-source-game", FE8_SOURCE_GAME);
      await idbSet(FE8_BUFFER_KEY, rom.buffer.slice(0));
      const originals = { ...((await idbGet<Record<string, string>>("originalTexts")) || {}) };
      for (const entry of entries) originals[`${entry.msbtFile}:${entry.index}`] = entry.original;
      await idbSet("originalTexts", originals);
      const restored = Object.keys(translations).length;
      toast.success(`Sacred Stones: استُخرج ${entries.length} سطراً إنجليزياً (${Math.round(textBytes / 1024)} ك.ب)` + (restored ? ` — واستُرجعت ${restored} ترجمة محفوظة` : ""));
      navigate("/editor");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-[0.18em] text-primary">GAME BOY ADVANCE · FE8</p>
            <h1 className="text-2xl font-bold">Fire Emblem: The Sacred Stones</h1>
            <p className="mt-2 text-sm text-muted-foreground">استخراج النصوص الإنجليزية، ترجمتها داخل المحرر، وحقن الخط العربي عند البناء.</p>
          </div>
          <Link to="/" className="shrink-0 text-sm text-muted-foreground hover:text-foreground">
            الرجوع <ArrowRight className="inline h-4 w-4" />
          </Link>
        </header>

        <label
          className={`flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${dragOver ? "border-primary bg-primary/5" : "border-border bg-card/45"} ${busy ? "pointer-events-none opacity-70" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault(); setDragOver(false);
            const file = event.dataTransfer.files[0];
            if (file) void loadRom(file);
          }}
        >
          {busy ? <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" /> : <Upload className="mb-4 h-10 w-10 text-primary" />}
          <strong className="text-lg">ارفع ROM Sacred Stones الأوروبي</strong>
          <span className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Fire Emblem - The Sacred Stones (Europe) (En,Fr,De,Es,It).gba</span>
          <span className="mt-4 text-xs text-muted-foreground">اسحب الملف هنا أو المس للاختيار. القراءة والبناء محليان داخل جهازك.</span>
          <input className="hidden" type="file" accept=".gba" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadRom(file);
          }} />
        </label>

        <section className="mt-7 rounded-xl border border-border bg-card p-5 text-sm leading-7">
          <div className="mb-2 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" /> ما الذي يبنيه الزر لاحقاً؟</div>
          <p className="text-muted-foreground">يضيف الباني خط <strong>Noto Kufi Arabic SemiBold</strong> إلى خطّي اللعبة معاً، ويعيد ضغط السطور المترجمة بـ Huffman ثم يحدّث مؤشرات الرسائل في نسخة ROM المنزّلة فقط. النص العربي يُشكّل ويُعكس تلقائياً كما في بقية الأداة؛ لا تعكسه يدوياً.</p>
          <p className="mt-2 text-muted-foreground">لا تُحرّر الوسوم بصيغة <code>{"{FE:XX}"}</code>؛ إنها قيم تتحكم بها اللعبة. يبقى ASCII والإنجليزية والأرقام متاحين داخل السطر نفسه.</p>
        </section>
      </div>
    </main>
  );
}
