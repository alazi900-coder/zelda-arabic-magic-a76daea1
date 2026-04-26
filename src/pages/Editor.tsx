import React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Loader2, Sparkles, Tag, LogIn, BookOpen, AlertTriangle, Eye, EyeOff, RotateCcw, CheckCircle2, Package } from "lucide-react";
import { getEdgeFunctionUrl, getSupabaseHeaders } from "@/lib/supabase-edge";
import {
  DEFAULT_OPENROUTER_MODEL,
  isOpenRouterModelId,
  getOpenRouterModels,
  getOpenRouterFetchedAt,
  refreshOpenRouterModels,
  type OpenRouterModelOption,
} from "@/lib/openrouter-models";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

import { useEditorState } from "@/hooks/useEditorState";
import { useTranslationMemory } from "@/hooks/useTranslationMemory";
import QualityStatsPanel from "@/components/editor/QualityStatsPanel";
import QuickReviewMode from "@/components/editor/QuickReviewMode";
import FindReplacePanel from "@/components/editor/FindReplacePanel";



import GlossaryStatsPanel from "@/components/editor/GlossaryStatsPanel";
import GlossaryCategoryFilter from "@/components/editor/GlossaryCategoryFilter";
import GlossaryDuplicatesPanel from "@/components/editor/GlossaryDuplicatesPanel";
import TranslationAIEnhancePanel from "@/components/editor/TranslationAIEnhancePanel";
import TranslationToolsPanel from "@/components/editor/TranslationToolsPanel";

import { ToolType } from "@/components/editor/ToolHelpDialog";
import TranslationProgressDashboard from "@/components/editor/TranslationProgressDashboard";
import ConsistencyCheckPanel from "@/components/editor/ConsistencyCheckPanel";
import { useEditorKeyboard } from "@/hooks/useEditorKeyboard";
import EditorDragOverlay from "@/components/editor/EditorDragOverlay";
import EditorRecoveryScreen from "@/components/editor/EditorRecoveryScreen";
import EditorEmptyState from "@/components/editor/EditorEmptyState";
import EditorDialogs from "@/components/editor/EditorDialogs";
import EditorHeroHeader from "@/components/editor/EditorHeroHeader";
import EditorEntryListSection from "@/components/editor/EditorEntryListSection";
import EditorFiltersBar from "@/components/editor/EditorFiltersBar";
import EditorGameSafetySection from "@/components/editor/EditorGameSafetySection";
import EditorResultsPanels from "@/components/editor/EditorResultsPanels";
import EditorLegacyPanels from "@/components/editor/EditorLegacyPanels";
import EditorProgressStatus from "@/components/editor/EditorProgressStatus";
import EditorBuildSection from "@/components/editor/EditorBuildSection";
import EditorProviderSelection from "@/components/editor/EditorProviderSelection";
import EditorActionsToolbar from "@/components/editor/EditorActionsToolbar";
import EditorMobileStickyBar from "@/components/editor/EditorMobileStickyBar";

const Editor = () => {
  const editor = useEditorState();
  const { findSimilar } = useTranslationMemory(editor.state);
  const isMobile = useIsMobile();
  const [showDiffView, setShowDiffView] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [showDiagnostic, setShowDiagnostic] = React.useState(false);
  const [showBuildSection, setShowBuildSection] = React.useState(false);
  const [showExportEnglishDialog, setShowExportEnglishDialog] = React.useState(false);
  const [compareEntry, setCompareEntry] = React.useState<import("@/components/editor/types").ExtractedEntry | null>(null);
  const [showClearConfirm, setShowClearConfirm] = React.useState<'all' | 'filtered' | null>(null);
  const [showTagRepair, setShowTagRepair] = React.useState(false);
  const [showArabicProcessConfirm, setShowArabicProcessConfirm] = React.useState(false);
  const [showFontTest, setShowFontTest] = React.useState(false);
  const [fontTestWord, setFontTestWord] = React.useState("");
  const [pageLocked, setPageLocked] = React.useState(false);
  const [showToolHelp, setShowToolHelp] = React.useState<ToolType>(null);
  const [drBuilding, setDrBuilding] = React.useState(false);
  const [sourceGame, setSourceGame] = React.useState<string | null>(null);
  const [testConnStatus, setTestConnStatus] = React.useState<Record<string, 'idle' | 'testing' | 'ok' | 'error'>>({});
  const [testConnMsg, setTestConnMsg] = React.useState<Record<string, string>>({});

  // Dynamic OpenRouter free models list (refreshable)
  const [orModels, setOrModels] = React.useState<OpenRouterModelOption[]>(() => getOpenRouterModels());
  const [orModelsFetchedAt, setOrModelsFetchedAt] = React.useState<string | null>(() => getOpenRouterFetchedAt());
  const [orModelsRefreshing, setOrModelsRefreshing] = React.useState(false);

  const handleRefreshOrModels = React.useCallback(async () => {
    setOrModelsRefreshing(true);
    const { toast } = await import('@/hooks/use-toast');
    try {
      const fresh = await refreshOpenRouterModels();
      setOrModels(fresh);
      setOrModelsFetchedAt(new Date().toISOString());
      toast({
        title: '✅ تم تحديث القائمة',
        description: `تم جلب ${fresh.length} موديلاً مجانياً متاحاً حالياً`,
      });
      // If currently selected model is no longer in the list, fall back to default
      if (editor.aiModel && !fresh.some((m) => m.id === editor.aiModel)) {
        editor.setAiModel(fresh[0]?.id || DEFAULT_OPENROUTER_MODEL);
      }
    } catch (e) {
      toast({
        title: '⚠️ فشل تحديث القائمة',
        description: e instanceof Error ? e.message : 'تحقق من الاتصال بالإنترنت',
        variant: 'destructive',
      });
    } finally {
      setOrModelsRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.aiModel]);


  // Detect source game on mount
  React.useEffect(() => {
    import("@/lib/idb-storage").then(({ idbGet }) => {
      idbGet<string>("editor-source-game").then(g => { if (g) setSourceGame(g); });
    });
  }, []);

  const isDanganronpa = sourceGame?.startsWith("danganronpa");

  const handleTestConnection = React.useCallback(async (provider: string) => {
    setTestConnStatus(prev => ({ ...prev, [provider]: 'testing' }));
    setTestConnMsg(prev => ({ ...prev, [provider]: '' }));
    try {
      const providerApiKey =
        provider === 'deepseek' ? editor.userDeepSeekKey :
        provider === 'groq' ? editor.userGroqKey :
        provider === 'openrouter' ? editor.userOpenRouterKey : undefined;
      const aiModel =
        provider === 'openrouter'
          ? (isOpenRouterModelId(editor.aiModel) ? editor.aiModel : DEFAULT_OPENROUTER_MODEL)
          : editor.aiModel;
      const response = await fetch(getEdgeFunctionUrl("translate-entries"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
        body: JSON.stringify({
          entries: [{ key: 'test:0', original: 'Hello' }],
          provider,
          userApiKey: provider === 'gemini' ? (editor.userGeminiKey || undefined) : undefined,
          providerApiKey: providerApiKey || undefined,
          aiModel,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setTestConnStatus(prev => ({ ...prev, [provider]: 'error' }));
        setTestConnMsg(prev => ({ ...prev, [provider]: data.error || `خطأ ${response.status}` }));
      } else {
        const translation = Object.values(data.translations || {})[0] as string | undefined;
        setTestConnStatus(prev => ({ ...prev, [provider]: 'ok' }));
        setTestConnMsg(prev => ({ ...prev, [provider]: translation ? `"${translation}"` : 'المفتاح صحيح' }));
      }
    } catch (err) {
      setTestConnStatus(prev => ({ ...prev, [provider]: 'error' }));
      setTestConnMsg(prev => ({ ...prev, [provider]: err instanceof Error ? err.message : 'فشل الاتصال' }));
    }
  }, [editor.userGeminiKey, editor.userDeepSeekKey, editor.userGroqKey, editor.userOpenRouterKey, editor.aiModel]);

  const isPokemon = React.useMemo(() => {
    if (isDanganronpa) return false;
    if (!editor.state?.entries?.length) return false;
    return !editor.state.entries[0].msbtFile.startsWith("bdat-bin:");
  }, [editor.state?.entries, isDanganronpa]);
  const gameType = isPokemon ? "pokemon" : isDanganronpa ? "danganronpa" : "xenoblade";
  const processPath = isDanganronpa ? "/danganronpa/classic" : isPokemon ? "/pokemon/process" : "/process";

  // Keyboard shortcuts
  useEditorKeyboard({
    currentPage: editor.currentPage,
    totalPages: editor.totalPages,
    setCurrentPage: editor.setCurrentPage,
    showFindReplace: editor.showFindReplace,
    setShowFindReplace: editor.setShowFindReplace,
    quickReviewMode: editor.quickReviewMode,
    setQuickReviewMode: editor.setQuickReviewMode,
    quickReviewIndex: editor.quickReviewIndex,
    setQuickReviewIndex: editor.setQuickReviewIndex,
    filteredCount: editor.filteredEntries.length,
    hasState: !!editor.state,
  });

  // Prevent accidental navigation when page is locked (back button + tab close)
  React.useEffect(() => {
    if (!pageLocked) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    // Push a dummy history state so back button triggers popstate instead of leaving
    window.history.pushState({ locked: true }, '');
    const handlePopState = () => {
      // Re-push state to block back navigation
      window.history.pushState({ locked: true }, '');
      // Show toast notification
      import('@/hooks/use-toast').then(({ toast }) => {
        toast({
          title: "🔒 الصفحة مقفلة",
          description: "قم بإيقاف القفل أولاً للخروج من المحرر",
          variant: "destructive",
        });
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [pageLocked]);

  // Drag & Drop handlers
  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = React.useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer) {
      await editor.handleDropImport(e.dataTransfer);
    }
  }, [editor.handleDropImport]);
  // حساب عدد النصوص العربية التي تحتاج معالجة (Reshaping/BiDi)
  const unprocessedArabicCount = React.useMemo(() => {
    if (!editor.state) return 0;
    let count = 0;
    for (const [key, value] of Object.entries(editor.state.translations)) {
      if (!value?.trim()) continue;
      // يحتوي حروف عربية عادية (Unicode blocks) لكن بدون Presentation Forms
      const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(value);
      const hasForms = /[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(value);
      if (hasArabic && !hasForms) count++;
    }
    return count;
  }, [editor.state?.translations]);

  // حساب عدد النصوص غير المترجمة (يحترم الفلتر النشط)
  const untranslatedCount = React.useMemo(() => {
    if (!editor.state) return 0;
    return editor.getUntranslatedCount?.() ?? 0;
  }, [editor.state, editor.filteredEntries, editor.isFilterActive, editor.getUntranslatedCount]);

  const skippedTechnicalCount = React.useMemo(() => {
    return editor.getSkippedTechnicalCount?.() ?? 0;
  }, [editor.state, editor.filteredEntries, editor.isFilterActive]);

  // Show recovery dialog if saved session exists
  if (editor.pendingRecovery) {
    return (
      <EditorRecoveryScreen
        translationCount={editor.pendingRecovery.translationCount}
        entryCount={editor.pendingRecovery.entryCount}
        onRecover={editor.handleRecoverSession}
        onStartFresh={editor.handleStartFresh}
      />
    );
  }

  if (!editor.state) {
    return <EditorEmptyState processPath={processPath} onLoadDemo={editor.loadDemoBdatData} />;
  }

  return (
    <TooltipProvider>
      <div
        className="min-h-screen flex flex-col relative overflow-x-hidden max-w-[100vw]"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drop overlay */}
        <EditorDragOverlay visible={isDragging} />

        {/* Hero header */}
        <EditorHeroHeader
          processPath={processPath}
          pageLocked={pageLocked}
          setPageLocked={setPageLocked}
        />

        <div className="flex-1 py-4 md:py-6 px-3 md:px-4">
        <div className="max-w-6xl mx-auto">

          {/* Mobile sticky bar — quick access while scrolling */}
          <EditorMobileStickyBar
            editor={editor}
            processPath={processPath}
            pageLocked={pageLocked}
            setShowBuildSection={setShowBuildSection}
          />

          {/* Stats Cards */}
          <div className="flex flex-wrap items-center gap-3 md:gap-4 mb-6">
            {/* BDAT file count */}
            <Card className="flex-1 min-w-[100px]">
              <CardContent className="flex items-center gap-2 md:gap-3 p-3 md:p-4">
                <Package className="w-4 h-4 md:w-5 md:h-5 text-accent" />
                <div>
                  <p className="text-base md:text-lg font-display font-bold">
                    {new Set((editor.state?.entries || []).map(e => { const p = e.msbtFile.split(':'); return p[0] === 'bdat-bin' ? p[1] : e.msbtFile; })).size}
                  </p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">ملفات BDAT</p>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[100px]">
              <CardContent className="flex items-center gap-2 md:gap-3 p-3 md:p-4">
                <FileText className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                <div>
                  <p className="text-base md:text-lg font-display font-bold">{editor.state.entries.length}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">إجمالي النصوص</p>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[100px]">
              <CardContent className="flex items-center gap-2 md:gap-3 p-3 md:p-4">
                <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-secondary" />
                <div>
                  <p className="text-base md:text-lg font-display font-bold">{editor.translatedCount}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">مترجم</p>
                </div>
              </CardContent>
            </Card>
            {!isMobile && (
              <>
                <Card className="flex-1 min-w-[140px]">
                  <CardContent className="flex items-center gap-3 p-4">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    <div>
                      <p className="text-lg font-display font-bold">{editor.qualityStats.total}</p>
                      <p className="text-xs text-muted-foreground">مشاكل جودة</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => editor.setShowQualityStats(!editor.showQualityStats)} className="ml-auto text-xs">
                      {editor.showQualityStats ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </CardContent>
                </Card>
                <Card className="flex-1 min-w-[140px]">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Tag className="w-5 h-5 text-accent" />
                    <div>
                      <p className="text-lg font-display font-bold">{editor.state.protectedEntries?.size || 0} / {editor.state.entries.length}</p>
                      <p className="text-xs text-muted-foreground">محمي من العكس</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}


            {editor.translating ? (
              <Button size={isMobile ? "default" : "lg"} variant="destructive" onClick={editor.handleStopTranslate} className="font-display font-bold px-4 md:px-6">
                <Loader2 className="w-4 h-4 animate-spin" /> إيقاف ⏹️
              </Button>
            ) : (
              <>
                <Button size={isMobile ? "default" : "lg"} variant="default" onClick={editor.handleAutoTranslate} disabled={editor.translating} className="font-display font-bold px-4 md:px-6">
                  <Sparkles className="w-4 h-4" /> ترجمة تلقائية 🤖
                </Button>
                {editor.failedEntries && editor.failedEntries.length > 0 && (
                  <Button size={isMobile ? "default" : "lg"} variant="outline" onClick={editor.handleRetryFailed} disabled={editor.translating} className="font-display font-bold px-4 md:px-6 border-yellow-500 text-yellow-600 hover:bg-yellow-50">
                    ⚠️ إعادة محاولة {editor.failedEntries.length} نص فاشل
                  </Button>
                )}
                <Button size={isMobile ? "default" : "lg"} variant="secondary" onClick={editor.handleTranslateFromGlossaryOnly} disabled={editor.translating} className="font-display font-bold px-4 md:px-6">
                  <BookOpen className="w-4 h-4" /> الترجمة من القاموس 📖
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size={isMobile ? "default" : "lg"} variant="secondary" disabled={editor.translating} className="font-display font-bold px-4 md:px-6">
                      <FileText className="w-4 h-4" /> ترجمة الصفحة 📄
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    <DropdownMenuItem onClick={() => editor.handleTranslatePage(false, false)}>
                      <Sparkles className="w-4 h-4" /> ترجمة بالذكاء الاصطناعي 🤖
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => editor.handleTranslatePage(false, true)}>
                      <BookOpen className="w-4 h-4" /> ترجمة بالذاكرة فقط 📖
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">جميع الصفحات</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => editor.handleTranslateAllPages(false)}>
                      <Sparkles className="w-4 h-4" /> ترجمة جميع الصفحات بالذكاء 🤖📄
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => editor.handleTranslateAllPages(true)}>
                      <BookOpen className="w-4 h-4" /> ترجمة جميع الصفحات بالذاكرة 📖📄
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size={isMobile ? "default" : "lg"}
                  variant="default"
                  onClick={() => {
                    // Force-switch to Lovable AI (gemini provider without personal key)
                    editor.setTranslationProvider('gemini');
                    // Start full project translation
                    setTimeout(() => editor.handleTranslateAllPages(false), 50);
                  }}
                  disabled={editor.translating}
                  className="font-display font-bold px-4 md:px-6 bg-gradient-to-r from-primary via-accent to-secondary text-primary-foreground hover:opacity-90 shadow-lg"
                  title="ترجمة كامل المشروع مجاناً عبر Lovable AI (Gemini) بدون أي مفتاح API"
                >
                  <Sparkles className="w-4 h-4" /> ترجمة شاملة مجانية 🆓✨
                </Button>
              </>
            )}
            <Button size={isMobile ? "default" : "lg"} variant="outline" onClick={() => editor.setShowRetranslateConfirm(true)} disabled={editor.translating} className="font-display font-bold px-4 md:px-6 border-accent/30 text-accent hover:text-accent">
              <RotateCcw className="w-4 h-4" /> إعادة ترجمة الصفحة 🔄
            </Button>
            {(editor.hasStoredOriginals || editor.originalsDetectedAsPreviousBuild) && (
              <Button size={isMobile ? "default" : "lg"} variant="outline" onClick={editor.handleRestoreOriginals} className="font-display font-bold px-4 md:px-6 border-secondary/30 text-secondary hover:text-secondary">
                <RotateCcw className="w-4 h-4" /> استعادة الأصل الإنجليزي 🔙
              </Button>
            )}
          </div>

          {/* Warning: Previous build detected */}
          {editor.originalsDetectedAsPreviousBuild && (
            <Card className="mb-4 border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 text-center font-display text-sm">
                <AlertTriangle className="w-4 h-4 inline-block ml-1 text-destructive" />
                تم اكتشاف نصوص من ملف مبني سابقاً — النصوص "الأصلية" تحتوي عربية مُشكَّلة بدلاً من الإنجليزية
                {editor.hasStoredOriginals && (
                  <span className="text-secondary mr-2"> • اضغط "استعادة الأصل الإنجليزي" لإصلاحها</span>
                )}
              </CardContent>
            </Card>
          )}

          <EditorProviderSelection
            editor={editor}
            testConnStatus={testConnStatus}
            testConnMsg={testConnMsg}
            handleTestConnection={handleTestConnection}
            orModels={orModels}
            orModelsRefreshing={orModelsRefreshing}
            orModelsFetchedAt={orModelsFetchedAt}
            handleRefreshOrModels={handleRefreshOrModels}
          />

          <EditorProgressStatus
            editor={editor}
            isDanganronpa={!!isDanganronpa}
            setShowTagRepair={setShowTagRepair}
          />



          <EditorGameSafetySection editor={editor} />

          {/* Translation Progress Dashboard */}
          {!editor.hiddenPanels.includes('progress') && (
            <TranslationProgressDashboard
              state={editor.state}
              qualityStats={editor.qualityStats}
              glossarySessionStats={editor.glossarySessionStats}
              aiRequestsToday={editor.aiRequestsToday}
              aiRequestsMonth={editor.aiRequestsMonth}
            />
          )}

          {/* Cross-file Consistency Check */}
          {!editor.hiddenPanels.includes('consistency') && (
            <ConsistencyCheckPanel
              state={editor.state}
              updateTranslation={editor.updateTranslation}
            />
          )}

          {/* Translation Tools */}
          {!editor.hiddenPanels.includes('tools') && (
            <TranslationToolsPanel
              state={editor.state}
              currentEntry={null}
              currentTranslation=""
              onApplyTranslation={(key, val) => editor.updateTranslation(key, val)}
            />
          )}

          {/* AI Translation Enhancement */}
          {!editor.hiddenPanels.includes('ai-enhance') && (
            <TranslationAIEnhancePanel
              entries={editor.state?.entries || []}
              translations={editor.state?.translations || {}}
              onApplySuggestion={(key, newText) => editor.updateTranslation(key, newText)}
              glossary={editor.activeGlossary}
            />
          )}

          <EditorResultsPanels editor={editor} />

          <EditorLegacyPanels editor={editor} showTagRepair={showTagRepair} setShowTagRepair={setShowTagRepair} />

          {!editor.user && (
            <Card className="mb-4 border-primary/30 bg-primary/5">
              <CardContent className="flex items-center gap-3 p-4"><LogIn className="w-4 h-4" /> سجّل دخولك للمزامنة</CardContent>
            </Card>
          )}

          <EditorFiltersBar
            editor={editor}
            isMobile={isMobile}
            showDiffView={showDiffView}
            setShowDiffView={setShowDiffView}
          />

          {/* Needs Improvement Badges */}
          {(editor.needsImproveCount.total > 0 || editor.byteOverflowCount > 0) && (
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs font-display text-muted-foreground">⚠️ تحتاج تحسين:</span>
              {editor.needsImproveCount.tooShort > 0 && (
                <Button variant="outline" size="sm" onClick={() => editor.setFilterStatus("too-short")} className="text-xs h-6 px-2 border-secondary/30 text-secondary">
                  📏 قصيرة: {editor.needsImproveCount.tooShort}
                </Button>
              )}
              {editor.needsImproveCount.tooLong > 0 && (
                <Button variant="outline" size="sm" onClick={() => editor.setFilterStatus("too-long")} className="text-xs h-6 px-2 border-destructive/30 text-destructive">
                  📐 طويلة: {editor.needsImproveCount.tooLong}
                </Button>
              )}
              {editor.needsImproveCount.stuck > 0 && (
                <Button variant="outline" size="sm" onClick={() => editor.setFilterStatus("stuck-chars")} className="text-xs h-6 px-2 border-secondary/30 text-secondary">
                  🔤 ملتصقة: {editor.needsImproveCount.stuck}
                </Button>
              )}
              {editor.needsImproveCount.mixed > 0 && (
                <Button variant="outline" size="sm" onClick={() => editor.setFilterStatus("mixed-lang")} className="text-xs h-6 px-2 border-primary/30 text-primary">
                  🌐 مختلطة: {editor.needsImproveCount.mixed}
                </Button>
              )}
              {editor.byteOverflowCount > 0 && (
                <Button
                  variant={editor.filterStatus === "byte-overflow" ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => editor.setFilterStatus(editor.filterStatus === "byte-overflow" ? "all" : "byte-overflow")}
                  className="text-xs h-6 px-2 border-destructive/50 text-destructive font-bold"
                >
                  ⛔ تجاوز البايتات: {editor.byteOverflowCount}
                </Button>
              )}
            </div>
          )}

          {/* Fuzzy Match Batch Actions */}
          {editor.fuzzyCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
              <span className="text-xs font-display text-amber-600">🔍 {editor.fuzzyCount} ترجمة بمطابقة جزئية:</span>
              <Button variant="outline" size="sm" onClick={() => editor.setFilterStatus("fuzzy")} className="text-xs h-6 px-2 border-amber-500/30 text-amber-600">
                عرض الكل
              </Button>
              <Button variant="outline" size="sm" onClick={editor.handleAcceptAllFuzzy} className="text-xs h-6 px-2 border-emerald-500/30 text-emerald-600">
                ✅ قبول الكل
              </Button>
              <Button variant="outline" size="sm" onClick={editor.handleRejectAllFuzzy} className="text-xs h-6 px-2 border-destructive/30 text-destructive">
                ❌ رفض الكل
              </Button>
            </div>
          )}

          {editor.glossaryTermCount > 0 && (() => {
            const health = editor.getGlossaryHealth();
            return (
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/15">
                  <BookOpen className="w-3.5 h-3.5 text-primary/70" />
                  <span className="text-xs text-primary/80 font-body">
                    📖 القاموس: <strong>{editor.glossaryTermCount}</strong> مصطلح
                  </span>
                  <Button
                    variant={editor.glossaryEnabled ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => editor.setGlossaryEnabled(!editor.glossaryEnabled)}
                    className="mr-auto h-6 px-2 text-xs font-body"
                  >
                    {editor.glossaryEnabled ? (
                      <><Eye className="w-3 h-3" /> مفعّل</>
                    ) : (
                      <><EyeOff className="w-3 h-3" /> معطّل</>
                    )}
                  </Button>
                </div>
                {health.totalIssues > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="text-xs text-amber-600 font-body flex-1">
                      ⚠️ {health.totalIssues} مشكلة:
                      {health.duplicates > 0 && ` ${health.duplicates} مكرر`}
                      {health.emptyValues > 0 && ` ${health.emptyValues} فارغ`}
                      {health.reversedEntries > 0 && ` ${health.reversedEntries} معكوس`}
                      {health.singleCharKeys > 0 && ` ${health.singleCharKeys} رمز`}
                    </span>
                    <Button variant="outline" size="sm" onClick={editor.handleFixGlossaryIssues} className="h-6 px-2 text-xs font-body">
                      🔧 إصلاح
                    </Button>
                  </div>
                )}
                {editor.glossaryDuplicates?.length > 0 && (
                  <GlossaryDuplicatesPanel
                    duplicates={editor.glossaryDuplicates}
                    onFix={editor.handleFixGlossaryDuplicate}
                    onFixAll={editor.handleFixAllGlossaryDuplicates}
                    onClose={editor.handleCloseGlossaryDuplicates}
                  />
                )}
                <GlossaryStatsPanel glossaryText={editor.activeGlossary} />
                <GlossaryCategoryFilter 
                  glossaryText={editor.activeGlossary} 
                  onCopyFiltered={(text) => navigator.clipboard.writeText(text)}
                />
              </div>
            );
          })()}

          <EditorActionsToolbar
            editor={editor}
            isMobile={isMobile}
            untranslatedCount={untranslatedCount}
            skippedTechnicalCount={skippedTechnicalCount}
            setShowExportEnglishDialog={setShowExportEnglishDialog}
            setShowClearConfirm={setShowClearConfirm}
            setShowToolHelp={setShowToolHelp}
            setShowFontTest={setShowFontTest}
            setFontTestWord={setFontTestWord}
            setShowArabicProcessConfirm={setShowArabicProcessConfirm}
          />

          <EditorBuildSection
            editor={editor}
            isDanganronpa={!!isDanganronpa}
            unprocessedArabicCount={unprocessedArabicCount}
            showBuildSection={showBuildSection}
            setShowBuildSection={setShowBuildSection}
            setShowArabicProcessConfirm={setShowArabicProcessConfirm}
            setShowDiagnostic={setShowDiagnostic}
            drBuilding={drBuilding}
            setDrBuilding={setDrBuilding}
          />

          {/* Quality Stats Panel */}
          {editor.showQualityStats && (
            <QualityStatsPanel
              qualityStats={editor.qualityStats}
              needsImproveCount={editor.needsImproveCount}
              translatedCount={editor.translatedCount}
              setFilterStatus={editor.setFilterStatus}
              setShowQualityStats={editor.setShowQualityStats}
              onFixDamagedTags={() => setShowTagRepair(true)}
              onFilterMissingTags={() => editor.setFilterStatus(editor.filterStatus === "missing-tags" ? "all" : "missing-tags")}
              onFixMissingTags={() => editor.handleLocalFixSelectedTags([...editor.qualityStats.missingTagKeys])}
            />
          )}

          {/* Quick Review Mode */}
          {editor.quickReviewMode && (
            <QuickReviewMode
              filteredEntries={editor.filteredEntries}
              quickReviewIndex={editor.quickReviewIndex}
              setQuickReviewIndex={editor.setQuickReviewIndex}
              setQuickReviewMode={editor.setQuickReviewMode}
              translations={editor.state.translations}
              qualityProblemKeys={editor.qualityStats.problemKeys}
              updateTranslation={editor.updateTranslation}
            />
          )}

          {/* Find & Replace */}
          {editor.showFindReplace && editor.state && (
            <FindReplacePanel
              entries={editor.state.entries}
              translations={editor.state.translations}
              onReplace={editor.handleBulkReplace}
              onClose={() => editor.setShowFindReplace(false)}
            />
          )}

          <EditorEntryListSection
            editor={editor}
            isMobile={isMobile}
            showDiffView={showDiffView}
            setShowDiffView={setShowDiffView}
            setCompareEntry={setCompareEntry}
            findSimilar={findSimilar}
          />
        </div>
        </div>

        <EditorDialogs
          editor={editor}
          showDiagnostic={showDiagnostic}
          setShowDiagnostic={setShowDiagnostic}
          compareEntry={compareEntry}
          setCompareEntry={setCompareEntry}
          showExportEnglishDialog={showExportEnglishDialog}
          setShowExportEnglishDialog={setShowExportEnglishDialog}
          showClearConfirm={showClearConfirm}
          setShowClearConfirm={setShowClearConfirm}
          showArabicProcessConfirm={showArabicProcessConfirm}
          setShowArabicProcessConfirm={setShowArabicProcessConfirm}
          showFontTest={showFontTest}
          setShowFontTest={setShowFontTest}
          fontTestWord={fontTestWord}
          setFontTestWord={setFontTestWord}
          showToolHelp={showToolHelp}
          setShowToolHelp={setShowToolHelp}
          untranslatedCount={untranslatedCount}
        />
      </div>
    </TooltipProvider>
  );
};

export default Editor;
