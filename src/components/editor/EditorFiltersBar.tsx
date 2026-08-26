import React from "react";
import { Button } from "@/components/ui/button";
import { Filter, Eye, Replace, Columns, RotateCcw, Wand2 } from "lucide-react";
import DebouncedInput from "@/components/editor/DebouncedInput";
import TableFilterTree from "@/components/editor/TableFilterTree";
import { type FilterStatus, type FilterTechnical } from "@/components/editor/types";
import RisenLineSplitTool from "@/components/editor/RisenLineSplitTool";
import GtaIvLineSplitTool from "@/components/editor/GtaIvLineSplitTool";
import type { useEditorState } from "@/hooks/useEditorState";

// تصنيف وتنقّل الجداول صار في `TableFilterTree` (شجرة قابلة للطي بدل قائمة مسطّحة).


type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "state"
  | "search"
  | "setSearch"
  | "isSearchPinned"
  | "handleTogglePin"
  | "filtersOpen"
  | "setFiltersOpen"
  | "filterStatus"
  | "setFilterStatus"
  | "filterFile"
  | "setFilterFile"
  | "filterTechnical"
  | "setFilterTechnical"
  | "filterTable"
  | "setFilterTable"
  | "filterColumn"
  | "setFilterColumn"
  | "msbtFiles"
  | "bdatTableNames"
  | "bdatTableCounts"
  | "bdatColumnNames"
  | "bdatColumnCounts"
  | "needsImproveCount"
  | "tagsCount"
  | "newlinesCount"
  | "multiLineCount"
  | "fuzzyCount"
  | "byteOverflowCount"
  | "deepDiagnosticCounts"
  | "quickReviewMode"
  | "setQuickReviewMode"
  | "setQuickReviewIndex"
  | "showFindReplace"
  | "setShowFindReplace"
  | "filteredEntries"
  | "updateTranslationsBatch"
  | "legacyCommaSplitEnabled"
  | "setPinnedKeys"
  | "setIsSearchPinned"
  | "setCurrentPage"
  | "resetWorkspace"
>;

interface EditorFiltersBarProps {
  editor: EditorSubset;
  isMobile: boolean;
  showDiffView: boolean;
  setShowDiffView: (v: boolean) => void;
  isRisen?: boolean;
  isGtaIv?: boolean;
}

const EditorFiltersBar: React.FC<EditorFiltersBarProps> = ({
  editor,
  isMobile,
  showDiffView,
  isRisen = false,
  isGtaIv = false,
  setShowDiffView,
}) => {
  /** حذف ترجمات كل المدخلات التي تنتمي لقائمة جداول معيّنة. */
  const handleDeleteScope = React.useCallback(async (tables: string[], label: string) => {
    if (!editor.state) return;
    const tableSet = new Set(tables);
    const updates: Record<string, string> = {};
    let translatedCount = 0;
    for (const e of editor.state.entries) {
      const m = e.label.match(/^(.+?)\[\d+\]\./);
      if (!m || !tableSet.has(m[1])) continue;
      const key = `${e.msbtFile}:${e.index}`;
      if ((editor.state.translations[key] || '').trim() !== '') {
        updates[key] = '';
        translatedCount++;
      }
    }
    if (translatedCount === 0) {
      const { toast } = await import('sonner');
      toast.info(`لا توجد ترجمات في «${label}»`);
      return;
    }
    const ok = window.confirm(
      `سيتم حذف ${translatedCount} ترجمة من «${label}» (${tables.length} جدول).\n\nهل أنت متأكد؟`
    );
    if (!ok) return;
    const count = editor.updateTranslationsBatch(updates);
    const { toast } = await import('sonner');
    toast.success(`تم حذف ${count} ترجمة من «${label}»`);
  }, [editor]);

  /** Pins an exact set of entry keys in the editor (same mechanism as the
   * Deep Diagnostic panel's "عرض في المحرر") so a tool's result is visible
   * immediately without a manual search. */
  const focusKeys = React.useCallback((keys: Set<string>) => {
    editor.setPinnedKeys(keys);
    editor.setIsSearchPinned(true);
    editor.setCurrentPage(0);
    setTimeout(() => {
      const list = document.querySelector('[data-entries-list]');
      if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, [editor]);

  return (
  <div className="mb-6 p-3 md:p-4 bg-card rounded border border-border">
    <div className="flex gap-2 md:gap-3 items-center">
      <DebouncedInput
        placeholder="ابحث عن نصوص..."
        value={editor.search}
        onChange={(val) => editor.setSearch(val)}
        className="flex-1 min-w-[120px] px-3 py-2 rounded bg-background border border-border font-body text-sm"
      />
      <Button
        variant={editor.isSearchPinned ? "default" : "outline"}
        size="sm"
        onClick={editor.handleTogglePin}
        className="font-body text-xs shrink-0"
        title={editor.isSearchPinned ? "إلغاء التثبيت" : "تثبيت نتائج البحث"}
      >
        📌
      </Button>
      {(isRisen || isGtaIv) && !isMobile && (
        <RisenLineSplitTool
          filteredEntries={editor.filteredEntries}
          translations={editor.state?.translations || {}}
          updateTranslationsBatch={editor.updateTranslationsBatch}
          onFilterByKeys={focusKeys}
          mode={isGtaIv ? "gtaiv" : "risen"}
        />
      )}
      {isGtaIv && !isMobile && (
        <GtaIvLineSplitTool
          filteredEntries={editor.filteredEntries}
          translations={editor.state?.translations || {}}
          updateTranslationsBatch={editor.updateTranslationsBatch}
          onFilterByKeys={focusKeys}
        />
      )}
      {isMobile ? (
        <Button variant={editor.filtersOpen ? "secondary" : "outline"} size="sm" onClick={() => editor.setFiltersOpen(!editor.filtersOpen)} className="font-body text-xs shrink-0">
          <Filter className="w-3 h-3" /> فلاتر
        </Button>
      ) : (
        <>
          <select value={editor.filterStatus} onChange={e => editor.setFilterStatus(e.target.value as FilterStatus)} className="px-3 py-2 rounded bg-background border border-border font-body text-sm">
            <option value="all">الكل</option>
            <option value="translated">✅ مترجم</option>
            <option value="untranslated">⬜ غير مترجم</option>
            <option value="problems">🚨 مشاكل</option>
            <option value="needs-improve">⚠️ يحتاج تحسين ({editor.needsImproveCount.total})</option>
            <option value="too-short">📏 قصير ({editor.needsImproveCount.tooShort})</option>
            <option value="too-long">📐 طويل ({editor.needsImproveCount.tooLong})</option>
            <option value="stuck-chars">🔤 ملتصق ({editor.needsImproveCount.stuck})</option>
            <option value="mixed-lang">🌐 مختلط ({editor.needsImproveCount.mixed})</option>
            <option value="has-tags">🔧 يحتوي رموز تقنية ({editor.tagsCount})</option>
            <option value="no-tags">📝 بدون رموز تقنية</option>
            {editor.newlinesCount > 0 && <option value="has-newlines">↵ يحتوي أسطر ({editor.newlinesCount})</option>}
            {editor.multiLineCount > 0 && <option value="translation-has-newline">✏️ ترجمات فيها \n ({editor.multiLineCount})</option>}
            {editor.fuzzyCount > 0 && <option value="fuzzy">🔍 مطابقة جزئية ({editor.fuzzyCount})</option>}
            {editor.byteOverflowCount > 0 && <option value="byte-overflow">⛔ تجاوز البايتات ({editor.byteOverflowCount})</option>}
            {editor.deepDiagnosticCounts.xenoNMissing > 0 && <option value="xeno-n-missing">↩️ [XENO:n] بدون \n ({editor.deepDiagnosticCounts.xenoNMissing})</option>}
            {editor.deepDiagnosticCounts.excessiveLines > 0 && <option value="excessive-lines">📐 أسطر زائدة ({editor.deepDiagnosticCounts.excessiveLines})</option>}
            {editor.deepDiagnosticCounts.byteBudget > 0 && <option value="byte-budget">💾 تجاوز ميزانية البايتات ({editor.deepDiagnosticCounts.byteBudget})</option>}
            {editor.deepDiagnosticCounts.newlineDiff > 0 && <option value="newline-diff">📄 فرق أسطر كبير ({editor.deepDiagnosticCounts.newlineDiff})</option>}
            {editor.deepDiagnosticCounts.identicalOriginal > 0 && <option value="identical-original">📋 ترجمة مطابقة للأصل ({editor.deepDiagnosticCounts.identicalOriginal})</option>}
            {isRisen && <option value="long-texts">📏 نصوص طويلة (35+)</option>}
          </select>
          <select value={editor.filterFile} onChange={e => editor.setFilterFile(e.target.value)} className="px-3 py-2 rounded bg-background border border-border font-body text-sm max-w-[200px]">
            <option value="all">كل الملفات</option>
            {editor.msbtFiles.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={editor.filterTechnical} onChange={e => editor.setFilterTechnical(e.target.value as FilterTechnical)} className="px-3 py-2 rounded bg-background border border-border font-body text-sm">
            <option value="all">الكل</option>
            <option value="exclude">بدون تقني</option>
            <option value="only">تقني فقط</option>
          </select>
          {editor.bdatTableNames.length > 0 && (
            <TableFilterTree
              value={editor.filterTable}
              onChange={(v) => { editor.setFilterTable(v); editor.setFilterColumn("all"); }}
              tables={editor.bdatTableNames}
              counts={editor.bdatTableCounts}
              totalEntries={editor.state?.entries.length ?? 0}
              onDeleteScope={handleDeleteScope}
            />
          )}
          {editor.bdatColumnNames.length > 0 && editor.filterTable !== "all" && (
            <select value={editor.filterColumn} onChange={e => editor.setFilterColumn(e.target.value)} className="px-3 py-2 rounded bg-background border border-border font-body text-sm max-w-[160px]">
              <option value="all">كل الأعمدة</option>
              {editor.bdatColumnNames.map(c => <option key={c} value={c}>{c} ({editor.bdatColumnCounts?.[c] || 0})</option>)}
            </select>
          )}
          <Button variant={editor.quickReviewMode ? "secondary" : "outline"} size="sm" onClick={() => { editor.setQuickReviewMode(!editor.quickReviewMode); editor.setQuickReviewIndex(0); }} className="font-body text-xs">
            <Eye className="w-3 h-3" /> مراجعة سريعة
          </Button>
          <Button variant={editor.showFindReplace ? "secondary" : "outline"} size="sm" onClick={() => editor.setShowFindReplace(!editor.showFindReplace)} className="font-body text-xs">
            <Replace className="w-3 h-3" /> بحث واستبدال
          </Button>
          <Button variant={showDiffView ? "secondary" : "outline"} size="sm" onClick={() => setShowDiffView(!showDiffView)} className="font-body text-xs">
            <Columns className="w-3 h-3" /> مقارنة
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void editor.resetWorkspace()} className="font-body text-xs" title="إعادة ضبط البحث والفلاتر المحفوظة">
            <RotateCcw className="w-3 h-3" /> إعادة ضبط
          </Button>
        </>
      )}
    </div>
    {isMobile && editor.filtersOpen && (
      <div className="mt-3 flex flex-col gap-2">
        {(isRisen || isGtaIv) && (
          <RisenLineSplitTool
            filteredEntries={editor.filteredEntries}
            translations={editor.state?.translations || {}}
            updateTranslationsBatch={editor.updateTranslationsBatch}
            onFilterByKeys={focusKeys}
            mode={isGtaIv ? "gtaiv" : "risen"}
          />
        )}
        {isGtaIv && (
          <GtaIvLineSplitTool
            filteredEntries={editor.filteredEntries}
            translations={editor.state?.translations || {}}
            updateTranslationsBatch={editor.updateTranslationsBatch}
            onFilterByKeys={focusKeys}
          />
        )}
        <select value={editor.filterStatus} onChange={e => editor.setFilterStatus(e.target.value as FilterStatus)} className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm">
          <option value="all">الكل</option>
          <option value="translated">✅ مترجم</option>
          <option value="untranslated">⬜ غير مترجم</option>
          <option value="problems">🚨 مشاكل</option>
          <option value="needs-improve">⚠️ يحتاج تحسين</option>
          <option value="stuck-chars">🔤 ملتصق</option>
          <option value="mixed-lang">🌐 مختلط</option>
          <option value="has-tags">🔧 رموز تقنية</option>
          <option value="no-tags">📝 بدون رموز تقنية</option>
          {editor.newlinesCount > 0 && <option value="has-newlines">↵ يحتوي أسطر ({editor.newlinesCount})</option>}
          {editor.multiLineCount > 0 && <option value="translation-has-newline">✏️ ترجمات فيها \n ({editor.multiLineCount})</option>}
          {editor.fuzzyCount > 0 && <option value="fuzzy">🔍 مطابقة جزئية ({editor.fuzzyCount})</option>}
          {editor.byteOverflowCount > 0 && <option value="byte-overflow">⛔ تجاوز البايتات ({editor.byteOverflowCount})</option>}
          {editor.deepDiagnosticCounts.xenoNMissing > 0 && <option value="xeno-n-missing">↩️ [XENO:n] بدون \n ({editor.deepDiagnosticCounts.xenoNMissing})</option>}
          {editor.deepDiagnosticCounts.excessiveLines > 0 && <option value="excessive-lines">📐 أسطر زائدة ({editor.deepDiagnosticCounts.excessiveLines})</option>}
          {editor.deepDiagnosticCounts.byteBudget > 0 && <option value="byte-budget">💾 تجاوز ميزانية ({editor.deepDiagnosticCounts.byteBudget})</option>}
          {editor.deepDiagnosticCounts.newlineDiff > 0 && <option value="newline-diff">📄 فرق أسطر ({editor.deepDiagnosticCounts.newlineDiff})</option>}
          {editor.deepDiagnosticCounts.identicalOriginal > 0 && <option value="identical-original">📋 مطابقة للأصل ({editor.deepDiagnosticCounts.identicalOriginal})</option>}
          {isRisen && <option value="long-texts">📏 نصوص طويلة (35+)</option>}
        </select>
        <select value={editor.filterFile} onChange={e => editor.setFilterFile(e.target.value)} className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm">
          <option value="all">كل الملفات</option>
          {editor.msbtFiles.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        {editor.bdatTableNames.length > 0 && (
          <TableFilterTree
            value={editor.filterTable}
            onChange={(v) => { editor.setFilterTable(v); editor.setFilterColumn("all"); }}
            tables={editor.bdatTableNames}
            counts={editor.bdatTableCounts}
            totalEntries={editor.state?.entries.length ?? 0}
            className="w-full max-w-none"
            onDeleteScope={handleDeleteScope}
          />
        )}
        {editor.bdatColumnNames.length > 0 && editor.filterTable !== "all" && (
          <select value={editor.filterColumn} onChange={e => editor.setFilterColumn(e.target.value)} className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm">
            <option value="all">كل الأعمدة</option>
            {editor.bdatColumnNames.map(c => <option key={c} value={c}>{c} ({editor.bdatColumnCounts?.[c] || 0})</option>)}
          </select>
        )}
        <Button variant="outline" size="sm" onClick={() => void editor.resetWorkspace()} className="font-body text-xs w-full">
          <RotateCcw className="w-3 h-3" /> إعادة ضبط مساحة العمل
        </Button>
      </div>
    )}

    {/* Quick-fix bar for deep diagnostic filters
        تُخفى خيارات تقسيم الأسطر بالفاصلة (excessive-lines / newline-diff) خلف legacyCommaSplitEnabled */}
    {((['xeno-n-missing', 'identical-original'] as readonly string[]).includes(editor.filterStatus) ||
      (editor.legacyCommaSplitEnabled && (['excessive-lines', 'newline-diff'] as readonly string[]).includes(editor.filterStatus))) && editor.filteredEntries.length > 0 && (
      <div className="mt-3 flex flex-wrap items-center gap-2 p-2 rounded bg-primary/5 border border-primary/20">
        <span className="text-xs font-display text-primary">
          🔧 {editor.filteredEntries.length} نص مطابق للفلتر
        </span>
        <Button
          variant="default"
          size="sm"
          className="font-body text-xs h-7"
          onClick={async () => {
            const updates: Record<string, string> = {};
            let removed = 0;
            for (const e of editor.filteredEntries) {
              const key = `${e.msbtFile}:${e.index}`;
              const trans = editor.state!.translations[key] || '';
              if (!trans) continue;
              if (editor.filterStatus === 'xeno-n-missing') {
                const fixed = trans.replace(/(\[XENO:n\s*\])(?!\n)/g, '$1\n');
                if (fixed !== trans) updates[key] = fixed;
              } else if (editor.filterStatus === 'identical-original') {
                updates[key] = '';
                removed++;
              } else if (editor.legacyCommaSplitEnabled && (editor.filterStatus === 'excessive-lines' || editor.filterStatus === 'newline-diff')) {
                try {
                  const { splitEvenlyByLines } = await import('@/lib/balance-lines');
                  const origLines = (e.original.match(/\n/g) || []).length + 1;
                  const fixed = splitEvenlyByLines(trans, origLines);
                  if (fixed !== trans) updates[key] = fixed;
                } catch { /* skip on failure */ }
              }
            }
            const count = editor.updateTranslationsBatch(updates);
            if (count > 0) {
              const { toast } = await import('@/hooks/use-toast');
              toast({
                title: '✅ تم الإصلاح',
                description: editor.filterStatus === 'identical-original'
                  ? `تم مسح ${removed} ترجمة مطابقة للأصل`
                  : `تم إصلاح ${count} نص`,
              });
            }
          }}
        >
          <Wand2 className="w-3 h-3 ml-1" />
          {editor.filterStatus === 'identical-original' ? 'مسح كل الترجمات المطابقة' :
           editor.filterStatus === 'xeno-n-missing' ? 'إضافة \\n بعد كل [XENO:n ]' :
           'إعادة موازنة الأسطر'}
        </Button>
        <Button variant="ghost" size="sm" className="font-body text-xs h-7" onClick={() => editor.setFilterStatus('all')}>
          إلغاء الفلتر
        </Button>
      </div>
    )}
  </div>
  );
};

export default EditorFiltersBar;
