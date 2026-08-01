import React, { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Upload, ArrowRight, FileArchive, Download, Loader2, CheckCircle2, FileDown, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { idbSet, idbGet } from "@/lib/idb-storage";
import {
  extractGameMakerStrings,
  buildGameMakerFromState,
  GM_BUFFER_KEY,
  GM_META_KEY,
  getArabicFilename,
  type GameMakerMeta,
} from "@/lib/gamemaker/gm-editor-bridge";
import type { EditorState } from "@/components/editor/types";

const GameMakerProcess = () => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<GameMakerMeta | null>(null);
  const [building, setBuilding] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString("ar-SA")}] ${msg}`]);
  }, []);

  useEffect(() => {
    (async () => {
      const m = await idbGet<GameMakerMeta>(GM_META_KEY);
      if (m) setMeta(m);
    })();
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setLogs([]);
      addLog(`بدء قراءة الملف: ${file.name} (${file.size.toLocaleString()} بايت)`);
      try {
        const buffer = await file.arrayBuffer();
        addLog("تم تحميل الملف في الذاكرة، جاري تحليل البنية...");

        const result = extractGameMakerStrings(buffer);
        addLog(`تم تحليل الملف بنجاح`);
        addLog(`إجمالي النصوص: ${result.stats.totalStrings}`);
        addLog(`النصوص القابلة للترجمة: ${result.stats.translatableStrings}`);

        if (result.entries.length === 0) {
          addLog("تحذير: لم يتم العثور على نصوص قابلة للترجمة");
          toast.warning("لم يتم العثور على نصوص قابلة للترجمة في هذا الملف");
          return;
        }

        // حفظ الملف الأصلي محلياً
        await idbSet(GM_BUFFER_KEY, buffer);
        addLog("تم حفظ الملف الأصلي محلياً لاستخدامه لاحقاً عند البناء");

        // حفظ البيانات الوصفية
        const newMeta: GameMakerMeta = {
          filename: file.name,
          extractedAt: new Date().toISOString(),
          stats: result.stats,
        };
        await idbSet(GM_META_KEY, newMeta);
        setMeta(newMeta);

        // تحميل في حالة المحرر
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
        await idbSet("editor-source-game", "gamemaker");
        addLog(`تم تحميل ${result.entries.length} نص في المحرر`);

        // حفظ النصوص الأصلية
        const originals: Record<string, string> = {};
        for (const e of result.entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
        await idbSet("originalTexts", originals);

        toast.success(`تم استخراج ${result.entries.length} نص من ملف GameMaker`);
        addLog("جاري التوجيه إلى المحرر...");
        navigate("/editor");
      } catch (err) {
        console.error(err);
        addLog(`خطأ: ${(err as Error).message}`);
        toast.error("فشل قراءة الملف: " + (err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [navigate, addLog]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (busy) return;
      const f = e.dataTransfer.files?.[0];
      if (f) void handleFile(f);
    },
    [busy, handleFile]
  );

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

      addLog("جاري تطبيق الترجمات على الملف الأصلي...");
      const result = await buildGameMakerFromState(editorState.translations, editorState.entries);
      addLog(`تم جمع ${result.translatedCount} ترجمة وإعادة بناء الملف`);

      // تحميل الملف
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
        `تم البناء: ${result.translatedCount} ترجمة | حجم ${result.buffer.byteLength.toLocaleString()} بايت`
      );
    } catch (err) {
      console.error(err);
      addLog(`خطأ: ${(err as Error).message}`);
      toast.error("فشل البناء: " + (err as Error).message);
    } finally {
      setBuilding(false);
    }
  }, [addLog]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="w-4 h-4" /> الرجوع
          </Link>
          <h1 className="text-2xl font-display font-bold">معالجة GameMaker</h1>
        </div>

        {/* منطقة الرفع */}
        <div
          className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <FileArchive className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <h2 className="text-lg font-display font-bold mb-2">ارفع ملف GameMaker</h2>
          <p className="text-sm text-muted-foreground mb-4">
            اسحب ملف <code className="bg-muted px-2 py-1 rounded">game.droid</code> أو أي ملف GameMaker آخر هنا
          </p>
          <label>
            <input
              type="file"
              accept=".droid,.win,.unx,.gml"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) void handleFile(f);
              }}
              disabled={busy}
              className="hidden"
            />
            <Button disabled={busy} className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {busy ? "جاري التحميل..." : "اختر ملفاً"}
            </Button>
          </label>
        </div>

        {/* سجل العمليات */}
        {logs.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/50 p-4">
            <h3 className="font-display font-bold mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" /> سجل العمليات
            </h3>
            <div className="space-y-1 font-mono text-xs text-muted-foreground max-h-48 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </div>
        )}

        {/* معلومات الملف المحمل */}
        {meta && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-display font-bold mb-3">معلومات الملف المحمل</h3>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">الملف:</span> {meta.filename}
              </p>
              <p>
                <span className="text-muted-foreground">تاريخ الاستخراج:</span>{" "}
                {new Date(meta.extractedAt).toLocaleString("ar-SA")}
              </p>
              <p>
                <span className="text-muted-foreground">إجمالي النصوص:</span> {meta.stats.totalStrings}
              </p>
              <p>
                <span className="text-muted-foreground">النصوص القابلة للترجمة:</span> {meta.stats.translatableStrings}
              </p>
            </div>
          </div>
        )}

        {/* زر البناء */}
        {meta && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-display font-bold mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-500" /> بناء الملف المعرّب
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              بعد الانتهاء من الترجمة في المحرر، اضغط هنا لبناء ملف GameMaker معرّب
            </p>
            <Button
              onClick={handleBuild}
              disabled={building}
              className="gap-2 w-full"
              variant="default"
            >
              {building ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري البناء...
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" />
                  بناء وتحميل الملف المعرّب
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameMakerProcess;
