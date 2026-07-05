import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Eye, EyeOff, AlertTriangle, Loader2, Sparkles, RotateCcw, BarChart3, ShieldCheck, FileDown, Download } from "lucide-react";
import { processArabicText, hasArabicChars, hasArabicPresentationForms } from "@/lib/arabic-processing";
import { buildRisenOutputFromState } from "@/lib/risen-extractor";
import type { useEditorState } from "@/hooks/useEditorState";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "state"
  | "arabicNumerals" | "setArabicNumerals"
  | "mirrorPunctuation" | "setMirrorPunctuation"
  | "handleApplyArabicProcessing" | "applyingArabic"
  | "handleUndoArabicProcessing"
  | "building" | "handleCheckIntegrity" | "handlePreBuild"
>;

interface EditorBuildSectionProps {
  editor: EditorSubset;
  isRisen?: boolean;
  unprocessedArabicCount: number;
  showBuildSection: boolean;
  setShowBuildSection: (v: boolean) => void;
  setShowArabicProcessConfirm: (v: boolean) => void;
  setShowDiagnostic: (v: boolean) => void;
}

const EditorBuildSection: React.FC<EditorBuildSectionProps> = ({
  editor,
  isRisen = false,
  unprocessedArabicCount,
  showBuildSection,
  setShowBuildSection,
  setShowArabicProcessConfirm,
  setShowDiagnostic,
}) => {
  const [risenBuilding, setRisenBuilding] = useState(false);
  const [shapeArabic, setShapeArabic] = useState(true);

  const handleRisenBuild = async () => {
    setRisenBuilding(true);
    try {
      const result = await buildRisenOutputFromState(editor.state?.translations || {}, editor.state?.entries, { shapeArabic });
      const blob = new Blob([result.buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      const { toast } = await import("@/hooks/use-toast");
      toast({
        title: "✅ تم البناء",
        description: `${result.translatedCount} ترجمة | ${result.buffer.byteLength.toLocaleString()} بايت${result.tagRepairCount > 0 ? ` | ⚠️ ${result.tagRepairCount} وسم Risen أُلحق تلقائياً — راجعها` : ""}`,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في البناء", description: (err as Error).message, variant: "destructive" });
    } finally {
      setRisenBuilding(false);
    }
  };

  return (
  <Collapsible open={showBuildSection} onOpenChange={setShowBuildSection}>
    <div className="flex items-center justify-between mb-3">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 font-display font-bold text-sm">
          {showBuildSection ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          ⚙️ المعالجة والبناء
          {!showBuildSection && <span className="text-xs text-muted-foreground font-body">(اضغط لإظهار)</span>}
        </Button>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent>
      <Card className="mb-4 border-border">
        <CardContent className="p-4">
          <h3 className="font-display font-bold mb-3 text-sm">⚙️ خيارات البناء</h3>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
              <input type="checkbox" checked={editor.arabicNumerals} onChange={(e) => editor.setArabicNumerals(e.target.checked)} className="rounded border-border" />
              تحويل الأرقام إلى هندية (٠١٢٣٤٥٦٧٨٩)
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
              <input type="checkbox" checked={editor.mirrorPunctuation} onChange={(e) => editor.setMirrorPunctuation(e.target.checked)} className="rounded border-border" />
              عكس علامات الترقيم (؟ ، ؛)
            </label>
            {isRisen && (
              <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
                <input type="checkbox" checked={shapeArabic} onChange={(e) => setShapeArabic(e.target.checked)} disabled={risenBuilding} className="rounded border-border" />
                تحويل النص العربي لأشكال العرض (مطلوب للعبة)
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Arabic Unprocessed Warning Banner — meaningless for Risen: its Arabic
          is expected to stay unshaped in the editor by design (shapeArabicForRisen
          runs only at build time), so the warning itself would be wrong, not
          just its "معالجة الآن" button (which is the same Xenoblade-only
          processing already disabled above). */}
      {!isRisen && unprocessedArabicCount > 0 && (
        <div className="mb-4 flex items-start gap-3 p-3 rounded-lg border border-secondary/40 bg-secondary/8">
          <AlertTriangle className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-bold text-secondary">
              ⚠️ {unprocessedArabicCount} نص عربي لم يُعالَج بعد
            </p>
            <p className="text-xs text-muted-foreground font-body mt-0.5">
              هذه النصوص تحتوي عربية غير مُشكَّلة (بدون Reshaping). سيتم معالجتها تلقائياً عند البناء، أو اضغط الزر أدناه للمعاينة أولاً.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={editor.handleApplyArabicProcessing}
            disabled={editor.applyingArabic}
            className="shrink-0 text-xs font-body border-secondary/40 text-secondary hover:border-secondary/60"
          >
            {editor.applyingArabic ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <Sparkles className="w-3 h-3 ml-1" />}
            معالجة الآن
          </Button>
        </div>
      )}

      {/* Arabic Processing + Build Buttons */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-6">
        <Button
          size="lg"
          variant="secondary"
          onClick={() => setShowArabicProcessConfirm(true)}
          disabled={editor.applyingArabic || isRisen}
          className="flex-1 min-w-[200px] font-display font-bold"
          title={isRisen ? "نصوص Risen تُشكَّل تلقائياً عند البناء — هذه المعالجة خاصة بـ Xenoblade وستُفسد النص" : undefined}
        >
          {editor.applyingArabic ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />} تطبيق المعالجة العربية ✨
        </Button>
        <Button size="sm" variant="outline" onClick={editor.handleUndoArabicProcessing} disabled={editor.applyingArabic} className="font-body gap-1 shrink-0" title="التراجع عن المعالجة العربية">
          <RotateCcw className="w-4 h-4" />
          <span className="hidden sm:inline">تراجع</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const st = editor.state;
            if (!st) return;
            const processed: Record<string, string> = {};
            for (const [key, value] of Object.entries(st.translations || {})) {
              if (!value?.trim()) continue;
              processed[key] = hasArabicPresentationForms(value) || !hasArabicChars(value)
                ? value
                : processArabicText(value, { arabicNumerals: editor.arabicNumerals, mirrorPunct: editor.mirrorPunctuation });
            }
            const blob = new Blob([JSON.stringify(processed, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `translations-processed-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            import("@/hooks/use-toast").then(({ toast }) =>
              toast({ title: "✅ تم التصدير", description: `${Object.keys(processed).length} ترجمة بعد المعالجة العربية` })
            );
          }}
          disabled={editor.applyingArabic}
          className="font-body gap-1 shrink-0"
          title="تصدير الترجمات بعد تطبيق المعالجة العربية"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">تصدير معالج</span>
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowDiagnostic(true)} disabled={editor.building} className="font-body gap-1 shrink-0" title="تشخيص ما قبل البناء">
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">تشخيص</span>
        </Button>
        <Button size="sm" variant="outline" onClick={editor.handleCheckIntegrity} disabled={editor.building} className="font-body gap-1 shrink-0" title="التحقق من سلامة الترجمة">
          <ShieldCheck className="w-4 h-4" />
          <span className="hidden sm:inline">سلامة</span>
        </Button>
        {isRisen ? (
          <Button size="lg" onClick={handleRisenBuild} disabled={risenBuilding} className="flex-1 min-w-[200px] font-display font-bold">
            {risenBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء ملف Risen وتنزيله
          </Button>
        ) : (
          <Button size="lg" onClick={editor.handlePreBuild} disabled={editor.building} className="flex-1 min-w-[200px] font-display font-bold">
            {editor.building ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء الملف النهائي
          </Button>
        )}
      </div>
    </CollapsibleContent>
  </Collapsible>
  );
};

export default EditorBuildSection;
