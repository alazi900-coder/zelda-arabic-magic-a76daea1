import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { idbSet } from "@/lib/idb-storage";
import type { EditorState } from "@/components/editor/types";
import {
  extractMother3Entries,
  MOTHER3_BUFFER_KEY,
  MOTHER3_SOURCE_GAME,
} from "@/lib/mother3/m3-editor-bridge";

/**
 * Mother 3 (English Fan Translation v1.1) opener: reads a .gba ROM, decodes the
 * obfuscated main script, and loads it into the shared translation editor
 * (`/editor`) — where it gets the same auto-translation, line-splitting,
 * technical-symbol protection, and quality tools as the other games. The ROM
 * bytes are stashed in IndexedDB so the editor's build step can produce a
 * patched, re-obfuscated ROM.
 */
export default function Mother3() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const loadRom = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const rom = new Uint8Array(await file.arrayBuffer());
        const { entries, bankCount, lineCount } = extractMother3Entries(rom);
        if (entries.length === 0) {
          throw new Error("لم يُعثر على نصوص Mother 3 — تأكد أنها النسخة الإنجليزية 1.1");
        }

        const editorState: EditorState = {
          entries,
          translations: {},
          protectedEntries: new Set(),
          glossary: "",
          technicalBypass: new Set(),
          fuzzyScores: {},
          clearedKeys: new Set(),
        };
        await idbSet("editorState", editorState);
        await idbSet("editor-source-game", MOTHER3_SOURCE_GAME);
        await idbSet(MOTHER3_BUFFER_KEY, rom.buffer.slice(0));

        const originals: Record<string, string> = {};
        for (const e of entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
        await idbSet("originalTexts", originals);

        toast.success(`تم استخراج ${entries.length} سطر من ${bankCount} بنك (${lineCount} إجمالي)`);
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
          <h1 className="text-2xl font-bold">تعريب Mother 3</h1>
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
          <span className="text-lg font-medium">افتح ملف Mother 3 (.gba)</span>
          <span className="text-sm text-muted-foreground">
            النسخة الإنجليزية 1.1 — يُفتح مباشرة في المحرر الرئيسي
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
          <p>بعد الفتح ستحصل في المحرر على: الترجمة التلقائية، تقسيم الأسطر، حماية الرموز التقنية، فحوص الجودة، والذكاء الاصطناعي — مثل بقية الألعاب.</p>
          <p>
            أكواد التحكم تظهر مثل <code className="rounded bg-muted px-1">[F103]</code> والبايتات الخاصة مثل{" "}
            <code className="rounded bg-muted px-1">{"{9B}"}</code> — اتركها كما هي داخل النص، فهي محميّة تلقائياً.
          </p>
          <p>عند البناء من المحرر ستحصل على ROM معرّب. النص العربي يجب أن يبقى ضمن مساحة كل بنك؛ لو تجاوز ستُنبّهك الأداة بالبنوك المتجاوزة.</p>
        </div>
      </div>
    </div>
  );
}
