import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Upload, ArrowRight, FileArchive, Download, Loader2, CheckCircle2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { idbSet, idbGet } from "@/lib/idb-storage";
import {
  extractEntriesFromP00,
  buildRisenOutputFromState,
  DEFAULT_ARABIC_TARGET_FIELD,
  STAGEDIR_TARGET_FIELD,
} from "@/lib/risen-extractor";
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
  const [logs, setLogs] = useState<string[]>([]);
  const [includeStageDir, setIncludeStageDir] = useState(false);
  const [shapeArabic, setShapeArabic] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString("ar-SA")}] ${msg}`]);
  }, []);

  useEffect(() => {
    (async () => {
      const m = await idbGet<RisenMeta>(RISEN_META_KEY);
      if (m) setMeta(m);
    })();
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setLogs([]);
    addLog(`بدء قراءة الملف: ${file.name} (${file.size.toLocaleString()} بايت)`);
    try {
      const buffer = await file.arrayBuffer();
      addLog("تم تحميل الملف في الذاكرة، جاري تحليل الجداول...");

      const result = extractEntriesFromP00(buffer, DEFAULT_ARABIC_TARGET_FIELD, { includeStageDir });
      addLog(`تم تحليل ${result.doc.tables.length} جدول: ${result.doc.tables.map((t) => t.name).join("، ")}`);
      addLog(`المصدر: English_Text فقط (fallback إلى German_Text للصفوف الفاضية)${includeStageDir ? " + StageDir" : ""}`);
      for (const s of result.stats.perTable) {
        addLog(`  ${s.table}: ${s.rows} صف، ${s.translatable} قابل للترجمة`);
      }

      if (result.entries.length === 0) {
        addLog("خطأ: لم يتم العثور على أي نص قابل للترجمة");
        toast.error("لم يتم العثور على أي نص قابل للترجمة في هذا الملف");
        return;
      }

      // Store raw buffer for later rebuild
      await idbSet(RISEN_BUFFER_KEY, buffer);
      addLog("تم حفظ الملف الأصلي محلياً لاستخدامه لاحقاً عند البناء");

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
      await idbSet("editor-source-game", "risen");
      addLog(`تم تحميل ${result.entries.length} نص في المحرر`);

      // Store originals map so editor "detectPreTranslated" behaves sanely
      const originals: Record<string, string> = {};
      for (const e of result.entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
      await idbSet("originalTexts", originals);

      toast.success(`تم استخراج ${result.entries.length} نص من ${result.stats.perTable.length} جدول`);
      addLog("جاري التوجيه إلى المحرر...");
      // Navigate to editor
      navigate("/editor");
    } catch (err) {
      console.error(err);
      addLog(`خطأ: ${(err as Error).message}`);
      toast.error("فشل قراءة الملف: " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [navigate, addLog, includeStageDir]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }, [busy, handleFile]);

  const handleBuild = useCallback(async () => {
    setBuilding(true);
    setLogs([]);
    addLog("بدء البناء...");
    try {
      const editorState = await idbGet<EditorState>("editorState");
      if (!editorState || editorState.entries.length === 0) {
        addLog("خطأ: لا توجد بيانات محرر محفوظة");
        toast.error("لا توجد ترجمات في المحرر");
        return;
      }

      addLog("جاري تحليل الملف الأصلي وتطبيق الترجمات...");
      const result = await buildRisenOutputFromState(editorState.translations, editorState.entries, { shapeArabic });
      addLog(`تم جمع ${result.translatedCount} ترجمة وإعادة بناء الملف`);
      if (result.tagRepairCount > 0) {
        addLog(`⚠️ ${result.tagRepairCount} ترجمة كان ينقصها وسم Risen — أُلحق تلقائياً، يُنصح بمراجعتها`);
      }

      // Download
      const blob = new Blob([result.buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);

      const delta = result.buffer.byteLength - result.originalSize;
      const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
      addLog(`نجح البناء: حجم جديد ${result.buffer.byteLength.toLocaleString()} بايت (${deltaStr} عن الأصل)`);
      toast.success(
        `تم البناء: ${result.translatedCount} ترجمة | حجم ${result.buffer.byteLength.toLocaleString()} بايت (${deltaStr})`
      );
    } catch (err) {
      console.error(err);
      addLog(`خطأ: ${(err as Error).message}`);
      toast.error("فشل البناء: " + (err as Error).message);
    } finally {
      setBuilding(false);
    }
  }, [addLog, shapeArabic]);

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
              <h2 className="font-display font-bold">1. ارفع strings.p00 أو strings.pak</h2>
              <p className="text-sm text-muted-foreground">من مسار <code className="font-mono">_work/Data/Strings/</code></p>
            </div>
          </div>
          <label className="flex items-center gap-2 mb-3 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={includeStageDir}
              onChange={(e) => setIncludeStageDir(e.target.checked)}
              disabled={busy}
              className="rounded border-border"
            />
            إظهار نصوص StageDir (توجيه أداء قصير، مثل "يضحك")
          </label>
          <label className="block">
            <input
              type="file"
              accept=".p00,.pak"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${busy ? "opacity-50 pointer-events-none border-border" : dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {busy ? (
                <>
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">جاري التحليل...</p>
                </>
              ) : (
                <>
                  <FileArchive className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm">اضغط لاختيار strings.p00 أو strings.pak، أو اسحب الملف وأفلته هنا</p>
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
                <h2 className="font-display font-bold">3. بناء الملف المُعرَّب</h2>
                <p className="text-sm text-muted-foreground">
                  يقرأ ترجمات المحرر ويستبدل حقل <code className="font-mono">{meta.targetField}</code>
                  {" "}(و<code className="font-mono">{STAGEDIR_TARGET_FIELD}</code> إن وُجد) بها
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 mb-3 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={shapeArabic}
                onChange={(e) => setShapeArabic(e.target.checked)}
                disabled={building}
                className="rounded border-border"
              />
              تحويل النص العربي لأشكال العرض (مطلوب للعبة)
            </label>
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

        {/* Log */}
        {logs.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold">سجل العمليات</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const blob = new Blob([logs.join("\n")], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `risen-process-log-${new Date().toISOString().slice(0, 10)}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <FileDown className="w-4 h-4 ml-1" /> تصدير
              </Button>
            </div>
            <div className="max-h-96 overflow-y-auto font-mono text-xs bg-background/50 rounded-lg p-3 space-y-1">
              {logs.map((line, i) => (
                <div key={i} className="text-muted-foreground">{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RisenProcess;
