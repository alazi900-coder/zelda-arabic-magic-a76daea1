import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import BuildStatsDialog from "@/components/editor/BuildStatsDialog";
import BuildConfirmDialog from "@/components/editor/BuildConfirmDialog";
import CompareEnginesDialog from "@/components/editor/CompareEnginesDialog";
import ExportEnglishDialog from "@/components/editor/ExportEnglishDialog";
import ImportConflictDialog from "@/components/editor/ImportConflictDialog";
import SafetyRepairReport from "@/components/editor/SafetyRepairReport";
import IntegrityCheckDialog from "@/components/editor/IntegrityCheckDialog";
import PreBuildDiagnostic from "@/components/editor/PreBuildDiagnostic";
import PageTranslationCompare from "@/components/editor/PageTranslationCompare";
import GlossaryTranslationPreview from "@/components/editor/GlossaryTranslationPreview";
import GlossaryMergePreviewDialog from "@/components/editor/GlossaryMergePreviewDialog";
import ToolHelpDialog, { ToolType } from "@/components/editor/ToolHelpDialog";
import type { useEditorState } from "@/hooks/useEditorState";
import type { ExtractedEntry } from "@/components/editor/types";
import { isTechnicalText } from "@/components/editor/types";
import type { AnalysisAction } from "@/components/editor/AdvancedTranslationPanel";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "state"
  | "paginatedEntries"
  | "showRetranslateConfirm" | "setShowRetranslateConfirm" | "handleRetranslatePage"
  | "buildStats" | "setBuildStats"
  | "showSafetyReport" | "setShowSafetyReport" | "safetyRepairs"
  | "setFilterStatus" | "setSearch" | "setCurrentPage"
  | "showIntegrityDialog" | "setShowIntegrityDialog" | "integrityResult" | "checkingIntegrity" | "handleCheckIntegrity"
  | "showBuildConfirm" | "setShowBuildConfirm" | "buildPreview" | "handleBuild" | "building" | "handlePreBuild"
  | "updateTranslation" | "activeGlossary"
  | "userGeminiKey" | "userDeepSeekKey" | "userGroqKey" | "userCerebrasKey" | "userOpenRouterKey" | "myMemoryEmail" | "aiModel"
  | "handleExportEnglishOnlyJson" | "handleExportEnglishOnly"
  | "importConflicts" | "handleConflictConfirm" | "handleConflictCancel"
  | "translatedCount" | "handleClearTranslations"
  | "handleApplyArabicProcessing"
  | "handleFontTest"
  | "showPageCompare" | "pendingPageTranslations" | "pageTranslationOriginals" | "oldPageTranslations"
  | "applyPendingTranslations" | "discardPendingTranslations"
  | "autoPilot"
  | "showGlossaryPreview" | "glossaryPreviewEntries" | "applyGlossaryPreview" | "discardGlossaryPreview"
  | "pendingMerge" | "setPendingMerge" | "applyMergeDiffs"
  | "handleAdvancedAnalysis"
>;

interface EditorDialogsProps {
  editor: EditorSubset;
  showDiagnostic: boolean;
  setShowDiagnostic: (v: boolean) => void;
  compareEntry: ExtractedEntry | null;
  setCompareEntry: (e: ExtractedEntry | null) => void;
  showExportEnglishDialog: boolean;
  setShowExportEnglishDialog: (v: boolean) => void;
  showClearConfirm: 'all' | 'filtered' | null;
  setShowClearConfirm: (v: 'all' | 'filtered' | null) => void;
  showArabicProcessConfirm: boolean;
  setShowArabicProcessConfirm: (v: boolean) => void;
  showFontTest: boolean;
  setShowFontTest: (v: boolean) => void;
  fontTestWord: string;
  setFontTestWord: (v: string) => void;
  showToolHelp: ToolType;
  setShowToolHelp: (v: ToolType) => void;
  untranslatedCount: number;
}

const EditorDialogs: React.FC<EditorDialogsProps> = ({
  editor,
  showDiagnostic, setShowDiagnostic,
  compareEntry, setCompareEntry,
  showExportEnglishDialog, setShowExportEnglishDialog,
  showClearConfirm, setShowClearConfirm,
  showArabicProcessConfirm, setShowArabicProcessConfirm,
  showFontTest, setShowFontTest,
  fontTestWord, setFontTestWord,
  showToolHelp, setShowToolHelp,
  untranslatedCount,
}) => {
  return (
    <>
      <AlertDialog open={editor.showRetranslateConfirm} onOpenChange={editor.setShowRetranslateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إعادة ترجمة الصفحة؟</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const count = editor.paginatedEntries.filter(e => {
                  const key = `${e.msbtFile}:${e.index}`;
                  return editor.state?.translations[key]?.trim() && !isTechnicalText(e.original);
                }).length;
                return `سيتم استبدال ${count} ترجمة موجودة في هذه الصفحة بترجمات جديدة. يمكنك التراجع عن هذا الإجراء لاحقاً.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => { editor.setShowRetranslateConfirm(false); editor.handleRetranslatePage(); }}>إعادة الترجمة</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BuildStatsDialog stats={editor.buildStats} onClose={() => editor.setBuildStats(null)} />
      <SafetyRepairReport
        open={editor.showSafetyReport}
        onOpenChange={editor.setShowSafetyReport}
        repairs={editor.safetyRepairs}
        onNavigateToEntry={(key) => {
          editor.setFilterStatus('all');
          editor.setSearch('');
          setTimeout(() => {
            const idx = editor.state?.entries.findIndex(e => `${e.msbtFile}:${e.index}` === key) ?? -1;
            if (idx >= 0) {
              const page = Math.floor(idx / 50);
              editor.setCurrentPage(page);
              setTimeout(() => {
                const el = document.querySelector(`[data-entry-key="${CSS.escape(key)}"]`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }
          }, 50);
        }}
      />
      <IntegrityCheckDialog
        open={editor.showIntegrityDialog}
        onOpenChange={editor.setShowIntegrityDialog}
        result={editor.integrityResult}
        checking={editor.checkingIntegrity}
        onRecheck={editor.handleCheckIntegrity}
      />
      <BuildConfirmDialog
        open={editor.showBuildConfirm}
        onOpenChange={editor.setShowBuildConfirm}
        preview={editor.buildPreview}
        onConfirm={editor.handleBuild}
        building={editor.building}
      />
      <PreBuildDiagnostic
        open={showDiagnostic}
        onOpenChange={setShowDiagnostic}
        state={editor.state}
        onProceedToBuild={() => { setShowDiagnostic(false); editor.handlePreBuild(); }}
      />
      <CompareEnginesDialog
        open={!!compareEntry}
        onOpenChange={(open) => { if (!open) setCompareEntry(null); }}
        entry={compareEntry}
        onSelect={(key, translation) => editor.updateTranslation(key, translation)}
        glossary={editor.activeGlossary}
        userGeminiKey={editor.userGeminiKey}
        userDeepSeekKey={editor.userDeepSeekKey}
        userGroqKey={editor.userGroqKey}
        userCerebrasKey={editor.userCerebrasKey}
        userOpenRouterKey={editor.userOpenRouterKey}
        myMemoryEmail={editor.myMemoryEmail}
        aiModel={editor.aiModel}
      />
      <ExportEnglishDialog
        open={showExportEnglishDialog}
        onOpenChange={setShowExportEnglishDialog}
        totalCount={untranslatedCount}
        onExport={(chunkSize, format) => format === "json" ? editor.handleExportEnglishOnlyJson(chunkSize) : editor.handleExportEnglishOnly(chunkSize)}
      />
      <ImportConflictDialog
        open={editor.importConflicts.length > 0}
        conflicts={editor.importConflicts}
        onConfirm={editor.handleConflictConfirm}
        onCancel={editor.handleConflictCancel}
      />

      {/* Clear Translations Confirmation */}
      <AlertDialog open={!!showClearConfirm} onOpenChange={(v) => { if (!v) setShowClearConfirm(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display">
              <Trash2 className="w-5 h-5 text-destructive" />
              ⚠️ تأكيد مسح الترجمات
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {showClearConfirm === 'all'
                ? `سيتم حذف جميع الترجمات (${editor.translatedCount} ترجمة) نهائياً. هل أنت متأكد؟`
                : `سيتم حذف ترجمات القسم المحدد فقط. هل أنت متأكد؟`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 justify-end">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (showClearConfirm) editor.handleClearTranslations(showClearConfirm);
                setShowClearConfirm(null);
              }}
            >
              🗑️ نعم، امسح الترجمات
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Arabic Processing Confirmation */}
      <AlertDialog open={showArabicProcessConfirm} onOpenChange={setShowArabicProcessConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">✨ تطبيق المعالجة العربية</AlertDialogTitle>
            <AlertDialogDescription className="font-body text-right">
              سيتم تحويل جميع النصوص العربية إلى أشكال العرض (Presentation Forms) وعكس الاتجاه للعمل داخل محرك اللعبة.
              <br /><br />
              ⚠️ هذه العملية تغيّر شكل النصوص بالكامل. إذا ضغطت بالغلط، يمكنك استخدام زر "التراجع عن المعالجة" لإعادتها.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="font-display">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="font-display"
              onClick={() => {
                setShowArabicProcessConfirm(false);
                editor.handleApplyArabicProcessing();
              }}
            >
              ✨ تطبيق المعالجة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Font Test Dialog */}
      <Dialog open={showFontTest} onOpenChange={setShowFontTest}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">🔤 تجربة الخط</DialogTitle>
            <DialogDescription>اكتب كلمة أو عبارة لملء جميع الترجمات بها لاختبار الخط</DialogDescription>
          </DialogHeader>
          <Input
            value={fontTestWord}
            onChange={e => setFontTestWord(e.target.value)}
            placeholder="مثال: اختبار"
            className="text-right font-display"
            dir="rtl"
            onKeyDown={e => {
              if (e.key === 'Enter' && fontTestWord.trim()) {
                editor.handleFontTest(fontTestWord);
                setShowFontTest(false);
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFontTest(false)}>إلغاء</Button>
            <Button onClick={() => { editor.handleFontTest(fontTestWord); setShowFontTest(false); }} disabled={!fontTestWord.trim()}>
              ✨ ملء الكل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Page Translation Compare Dialog */}
      {editor.showPageCompare && editor.pendingPageTranslations && (
        <PageTranslationCompare
          open={editor.showPageCompare}
          originals={editor.pageTranslationOriginals}
          oldTranslations={editor.oldPageTranslations}
          newTranslations={editor.pendingPageTranslations}
          onApply={(selectedKeys) => editor.applyPendingTranslations(selectedKeys)}
          onDiscard={editor.discardPendingTranslations}
        />
      )}

      {/* AutoPilot Preview Compare Dialog */}
      {editor.autoPilot.pendingTranslations && (
        <PageTranslationCompare
          open={true}
          originals={editor.autoPilot.pendingOriginals}
          oldTranslations={editor.autoPilot.pendingOldTranslations}
          newTranslations={editor.autoPilot.pendingTranslations}
          onApply={(selectedKeys) => editor.autoPilot.applyPending(selectedKeys)}
          onDiscard={editor.autoPilot.discardPending}
        />
      )}

      {/* Glossary Translation Preview Dialog */}
      {editor.showGlossaryPreview && editor.glossaryPreviewEntries.length > 0 && (
        <GlossaryTranslationPreview
          open={editor.showGlossaryPreview}
          entries={editor.glossaryPreviewEntries}
          onApply={(selectedKeys) => editor.applyGlossaryPreview(selectedKeys)}
          onDiscard={editor.discardGlossaryPreview}
        />
      )}

      {editor.pendingMerge && (
        <GlossaryMergePreviewDialog
          open={!!editor.pendingMerge}
          onClose={() => editor.setPendingMerge(null)}
          onConfirm={(accepted) => editor.applyMergeDiffs(accepted, editor.pendingMerge!.replace)}
          glossaryName={editor.pendingMerge.name}
          diffs={editor.pendingMerge.diffs}
        />
      )}

      {/* Tool Help Dialog */}
      <ToolHelpDialog
        tool={showToolHelp}
        onClose={() => {
          const toolToRun = showToolHelp;
          setShowToolHelp(null);
          if (toolToRun && ['literal-detect', 'style-unify', 'consistency-check', 'alternatives', 'full-analysis'].includes(toolToRun)) {
            editor.handleAdvancedAnalysis(toolToRun as AnalysisAction);
          }
        }}
      />
    </>
  );
};

export default EditorDialogs;
