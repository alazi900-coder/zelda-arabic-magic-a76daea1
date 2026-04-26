import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import DeepDiagnosticPanel from "@/components/editor/DeepDiagnosticPanel";
import QualityChecksPanel from "@/components/editor/QualityChecksPanel";
import CleanupToolsPanel from "@/components/editor/CleanupToolsPanel";
import LineBalancePanel from "@/components/editor/LineBalancePanel";
import type { useEditorState } from "@/hooks/useEditorState";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "state"
  | "updateTranslation"
  | "updateTranslationsBatch"
  | "handleLocalFixSelectedTags"
  | "setFilterStatus"
  | "setSearch"
  | "setCurrentPage"
  | "activeGlossary"
>;

interface EditorGameSafetySectionProps {
  editor: EditorSubset;
}

const EditorGameSafetySection: React.FC<EditorGameSafetySectionProps> = ({ editor }) => {
  if (!editor.state) return null;
  const state = editor.state;
  return (
  <Card className="border-2 border-destructive/40 bg-destructive/5 shadow-lg">
    <CardContent className="p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">🛡️</span>
        <div>
          <h2 className="font-display font-bold text-base text-destructive">سلامة اللعبة</h2>
          <p className="text-xs text-muted-foreground">أدوات كشف وإصلاح المشاكل التي تسبب تجمّد أو انهيار اللعبة</p>
        </div>
      </div>

      {/* message.conf warning */}
      <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-xs space-y-1" dir="rtl">
        <p className="font-bold text-yellow-400">⚠️ إعدادات مود السويتش (message.conf)</p>
        <p className="text-muted-foreground">
          إذا استمر التهنيج رغم إصلاح النصوص، قد يكون السبب حدود ذاكرة المحرك. عدّل ملف <code className="bg-muted/40 px-1 rounded">message.conf</code> في مود السويتش:
        </p>
        <pre className="bg-muted/20 p-2 rounded font-mono text-[11px]">TelegraphMax = 8192{"\n"}MessageTypeMax = 1024</pre>
      </div>

      <DeepDiagnosticPanel
        state={state}
        onApplyFix={(key, fix) => editor.updateTranslation(key, fix)}
        onApplyFixesBatch={(updates) => editor.updateTranslationsBatch(updates)}
        onFixSelectedLocally={(keys) => editor.handleLocalFixSelectedTags(keys)}
        onFilterByKeys={() => {
          editor.setFilterStatus('problems');
        }}
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
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background', 'animate-pulse');
                  setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background', 'animate-pulse'), 2500);
                }
              }, 100);
            }
          }, 50);
        }}
      />

      <QualityChecksPanel
        state={state}
        onApplyFix={(key, fix) => editor.updateTranslation(key, fix)}
        onFilterByKeys={() => {
          editor.setFilterStatus('problems');
        }}
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
        glossary={editor.activeGlossary}
      />

      {/* Cleanup Tools */}
      <CleanupToolsPanel
        state={state}
        onApplyFix={(key, fix) => editor.updateTranslation(key, fix)}
        onApplyAll={(fixes) => {
          for (const f of fixes) editor.updateTranslation(f.key, f.value);
        }}
      />

      {/* Line Balance Tool */}
      <LineBalancePanel
        state={state}
        onApplyFix={(key, fix) => editor.updateTranslation(key, fix)}
        onApplyAll={(fixes) => {
          for (const f of fixes) editor.updateTranslation(f.key, f.value);
        }}
      />
    </CardContent>
  </Card>
  );
};

export default EditorGameSafetySection;
