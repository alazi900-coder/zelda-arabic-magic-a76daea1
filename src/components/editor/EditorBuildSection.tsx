import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Eye, EyeOff, AlertTriangle, Loader2, Sparkles, RotateCcw, BarChart3, ShieldCheck, Package, FileDown } from "lucide-react";
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
  isDanganronpa: boolean;
  unprocessedArabicCount: number;
  showBuildSection: boolean;
  setShowBuildSection: (v: boolean) => void;
  setShowArabicProcessConfirm: (v: boolean) => void;
  setShowDiagnostic: (v: boolean) => void;
  drBuilding: boolean;
  setDrBuilding: (v: boolean) => void;
}

const EditorBuildSection: React.FC<EditorBuildSectionProps> = ({
  editor,
  isDanganronpa,
  unprocessedArabicCount,
  showBuildSection,
  setShowBuildSection,
  setShowArabicProcessConfirm,
  setShowDiagnostic,
  drBuilding,
  setDrBuilding,
}) => (
  <div id="editor-build-section">
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
          </div>
        </CardContent>
      </Card>

      {/* Arabic Unprocessed Warning Banner */}
      {unprocessedArabicCount > 0 && (
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
      <div className="flex gap-3 mb-6">
        <Button size="lg" variant="secondary" onClick={() => setShowArabicProcessConfirm(true)} disabled={editor.applyingArabic} className="flex-1 font-display font-bold">
          {editor.applyingArabic ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />} تطبيق المعالجة العربية ✨
        </Button>
        <Button size="sm" variant="outline" onClick={editor.handleUndoArabicProcessing} disabled={editor.applyingArabic} className="font-body gap-1 shrink-0" title="التراجع عن المعالجة العربية">
          <RotateCcw className="w-4 h-4" />
          <span className="hidden sm:inline">تراجع</span>
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowDiagnostic(true)} disabled={editor.building} className="font-body gap-1 shrink-0" title="تشخيص ما قبل البناء">
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">تشخيص</span>
        </Button>
        <Button size="sm" variant="outline" onClick={editor.handleCheckIntegrity} disabled={editor.building} className="font-body gap-1 shrink-0" title="التحقق من سلامة الترجمة">
          <ShieldCheck className="w-4 h-4" />
          <span className="hidden sm:inline">سلامة</span>
        </Button>
        {isDanganronpa ? (
          <Button size="lg" onClick={async () => {
            setDrBuilding(true);
            try {
              const { idbGet } = await import("@/lib/idb-storage");
              const { rebuildArchive, nodeHasTranslations } = await import("@/lib/danganronpa-rebuild");
              const treesObj = await idbGet<Record<string, import("@/lib/danganronpa-rebuild").ArchiveNode>>("dr-archive-trees");
              if (!treesObj || Object.keys(treesObj).length === 0) {
                import("@/hooks/use-toast").then(({ toast }) => toast({ title: "لا توجد ملفات أرشيف محفوظة", description: "ارجع لصفحة المعالجة وارفع الملفات مرة أخرى", variant: "destructive" }));
                return;
              }
              const translations = new Map<string, string>();
              const st = editor.state;
              if (st?.entries) {
                for (let i = 0; i < st.entries.length; i++) {
                  const entry = st.entries[i];
                  const key = entry.msbtFile;
                  const editorKey = `${key}:${i}`;
                  const tr = st.translations?.[editorKey];
                  if (tr?.trim()) translations.set(key, tr);
                }
              }
              if (translations.size === 0) {
                import("@/hooks/use-toast").then(({ toast }) => toast({ title: "لا توجد ترجمات لتطبيقها", variant: "destructive" }));
                return;
              }
              const JSZip = (await import("jszip")).default;
              const zip = new JSZip();
              let built = 0, skipped = 0;
              for (const [fileName, tree] of Object.entries(treesObj)) {
                if (!nodeHasTranslations(tree, translations)) { skipped++; continue; }
                try {
                  const rebuilt = rebuildArchive(tree, translations);
                  zip.file(fileName, rebuilt);
                  built++;
                } catch (err) {
                  console.error(`Failed to rebuild ${fileName}:`, err);
                  import("@/hooks/use-toast").then(({ toast }) => toast({ title: `خطأ في بناء ${fileName}`, description: String(err), variant: "destructive" }));
                }
              }
              if (built > 0) {
                const blob = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "danganronpa-translated.zip"; a.click();
                URL.revokeObjectURL(url);
                import("@/hooks/use-toast").then(({ toast }) => toast({
                  title: `تم بناء ${built} ملف في ZIP`,
                  description: skipped > 0 ? `تم تخطي ${skipped} ملف بدون ترجمات` : `${translations.size} ترجمة مطبّقة`,
                }));
              }
            } catch (err) {
              console.error("DR build error:", err);
              import("@/hooks/use-toast").then(({ toast }) => toast({ title: "خطأ في البناء", description: String(err), variant: "destructive" }));
            } finally {
              setDrBuilding(false);
            }
          }} disabled={drBuilding} className="flex-1 font-display font-bold">
            {drBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Package className="w-4 h-4 mr-2" />} بناء ملفات Danganronpa
          </Button>
        ) : (
          <Button size="lg" onClick={editor.handlePreBuild} disabled={editor.building} className="flex-1 font-display font-bold">
            {editor.building ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء الملف النهائي
          </Button>
        )}
      </div>
    </CollapsibleContent>
  </Collapsible>
  </div>
);

export default EditorBuildSection;
