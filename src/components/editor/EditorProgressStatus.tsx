import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RotateCcw, StopCircle, BarChart3 } from "lucide-react";
import CategoryProgress from "@/components/editor/CategoryProgress";
import FileLoadReport from "@/components/editor/FileLoadReport";
import { PanelSettingsMenu } from "@/components/editor/PanelSettingsMenu";
import { AutoPilotPanel } from "@/components/editor/AutoPilotPanel";
import BdatBuildReport from "@/components/editor/BdatBuildReport";
import TranslationStatsPanel from "@/components/editor/TranslationStatsPanel";
import type { useEditorState } from "@/hooks/useEditorState";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "state"
  | "categoryProgress"
  | "filterCategory" | "setFilterCategory"
  | "qualityStats" | "filterStatus" | "setFilterStatus"
  | "handleFixDamagedTags" | "translating"
  | "handleRedistributeTags" | "tagsCount"
  | "bdatTableNames"
  | "translatedCount"
  | "lastSaved"
  | "clearUndoBackup" | "handleUndoClear"
  | "hiddenPanels" | "togglePanel"
  | "autoPilot"
  | "translationProvider" | "setTranslationProvider"
  | "aiModel" | "setAiModel"
  | "translateProgress"
  | "autoCorrectProgress" | "handleStopAutoCorrect"
  | "detectWeakProgress" | "handleStopDetectWeak"
  | "buildProgress" | "buildStats" | "setBuildStats"
  | "bdatFileStats" | "building" | "dismissBuildProgress"
  | "cloudStatus"
  | "tmStats"
  | "aiRequestsToday" | "aiRequestsMonth"
  | "glossarySessionStats"
>;

interface EditorProgressStatusProps {
  editor: EditorSubset;
  isDanganronpa: boolean;
  setShowTagRepair: (v: boolean) => void;
}

const EditorProgressStatus: React.FC<EditorProgressStatusProps> = ({
  editor,
  isDanganronpa,
  setShowTagRepair,
}) => {
  if (!editor.state) return null;
  const state = editor.state;
  return (
    <>
      {/* Category Progress */}
      <CategoryProgress
        categoryProgress={editor.categoryProgress}
        filterCategory={editor.filterCategory}
        setFilterCategory={editor.setFilterCategory}
        damagedTagsCount={editor.qualityStats.damagedTags}
        onFilterDamagedTags={() => editor.setFilterStatus(editor.filterStatus === "damaged-tags" ? "all" : "damaged-tags")}
        isDamagedTagsActive={editor.filterStatus === "damaged-tags"}
        onFixDamagedTags={() => editor.handleFixDamagedTags(editor.qualityStats.damagedTagKeys)}
        onLocalFixDamagedTags={() => setShowTagRepair(true)}
        isFixing={editor.translating}
        onRedistributeTags={editor.handleRedistributeTags}
        tagsCount={editor.tagsCount}
        isBdat={editor.bdatTableNames.length > 0}
        isDanganronpa={isDanganronpa}
      />

      {/* Progress Bar */}
      <div className="space-y-2 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-sm font-display font-bold text-foreground">نسبة الإنجاز</span>
          <span className="text-sm font-body text-muted-foreground">
            {editor.translatedCount} / {state.entries.length} ({state.entries.length > 0 ? Math.round((editor.translatedCount / state.entries.length) * 100) : 0}%)
          </span>
        </div>
        <Progress value={state.entries.length > 0 ? (editor.translatedCount / state.entries.length) * 100 : 0} className="h-2.5" />
      </div>

      {/* File Load Report */}
      <FileLoadReport entries={state.entries} translations={state.translations} />

      {/* Status Messages */}
      {editor.lastSaved && (
        <Card className="mb-4 border-secondary/30 bg-secondary/5"><CardContent className="p-4 text-center font-display">{editor.lastSaved}</CardContent></Card>
      )}
      {/* Undo Clear Banner */}
      {editor.clearUndoBackup && (
        <Card className="mb-4 border-destructive/30 bg-destructive/5">
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <span className="text-sm font-display">⚠️ تم مسح الترجمات — يمكنك التراجع خلال 15 ثانية</span>
            <Button size="sm" variant="outline" onClick={editor.handleUndoClear} className="font-display border-destructive/30 text-destructive hover:text-destructive shrink-0">
              <RotateCcw className="w-4 h-4" /> تراجع ↩️
            </Button>
          </CardContent>
        </Card>
      )}
      {/* Panel visibility settings */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-display">الأدوات</span>
        <PanelSettingsMenu hiddenPanels={editor.hiddenPanels} togglePanel={editor.togglePanel} />
      </div>

      {!editor.hiddenPanels.includes('autopilot') && (
        <div className="mb-4">
          <AutoPilotPanel
            running={editor.autoPilot.running}
            phase={editor.autoPilot.phase}
            phaseIndex={editor.autoPilot.phaseIndex}
            progress={editor.autoPilot.progress}
            logs={editor.autoPilot.logs}
            report={editor.autoPilot.report}
            mode={editor.autoPilot.mode}
            setMode={editor.autoPilot.setMode}
            freeProviderLabel={editor.autoPilot.freeProviderLabel}
            translationProvider={editor.translationProvider}
            setTranslationProvider={editor.setTranslationProvider}
            aiModel={editor.aiModel}
            setAiModel={editor.setAiModel}
            previewMode={editor.autoPilot.previewMode}
            setPreviewMode={editor.autoPilot.setPreviewMode}
            onRun={editor.autoPilot.run}
            onStop={editor.autoPilot.stop}
          />
        </div>
      )}

      {editor.translateProgress && (
        <Card className="mb-4 border-secondary/30 bg-secondary/5">
          <CardContent className="p-4 space-y-2">
            <div className="text-center font-display">{editor.translateProgress}</div>
            {/* Auto-correct progress bar */}
            {editor.autoCorrectProgress && (
              <div className="space-y-1.5">
                <Progress value={(editor.autoCorrectProgress.current / editor.autoCorrectProgress.total) * 100} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{editor.autoCorrectProgress.current} / {editor.autoCorrectProgress.total}</span>
                  <Button variant="destructive" size="sm" className="h-6 text-xs gap-1" onClick={editor.handleStopAutoCorrect}>
                    <StopCircle className="w-3 h-3" /> إيقاف
                  </Button>
                </div>
              </div>
            )}
            {/* Detect weak progress bar */}
            {editor.detectWeakProgress && (
              <div className="space-y-1.5">
                <Progress value={(editor.detectWeakProgress.current / editor.detectWeakProgress.total) * 100} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{editor.detectWeakProgress.current} / {editor.detectWeakProgress.total}</span>
                  <Button variant="destructive" size="sm" className="h-6 text-xs gap-1" onClick={editor.handleStopDetectWeak}>
                    <StopCircle className="w-3 h-3" /> إيقاف
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {editor.buildProgress && (
        <Card className="mb-4 border-secondary/30 bg-secondary/5 cursor-pointer" onClick={() => editor.buildStats && editor.setBuildStats(editor.buildStats)}>
          <CardContent className="p-4 font-display">
            <div className="text-center">{editor.buildProgress}
              {editor.buildStats && <span className="text-xs text-muted-foreground mr-2"> (اضغط للتفاصيل)</span>}
            </div>
            {editor.bdatFileStats && editor.bdatFileStats.length > 0 && (
              <BdatBuildReport stats={editor.bdatFileStats} />
            )}
            {!editor.building && (
              <div className="flex justify-center mt-3">
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); editor.dismissBuildProgress(); }} className="font-display">
                  ✓ موافق
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {editor.cloudStatus && (
        <Card className="mb-4 border-primary/30 bg-primary/5"><CardContent className="p-4 text-center font-display">{editor.cloudStatus}</CardContent></Card>
      )}
      {editor.tmStats && (
        <Card className="mb-4 border-secondary/30 bg-secondary/5">
          <CardContent className="p-4 text-center font-display">
            🧠 ذاكرة الترجمة: أُعيد استخدام {editor.tmStats.reused} ترجمة — أُرسل {editor.tmStats.sent} للذكاء الاصطناعي
          </CardContent>
        </Card>
      )}

      {/* AI Request Counter */}
      {(editor.aiRequestsToday > 0 || editor.aiRequestsMonth > 0) && (
        <Card className="mb-4 border-accent/30 bg-accent/5">
          <CardContent className="p-3 font-display">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-accent-foreground" />
                استهلاك الذكاء الاصطناعي
              </span>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>اليوم: <strong className="text-foreground">{editor.aiRequestsToday}</strong> طلب</span>
                <span>الشهر: <strong className="text-foreground">{editor.aiRequestsMonth}</strong> طلب</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Translation & Glossary Stats */}
      <TranslationStatsPanel
        stats={editor.glossarySessionStats}
        translating={editor.translating}
      />
    </>
  );
};

export default EditorProgressStatus;
