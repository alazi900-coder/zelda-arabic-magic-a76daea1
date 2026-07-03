import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Upload, ArrowRight, FileArchive, Download, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { idbSet, idbGet } from "@/lib/idb-storage";
import { extractEntriesFromP00, DEFAULT_ARABIC_TARGET_FIELD } from "@/lib/risen-extractor";
import { parseRisenP00Full, applyTranslations, buildRisenP00, makeKey } from "@/lib/risen-p00";
import type { EditorState } from "@/components/editor/types";

const RISEN_BUFFER_KEY = "risenSourceBuffer";
const RISEN_META_KEY = "risenMeta";

interface RisenMeta {
  filename: string;
  extractedAt: string;
  stats: { table: string; rows: number; translatable: number }[];
  targetField: string;
}

const RisenProcess = () => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<RisenMeta | null>(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    (async () => {
      const m = await idbGet<RisenMeta>(RISEN_META_KEY);
      if (m) setMeta(m);
    })();
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = extractEntriesFromP00(buffer);
      if (result.entries.length === 0) {
        toast.error("لم يتم العثور على أي نص قابل للترجمة في هذا الملف");
        return;
      }

      // Store raw buffer for later rebuild
      await idbSet(RISEN_BUFFER_KEY, buffer);

      // Save meta
      const newMeta: RisenMeta = {
        filename: file.name,
        extractedAt: new Date().toISOString(),
        stats: result.stats.perTable,
        targetField: DEFAULT_ARABIC_TARGET_FIELD,
      };
      await idbSet(RISEN_META_KEY, newMeta);
      setMeta(newMeta);

      // Load into editor state (compatible with existing /editor UI)
      const editorState: EditorState = {
        entries: result.entries,
        translations: {},
        protectedEntries: new Set(),
        glossary: "",
        technicalBypass: new Set(),
        fuzzyScores: {},
        clearedKeys: new Set(),
      };
      await idbSet("editorState", editorState);

      // Store originals map so editor "detectPreTranslated" behaves sanely
      const originals: Record<string, string> = {};
      for (const e of result.entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
      await idbSet("originalTexts", originals);

      toast.success(`تم استخراج ${result.entries.length} نص من ${result.stats.perTable.length} جدول`);
      // Navigate to editor
      navigate("/editor");
    } catch (err) {
      console.error(err);
      toast.error("فشل قراءة الملف: " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  const handleBuild = useCallback(async () => {
    setBuilding(true);
    try {
      const buffer = await idbGet<ArrayBuffer>(RISEN_BUFFER_KEY);
      if (!buffer) {
        toast.error("لا يوجد ملف مصدر — ارفع strings.p00 أولاً");
        return;
      }
      const editorState = await idbGet<EditorState>("editorState");
      if (!editorState || editorState.entries.length === 0) {
        toast.error("لا توجد ترجمات في المحرر");
        return;
      }

      // Convert editor keys `${msbtFile}:${index}` → rebuild keys makeKey(table, field, index)
      const targetField = meta?.targetField ?? DEFAULT_ARABIC_TARGET_FIELD;
      const translations = new Map<string, string>();
      let translatedCount = 0;
      for (const [key, value] of Object.entries(editorState.translations)) {
        if (!value?.trim()) continue;
        const parts = key.split(":");
        if (parts.length !== 2) continue;
        const [table, indexStr] = parts;
        const index = parseInt(indexStr, 10);
        if (isNaN(index)) continue;
        translations.set(makeKey(table, targetField, index), value);
        translatedCount++;
      }

      if (translatedCount === 0) {
        toast.error("لم تُدخل أي ترجمة بعد");
        return;
      }

      const doc = parseRisenP00Full(buffer);
      applyTranslations(doc, translations);
      const rebuilt = buildRisenP00(doc);

      // Download
      const blob = new Blob([rebuilt], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "strings.p00";
      a.click();
      URL.revokeObjectURL(url);

      const delta = rebuilt.byteLength - buffer.byteLength;
      const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
      toast.success(
        `تم البناء: ${translatedCount} ترجمة | حجم ${rebuilt.byteLength.toLocaleString()} بايت (${deltaStr})`
      );
    } catch (err) {
      console.error(err);
      toast.error("فشل البناء: " + (err as Error).message);
    } finally {
      setBuilding(false);
    }
  }, [meta]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/risen" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="w-4 h-4" /> الرجوع
          </Link>
          <h1 className="text-2xl font-display font-bold">معالجة Risen 1</h1>
        </div>

        {/* Upload */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-bold">1. ارفع strings.p00</h2>
              <p className="text-sm text-muted-foreground">من مسار <code className="font-mono">_work/Data/Strings/</code></p>
            </div>
          </div>
          <label className="block">
            <input
              type="file"
              accept="*/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className={`border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors ${busy ? "opacity-50 pointer-events-none" : ""}`}>
              {busy ? (
                <>
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">جاري التحليل...</p>
                </>
              ) : (
                <>
                  <FileArchive className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm">اضغط لاختيار strings.p00</p>
                </>
              )}
            </div>
          </label>
        </div>

        {/* Meta / Editor link */}
        {meta && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <div>
                <h2 className="font-display font-bold">تم استخراج <span className="font-mono">{meta.filename}</span></h2>
                <p className="text-xs text-muted-foreground">{new Date(meta.extractedAt).toLocaleString("ar")}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4 text-sm">
              {meta.stats.map((s) => (
                <div key={s.table} className="rounded-lg bg-background/50 p-3 text-center">
                  <div className="font-mono text-xs text-muted-foreground">{s.table}</div>
                  <div className="font-display font-bold text-lg">{s.translatable}</div>
                  <div className="text-xs text-muted-foreground">قابل للترجمة</div>
                </div>
              ))}
            </div>
            <Link to="/editor">
              <Button className="w-full font-display font-bold">
                2. افتح المحرر للترجمة →
              </Button>
            </Link>
          </div>
        )}

        {/* Build */}
        {meta && (
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                <Download className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display font-bold">3. بناء strings.p00 المُعرَّب</h2>
                <p className="text-sm text-muted-foreground">
                  يقرأ ترجمات المحرر ويستبدل حقل <code className="font-mono">{meta.targetField}</code> بها
                </p>
              </div>
            </div>
            <Button
              onClick={handleBuild}
              disabled={building}
              size="lg"
              className="w-full font-display font-bold"
            >
              {building ? (
                <><Loader2 className="w-5 h-5 ml-2 animate-spin" /> جاري البناء...</>
              ) : (
                <><Download className="w-5 h-5 ml-2" /> بناء وتنزيل</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RisenProcess;
