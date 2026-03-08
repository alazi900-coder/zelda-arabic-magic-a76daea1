import React from "react";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  ArrowRight, Download, FileText, Loader2, Filter, Sparkles, Save, Tag,
  Upload, FileDown, Cloud, CloudUpload, LogIn, BookOpen, AlertTriangle,
  Eye, EyeOff, RotateCcw, CheckCircle2, ShieldCheck, ChevronLeft, ChevronRight,
  BarChart3, Menu, MoreVertical, Replace, Columns, Key, Type, Trash2, Package, Wand2,
  Lock, Unlock, Rows3,
} from "lucide-react";
import heroBg from "@/assets/xc3-hero-bg.jpg";
import { useIsMobile } from "@/hooks/use-mobile";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

import { useEditorState } from "@/hooks/useEditorState";
import { useTranslationMemory } from "@/hooks/useTranslationMemory";
import { PAGE_SIZE, isTechnicalText } from "@/components/editor/types";
import DebouncedInput from "@/components/editor/DebouncedInput";
import CategoryProgress from "@/components/editor/CategoryProgress";
import QualityStatsPanel from "@/components/editor/QualityStatsPanel";
import EntryCard from "@/components/editor/EntryCard";
import ReviewPanel from "@/components/editor/ReviewPanel";
import QuickReviewMode from "@/components/editor/QuickReviewMode";
import PaginationControls from "@/components/editor/PaginationControls";
import FindReplacePanel from "@/components/editor/FindReplacePanel";
import DiffView from "@/components/editor/DiffView";
import BuildStatsDialog from "@/components/editor/BuildStatsDialog";
import BuildConfirmDialog from "@/components/editor/BuildConfirmDialog";
import ConsistencyResultsPanel from "@/components/editor/ConsistencyResultsPanel";
import BdatBuildReport from "@/components/editor/BdatBuildReport";
import IntegrityCheckDialog from "@/components/editor/IntegrityCheckDialog";
import PreBuildDiagnostic from "@/components/editor/PreBuildDiagnostic";
import CompareEnginesDialog from "@/components/editor/CompareEnginesDialog";
import SentenceSplitPanel from "@/components/editor/SentenceSplitPanel";
import NewlineCleanPanel from "@/components/editor/NewlineCleanPanel";
import DiacriticsCleanPanel from "@/components/editor/DiacriticsCleanPanel";
import DuplicateAlefCleanPanel from "@/components/editor/DuplicateAlefCleanPanel";
import MirrorCharsCleanPanel from "@/components/editor/MirrorCharsCleanPanel";
import MergeToBundledPanel from "@/components/editor/MergeToBundledPanel";
import SentenceOrderPanel from "@/components/editor/SentenceOrderPanel";
import ArabicTextFixPanel from "@/components/editor/ArabicTextFixPanel";
import ExportEnglishDialog from "@/components/editor/ExportEnglishDialog";
import GlossaryStatsPanel from "@/components/editor/GlossaryStatsPanel";
import TranslationStatsPanel from "@/components/editor/TranslationStatsPanel";
import ImportConflictDialog from "@/components/editor/ImportConflictDialog";
import TagRepairPanel from "@/components/editor/TagRepairPanel";
import TagBracketFixPanel from "@/components/editor/TagBracketFixPanel";
import NewlineSplitPanel from "@/components/editor/NewlineSplitPanel";
import PageTranslationCompare from "@/components/editor/PageTranslationCompare";
import QualityChecksPanel from "@/components/editor/QualityChecksPanel";
import CleanupToolsPanel from "@/components/editor/CleanupToolsPanel";
import LineBalancePanel from "@/components/editor/LineBalancePanel";
import TranslationToolsPanel from "@/components/editor/TranslationToolsPanel";
import MismatchDetectorPanel from "@/components/editor/MismatchDetectorPanel";
import GlossaryMergePreviewDialog from "@/components/editor/GlossaryMergePreviewDialog";
import SmartReviewPanel from "@/components/editor/SmartReviewPanel";
import GlossaryCompliancePanel from "@/components/editor/GlossaryCompliancePanel";
import GlossaryTranslationPreview from "@/components/editor/GlossaryTranslationPreview";

const Editor = () => {
  const editor = useEditorState();
  const { findSimilar } = useTranslationMemory(editor.state);
  const isMobile = useIsMobile();
  const [showDiffView, setShowDiffView] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [showDiagnostic, setShowDiagnostic] = React.useState(false);
  const [showExportEnglishDialog, setShowExportEnglishDialog] = React.useState(false);
  const [compareEntry, setCompareEntry] = React.useState<import("@/components/editor/types").ExtractedEntry | null>(null);
  const [showClearConfirm, setShowClearConfirm] = React.useState<'all' | 'filtered' | null>(null);
  const [showTagRepair, setShowTagRepair] = React.useState(false);
  const [showArabicProcessConfirm, setShowArabicProcessConfirm] = React.useState(false);
  const [showFontTest, setShowFontTest] = React.useState(false);
  const [fontTestWord, setFontTestWord] = React.useState("");
  const [pageLocked, setPageLocked] = React.useState(false);
  const gameType = "xenoblade";
  const processPath = "/process";

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
    const entries = editor.isFilterActive ? editor.filteredEntries : editor.state.entries;
    return entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const t = editor.state!.translations[key]?.trim();
      return !t || t === e.original || t === e.original.trim();
    }).length;
  }, [editor.state, editor.filteredEntries, editor.isFilterActive]);

  const skippedTechnicalCount = React.useMemo(() => {
    return editor.getSkippedTechnicalCount?.() ?? 0;
  }, [editor.state, editor.filteredEntries, editor.isFilterActive]);

  // Show recovery dialog if saved session exists
  if (editor.pendingRecovery) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="relative flex flex-col items-center justify-center py-20 px-4 text-center overflow-hidden">
          <div className="absolute inset-0">
            <img src={heroBg} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
          </div>
          <div className="relative z-10 space-y-6">
            <h2 className="text-2xl md:text-3xl font-display font-black drop-shadow-lg">🔄 جلسة سابقة موجودة</h2>
            <p className="text-muted-foreground font-body bg-background/40 backdrop-blur-sm rounded-lg px-4 py-2 inline-block">
              لديك <span className="font-bold text-primary">{editor.pendingRecovery.translationCount}</span> ترجمة محفوظة
              لـ <span className="font-bold text-primary">{editor.pendingRecovery.entryCount}</span> نص
            </p>
            <div className="flex flex-wrap items-center gap-4 justify-center">
              <Button size="lg" className="font-display font-bold px-8" onClick={editor.handleRecoverSession}>
                <Save className="w-5 h-5" /> استمر مع الترجمات السابقة ✅
              </Button>
              <Button size="lg" variant="destructive" className="font-display font-bold px-8" onClick={editor.handleStartFresh}>
                <RotateCcw className="w-5 h-5" /> ابدأ من جديد 🆕
              </Button>
            </div>
            <p className="text-xs text-muted-foreground font-body">اختيار "ابدأ من جديد" سيحذف جميع الترجمات المحفوظة نهائياً</p>
          </div>
        </div>
      </div>
    );
  }

  if (!editor.state) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="relative flex flex-col items-center justify-center py-20 px-4 text-center overflow-hidden">
          <div className="absolute inset-0">
            <img src={heroBg} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
          </div>
          <div className="relative z-10">
            <p className="text-muted-foreground mb-4 bg-background/40 backdrop-blur-sm rounded-lg px-4 py-2 inline-block">لا توجد بيانات للتحرير. يرجى استخراج النصوص أولاً.</p>
            <br />
            <div className="flex flex-wrap items-center gap-3 mt-4 justify-center">
              <Link to={processPath}><Button className="font-display">اذهب لصفحة المعالجة</Button></Link>
              <Button variant="outline" className="font-display" onClick={editor.loadDemoBdatData}>
                تحميل بيانات BDAT تجريبية
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div
        className="min-h-screen flex flex-col relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drop overlay */}
        {isDragging && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-4 border-dashed border-primary/50 pointer-events-none">
            <div className="text-center space-y-3">
              <Upload className="w-16 h-16 text-primary mx-auto animate-bounce" />
              <p className="text-2xl font-display font-bold text-primary">أفلت ملف JSON هنا</p>
              <p className="text-sm text-muted-foreground font-body">سيتم استيراد الترجمات تلقائياً</p>
            </div>
          </div>
        )}

        {/* Hero header */}
        <header className="relative flex flex-col items-center justify-center py-8 md:py-12 px-4 text-center overflow-hidden">
          <div className="absolute inset-0">
            <img src={heroBg} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
          </div>
          <div className="relative z-10 w-full max-w-6xl mx-auto">
            <div className="flex items-center justify-between w-full mb-3">
              {pageLocked ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground/50 font-body text-sm cursor-not-allowed">
                  <ArrowRight className="w-4 h-4" /> العودة للمعالجة
                </span>
              ) : (
                <Link to={processPath} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm">
                  <ArrowRight className="w-4 h-4" /> العودة للمعالجة
                </Link>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant={pageLocked ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => setPageLocked(!pageLocked)}
                  className="gap-1.5 text-xs"
                >
                  {pageLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  {pageLocked ? "الصفحة مقفلة" : "قفل الصفحة"}
                </Button>
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-black mb-1 drop-shadow-lg">محرر الترجمة ✍️</h1>
            <p className="text-sm text-muted-foreground font-body">عدّل النصوص العربية يدوياً أو استخدم الترجمة التلقائية</p>
          </div>
        </header>

        <div className="flex-1 py-4 md:py-6 px-3 md:px-4">
        <div className="max-w-6xl mx-auto">

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

          {/* Translation Provider Selection */}
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="p-3 md:p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <Key className="w-4 h-4 text-primary" />
                    <span className="text-sm font-display font-bold">🔧 محرك الترجمة</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant={editor.translationProvider === 'mymemory' ? 'default' : 'outline'}
                      onClick={() => editor.setTranslationProvider('mymemory')}
                      className="text-xs font-display"
                    >
                      🆓 MyMemory (مجاني)
                    </Button>
                    <Button
                      size="sm"
                      variant={editor.translationProvider === 'google' ? 'default' : 'outline'}
                      onClick={() => editor.setTranslationProvider('google')}
                      className="text-xs font-display"
                    >
                      🌐 Google Translate (مجاني)
                    </Button>
                    <Button
                      size="sm"
                      variant={editor.translationProvider === 'gemini' ? 'default' : 'outline'}
                      onClick={() => editor.setTranslationProvider('gemini')}
                      className="text-xs font-display"
                    >
                      🤖 Lovable AI (Gemini)
                    </Button>
                  </div>
                </div>

                {editor.translationProvider === 'mymemory' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                      <div className="flex gap-2 flex-1">
                        <input
                          type="email"
                          placeholder="بريدك الإلكتروني (اختياري — يرفع الحد إلى 50,000 حرف/يوم)"
                          value={editor.myMemoryEmail}
                          onChange={(e) => editor.setMyMemoryEmail(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                          dir="ltr"
                        />
                        {editor.myMemoryEmail && (
                          <Button variant="ghost" size="sm" onClick={() => editor.setMyMemoryEmail('')} className="text-xs text-destructive shrink-0">
                            مسح
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-secondary font-body">
                        {editor.myMemoryEmail
                          ? '✅ الحد اليومي: 50,000 حرف'
                          : '🆓 الحد اليومي: 5,000 حرف (أضف بريدك لرفعه إلى 50,000)'}
                      </p>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={(editor.myMemoryCharsUsed / (editor.myMemoryEmail ? 50000 : 5000)) * 100}
                          className="w-24 h-2"
                        />
                        <span className="text-xs font-mono text-muted-foreground">
                          {editor.myMemoryCharsUsed.toLocaleString()} / {editor.myMemoryEmail ? '50,000' : '5,000'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {editor.translationProvider === 'google' && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-secondary font-body">🌐 ترجمة Google مجانية بالكامل — بدون حد يومي ولا حاجة لمفتاح API</p>
                    <p className="text-xs text-muted-foreground font-body">ترجمة آلية سريعة مع دعم دفعات متعددة. جودة أقل من Gemini AI لكنها مجانية تماماً.</p>
                  </div>
                )}

                {editor.translationProvider === 'gemini' && (
                  <div className="flex flex-col gap-3">
                    {/* Model Selector */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-display text-muted-foreground">🧠 نموذج الذكاء الاصطناعي:</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'سريع ومتوازن', badge: '⚡' },
                          { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'الأدق للمصطلحات', badge: '🎯' },
                          { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', desc: 'أحدث نموذج Google', badge: '🆕' },
                          { id: 'gpt-5', label: 'GPT-5', desc: 'استدلال متقدم', badge: '🧠' },
                        ].map(m => (
                          <button
                            key={m.id}
                            onClick={() => editor.setAiModel(m.id)}
                            className={`flex flex-col items-start p-2 rounded-md border text-xs transition-colors ${
                              editor.aiModel === m.id
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                            }`}
                          >
                            <span className="font-display">{m.badge} {m.label}</span>
                            <span className="text-[10px] opacity-70">{m.desc}</span>
                          </button>
                        ))}
                      </div>
                      {(editor.aiModel === 'gemini-2.5-pro' || editor.aiModel === 'gpt-5') && (
                        <p className="text-[10px] text-amber-500 font-body">⚠️ هذا النموذج أبطأ ويستهلك نقاطاً أكثر — مناسب للنصوص المهمة</p>
                      )}
                      {(editor.aiModel === 'gemini-3.1-pro-preview' || editor.aiModel === 'gpt-5') && !editor.userGeminiKey && (
                        <p className="text-[10px] text-muted-foreground font-body">يعمل عبر Lovable AI فقط (لا يدعم المفتاح الشخصي)</p>
                      )}
                    </div>

                    {/* API Key */}
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                      <div className="flex gap-2 flex-1">
                        <input
                          type="password"
                          placeholder="الصق مفتاح Gemini API هنا (اختياري)..."
                          value={editor.userGeminiKey}
                          onChange={(e) => editor.setUserGeminiKey(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                          dir="ltr"
                        />
                        {editor.userGeminiKey && (
                          <Button variant="ghost" size="sm" onClick={() => editor.setUserGeminiKey('')} className="text-xs text-destructive shrink-0">
                            مسح
                          </Button>
                        )}
                      </div>
                      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline hover:text-primary/80 shrink-0">
                        احصل على مفتاح مجاني ↗
                      </a>
                    </div>
                    {editor.userGeminiKey ? (
                      <p className="text-xs text-secondary font-body">✅ سيتم استخدام مفتاحك الشخصي للترجمة بدون حدود</p>
                    ) : (
                      <p className="text-xs text-muted-foreground font-body">بدون مفتاح: يستخدم نقاط Lovable AI المدمجة</p>
                    )}
                  </div>
                )}
              </div>

              {/* Rebalance Newlines Switch */}
              <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-display">⚖️ إعادة موازنة الأسطر تلقائياً</span>
                  <span className="text-xs text-muted-foreground font-body">(يعيد توزيع \n بدلاً من المحافظة على مواضعها الإنجليزية)</span>
                </div>
                <Switch
                  checked={editor.rebalanceNewlines}
                  onCheckedChange={editor.setRebalanceNewlines}
                />
              </div>
            </CardContent>
          </Card>

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
          />

          {/* Progress Bar */}
          <div className="space-y-2 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-sm font-display font-bold text-foreground">نسبة الإنجاز</span>
              <span className="text-sm font-body text-muted-foreground">
                {editor.translatedCount} / {editor.state.entries.length} ({editor.state.entries.length > 0 ? Math.round((editor.translatedCount / editor.state.entries.length) * 100) : 0}%)
              </span>
            </div>
            <Progress value={editor.state.entries.length > 0 ? (editor.translatedCount / editor.state.entries.length) * 100 : 0} className="h-2.5" />
          </div>

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
          {editor.translateProgress && (
            <Card className="mb-4 border-secondary/30 bg-secondary/5"><CardContent className="p-4 text-center font-display">{editor.translateProgress}</CardContent></Card>
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

          {/* Mismatch Detector */}
          <MismatchDetectorPanel
            state={editor.state}
            onClearTranslation={(key) => editor.updateTranslation(key, '')}
            onClearMultiple={(keys) => { for (const k of keys) editor.updateTranslation(k, ''); }}
            onNavigateToEntry={(key) => {
              editor.setFilterStatus('all');
              editor.setSearch('');
              setTimeout(() => {
                const idx = editor.state.entries.findIndex(e => `${e.msbtFile}:${e.index}` === key);
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

          <QualityChecksPanel
            state={editor.state}
            onApplyFix={(key, fix) => editor.updateTranslation(key, fix)}
            onFilterByKeys={() => {
              editor.setFilterStatus('problems');
            }}
            onNavigateToEntry={(key) => {
              editor.setFilterStatus('all');
              editor.setSearch('');
              setTimeout(() => {
                const idx = editor.state.entries.findIndex(e => `${e.msbtFile}:${e.index}` === key);
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
            state={editor.state}
            onApplyFix={(key, fix) => editor.updateTranslation(key, fix)}
            onApplyAll={(fixes) => {
              for (const f of fixes) editor.updateTranslation(f.key, f.value);
            }}
          />

          {/* Line Balance Tool */}
          <LineBalancePanel
            state={editor.state}
            onApplyFix={(key, fix) => editor.updateTranslation(key, fix)}
            onApplyAll={(fixes) => {
              for (const f of fixes) editor.updateTranslation(f.key, f.value);
            }}
          />

          {/* Translation Tools */}
          <TranslationToolsPanel
            state={editor.state}
            currentEntry={null}
            currentTranslation=""
            onApplyTranslation={(key, val) => editor.updateTranslation(key, val)}
          />

          {/* Review Results */}
          <ReviewPanel
            reviewResults={editor.reviewResults}
            shortSuggestions={editor.shortSuggestions}
            improveResults={editor.improveResults}
            suggestingShort={editor.suggestingShort}
            filterCategory={editor.filterCategory}
            filterFile={editor.filterFile}
            filterStatus={editor.filterStatus}
            search={editor.search}
            handleSuggestShorterTranslations={editor.handleSuggestShorterTranslations}
            handleApplyShorterTranslation={editor.handleApplyShorterTranslation}
            handleApplyAllShorterTranslations={editor.handleApplyAllShorterTranslations}
            handleApplyImprovement={editor.handleApplyImprovement}
            handleApplyAllImprovements={editor.handleApplyAllImprovements}
            setReviewResults={editor.setReviewResults}
            setShortSuggestions={editor.setShortSuggestions}
            setImproveResults={editor.setImproveResults}
          />

          {/* Consistency Results */}
          {editor.consistencyResults && editor.consistencyResults.groups.length > 0 && (
            <ConsistencyResultsPanel
              results={editor.consistencyResults}
              onApplyFix={editor.handleApplyConsistencyFix}
              onApplyAll={editor.handleApplyAllConsistencyFixes}
              onClose={() => editor.setConsistencyResults(null)}
            />
          )}

          {/* Sentence Split Results */}
          {editor.sentenceSplitResults && editor.sentenceSplitResults.length > 0 && (
            <SentenceSplitPanel
              results={editor.sentenceSplitResults}
              onAccept={editor.handleApplySentenceSplit}
              onReject={editor.handleRejectSentenceSplit}
              onAcceptAll={editor.handleApplyAllSentenceSplits}
              onClose={() => editor.setSentenceSplitResults(null)}
            />
          )}

          {/* Newline Clean Results */}
          {editor.newlineCleanResults && editor.newlineCleanResults.length > 0 && (
            <NewlineCleanPanel
              results={editor.newlineCleanResults}
              onAccept={editor.handleApplyNewlineClean}
              onReject={editor.handleRejectNewlineClean}
              onAcceptAll={editor.handleApplyAllNewlineCleans}
              onClose={() => editor.setNewlineCleanResults(null)}
            />
          )}

          {/* Diacritics Clean Results */}
          {editor.diacriticsCleanResults && editor.diacriticsCleanResults.length > 0 && (
            <DiacriticsCleanPanel
              results={editor.diacriticsCleanResults}
              onAccept={editor.handleApplyDiacriticsClean}
              onReject={editor.handleRejectDiacriticsClean}
              onAcceptAll={editor.handleApplyAllDiacriticsCleans}
              onClose={() => editor.setDiacriticsCleanResults(null)}
            />
          )}

          {/* Duplicate Alef Clean Results */}
          {editor.duplicateAlefResults && editor.duplicateAlefResults.length > 0 && (
            <DuplicateAlefCleanPanel
              results={editor.duplicateAlefResults}
              onAccept={editor.handleApplyDuplicateAlefClean}
              onReject={editor.handleRejectDuplicateAlefClean}
              onAcceptAll={editor.handleApplyAllDuplicateAlefCleans}
              onClose={() => editor.setDuplicateAlefResults(null)}
            />
           )}

          {/* Arabic Text Fix Results */}
          {editor.arabicTextFixResults && editor.arabicTextFixResults.length > 0 && (
            <ArabicTextFixPanel
              results={editor.arabicTextFixResults}
              onAccept={editor.handleApplyArabicTextFix}
              onReject={editor.handleRejectArabicTextFix}
              onAcceptAll={editor.handleApplyAllArabicTextFixes}
              onClose={() => editor.setArabicTextFixResults(null)}
            />
          )}

          {/* Missing Alef Fix Results */}
          {editor.missingAlefResults && editor.missingAlefResults.length > 0 && (
            <DuplicateAlefCleanPanel
              results={editor.missingAlefResults}
              onAccept={editor.handleApplyMissingAlefClean}
              onReject={editor.handleRejectMissingAlefClean}
              onAcceptAll={editor.handleApplyAllMissingAlefCleans}
              onClose={() => editor.setMissingAlefResults(null)}
            />
          )}

          {/* Mirror Chars Clean Results */}
          {editor.mirrorCharsResults && editor.mirrorCharsResults.length > 0 && (
            <MirrorCharsCleanPanel
              results={editor.mirrorCharsResults}
              onAccept={editor.handleApplyMirrorCharsClean}
              onReject={editor.handleRejectMirrorCharsClean}
              onAcceptAll={editor.handleApplyAllMirrorCharsCleans}
              onClose={() => editor.setMirrorCharsResults(null)}
            />
          )}

          {/* Tag Bracket Fix Results */}
          {editor.tagBracketFixResults && editor.tagBracketFixResults.length > 0 && (
            <TagBracketFixPanel
              results={editor.tagBracketFixResults}
              onAccept={editor.handleApplyTagBracketFix}
              onReject={editor.handleRejectTagBracketFix}
              onAcceptAll={editor.handleApplyAllTagBracketFixes}
              onClose={() => editor.setTagBracketFixResults(null)}
            />
          )}

          {/* Unified Split Results */}
          {editor.unifiedSplitResults && editor.unifiedSplitResults.length > 0 && (
            <NewlineSplitPanel
              results={editor.unifiedSplitResults}
              onAccept={editor.handleApplyUnifiedSplit}
              onReject={editor.handleRejectUnifiedSplit}
              onAcceptAll={editor.handleApplyAllUnifiedSplits}
              onClose={() => editor.setUnifiedSplitResults(null)}
              charLimit={editor.newlineSplitCharLimit}
              onCharLimitChange={editor.setNewlineSplitCharLimit}
              onRescan={editor.handleScanAllSplits}
              title="✂️ تقسيم ومزامنة الأسطر (كل الملفات)"
            />
          )}

          {/* Legacy panels kept for individual tool usage */}
          {editor.newlineSplitResults && editor.newlineSplitResults.length > 0 && (
            <NewlineSplitPanel
              results={editor.newlineSplitResults}
              onAccept={editor.handleApplyNewlineSplit}
              onReject={editor.handleRejectNewlineSplit}
              onAcceptAll={editor.handleApplyAllNewlineSplits}
              onClose={() => editor.setNewlineSplitResults(null)}
              charLimit={editor.newlineSplitCharLimit}
              onCharLimitChange={editor.setNewlineSplitCharLimit}
              onRescan={editor.handleScanNewlineSplit}
            />
          )}

          {editor.npcSplitResults && editor.npcSplitResults.length > 0 && (
            <NewlineSplitPanel
              results={editor.npcSplitResults}
              onAccept={editor.handleApplyNpcSplit}
              onReject={editor.handleRejectNpcSplit}
              onAcceptAll={editor.handleApplyAllNpcSplits}
              onClose={() => editor.setNpcSplitResults(null)}
              charLimit={editor.npcSplitCharLimit}
              onCharLimitChange={editor.setNpcSplitCharLimit}
              onRescan={editor.handleScanNpcSplit}
              title="💬 تقسيم محادثات NPC"
            />
          )}

          {editor.lineSyncResults && editor.lineSyncResults.length > 0 && (
            <NewlineSplitPanel
              results={editor.lineSyncResults}
              onAccept={editor.handleApplyLineSync}
              onReject={editor.handleRejectLineSync}
              onAcceptAll={editor.handleApplyAllLineSyncs}
              onClose={() => editor.setLineSyncResults(null)}
              charLimit={editor.npcSplitCharLimit}
              onCharLimitChange={editor.setNpcSplitCharLimit}
              onRescan={editor.handleScanLineSync}
              title="🔄 مزامنة الأسطر (كل الملفات)"
            />
          )}

          {editor.sentenceOrderResults && editor.sentenceOrderResults.length > 0 && (
            <SentenceOrderPanel
              results={editor.sentenceOrderResults}
              onAccept={editor.handleApplySentenceOrder}
              onReject={editor.handleRejectSentenceOrder}
              onAcceptAll={editor.handleApplyAllSentenceOrders}
              onClose={() => editor.setSentenceOrderResults(null)}
            />
          )}

          {/* Smart Review Panel */}
          {editor.smartReviewFindings && editor.smartReviewFindings.length > 0 && (
            <SmartReviewPanel
              findings={editor.smartReviewFindings}
              onApply={editor.handleApplySmartFix}
              onApplyAll={editor.handleApplyAllSmartFixes}
              onDismiss={editor.handleDismissSmartFinding}
              onClose={() => editor.setSmartReviewFindings(null)}
            />
          )}

          {/* Glossary Compliance Panel */}
          {editor.glossaryComplianceResults && editor.glossaryComplianceResults.length > 0 && (
            <GlossaryCompliancePanel
              violations={editor.glossaryComplianceResults}
              onApplyFix={editor.handleApplyGlossaryFix}
              onApplyAll={editor.handleApplyAllGlossaryFixes}
              onClose={() => editor.setGlossaryComplianceResults(null)}
            />
          )}

          {/* Tag Repair Panel */}
          {showTagRepair && editor.state && (
            <TagRepairPanel
              entries={editor.state.entries}
              translations={editor.state.translations}
              damagedTagKeys={editor.qualityStats.damagedTagKeys}
              onApplySelected={(keys) => editor.handleLocalFixSelectedTags(keys)}
              onClose={() => setShowTagRepair(false)}
            />
          )}

          {/* Merge to Bundled Panel */}
          {editor.mergeToBundledItems && editor.mergeToBundledItems.length > 0 && (
            <MergeToBundledPanel
              items={editor.mergeToBundledItems}
              onAccept={editor.handleMergeToBundledAccept}
              onReject={editor.handleMergeToBundledReject}
              onAcceptAll={editor.handleMergeToBundledAcceptAll}
              onRejectAll={editor.handleMergeToBundledRejectAll}
              onClose={() => editor.setMergeToBundledItems(null)}
              onDownload={editor.handleMergeToBundledDownload}
            />
          )}

          {!editor.user && (
            <Card className="mb-4 border-primary/30 bg-primary/5">
              <CardContent className="flex items-center gap-3 p-4"><LogIn className="w-4 h-4" /> سجّل دخولك للمزامنة</CardContent>
            </Card>
          )}

          {/* Filter Bar */}
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
              {isMobile ? (
                <Button variant={editor.filtersOpen ? "secondary" : "outline"} size="sm" onClick={() => editor.setFiltersOpen(!editor.filtersOpen)} className="font-body text-xs shrink-0">
                  <Filter className="w-3 h-3" /> فلاتر
                </Button>
              ) : (
                <>
                  <select value={editor.filterStatus} onChange={e => editor.setFilterStatus(e.target.value as any)} className="px-3 py-2 rounded bg-background border border-border font-body text-sm">
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
                    {editor.newlinesCount > 0 && <option value="has-newlines">↵ يحتوي أسطر ({editor.newlinesCount})</option>}
                    {editor.fuzzyCount > 0 && <option value="fuzzy">🔍 مطابقة جزئية ({editor.fuzzyCount})</option>}
                    {editor.byteOverflowCount > 0 && <option value="byte-overflow">⛔ تجاوز البايتات ({editor.byteOverflowCount})</option>}
                  </select>
                  <select value={editor.filterFile} onChange={e => editor.setFilterFile(e.target.value)} className="px-3 py-2 rounded bg-background border border-border font-body text-sm max-w-[200px]">
                    <option value="all">كل الملفات</option>
                    {editor.msbtFiles.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select value={editor.filterTechnical} onChange={e => editor.setFilterTechnical(e.target.value as any)} className="px-3 py-2 rounded bg-background border border-border font-body text-sm">
                    <option value="all">الكل</option>
                    <option value="exclude">بدون تقني</option>
                    <option value="only">تقني فقط</option>
                  </select>
                  {editor.bdatTableNames.length > 0 && (
                    <select value={editor.filterTable} onChange={e => { editor.setFilterTable(e.target.value); editor.setFilterColumn("all"); }} className="px-3 py-2 rounded bg-background border border-border font-body text-sm max-w-[180px]">
                      <option value="all">كل الجداول ({editor.state.entries.length})</option>
                      {editor.bdatTableNames.map(t => <option key={t} value={t}>{t} ({editor.bdatTableCounts?.[t] || 0})</option>)}
                    </select>
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
                </>
              )}
            </div>
            {isMobile && editor.filtersOpen && (
              <div className="mt-3 flex flex-col gap-2">
                <select value={editor.filterStatus} onChange={e => editor.setFilterStatus(e.target.value as any)} className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm">
                  <option value="all">الكل</option>
                  <option value="translated">✅ مترجم</option>
                  <option value="untranslated">⬜ غير مترجم</option>
                  <option value="problems">🚨 مشاكل</option>
                  <option value="needs-improve">⚠️ يحتاج تحسين</option>
                  <option value="stuck-chars">🔤 ملتصق</option>
                  <option value="mixed-lang">🌐 مختلط</option>
                  <option value="has-tags">🔧 رموز تقنية</option>
                  {editor.newlinesCount > 0 && <option value="has-newlines">↵ يحتوي أسطر ({editor.newlinesCount})</option>}
                  {editor.fuzzyCount > 0 && <option value="fuzzy">🔍 مطابقة جزئية ({editor.fuzzyCount})</option>}
                  {editor.byteOverflowCount > 0 && <option value="byte-overflow">⛔ تجاوز البايتات ({editor.byteOverflowCount})</option>}
                </select>
                <select value={editor.filterFile} onChange={e => editor.setFilterFile(e.target.value)} className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm">
                  <option value="all">كل الملفات</option>
                  {editor.msbtFiles.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                {editor.bdatTableNames.length > 0 && (
                  <select value={editor.filterTable} onChange={e => { editor.setFilterTable(e.target.value); editor.setFilterColumn("all"); }} className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm">
                    <option value="all">كل الجداول ({editor.state.entries.length})</option>
                    {editor.bdatTableNames.map(t => <option key={t} value={t}>{t} ({editor.bdatTableCounts?.[t] || 0})</option>)}
                  </select>
                )}
                {editor.bdatColumnNames.length > 0 && editor.filterTable !== "all" && (
                  <select value={editor.filterColumn} onChange={e => editor.setFilterColumn(e.target.value)} className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm">
                    <option value="all">كل الأعمدة</option>
                    {editor.bdatColumnNames.map(c => <option key={c} value={c}>{c} ({editor.bdatColumnCounts?.[c] || 0})</option>)}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Needs Improvement Badges */}
          {(editor.needsImproveCount.total > 0 || editor.byteOverflowCount > 0) && !isMobile && (
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
                <GlossaryStatsPanel glossaryText={editor.activeGlossary} />
              </div>
            );
          })()}

          {/* Cloud & Actions */}
          {isMobile ? (
            <div className="flex flex-wrap gap-2 mb-6">
              {/* Cloud Save/Load */}
              <Button variant="outline" size="sm" onClick={editor.handleCloudSave} disabled={!editor.user || editor.cloudSyncing} className="font-body text-xs">
                {editor.cloudSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} حفظ
              </Button>
              <Button variant="outline" size="sm" onClick={editor.handleCloudLoad} disabled={!editor.user || editor.cloudSyncing} className="font-body text-xs">
                <Cloud className="w-3 h-3" /> تحميل
              </Button>

              {/* Export/Import */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="font-body text-xs"><Download className="w-3 h-3" /> تصدير / استيراد</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card border-border z-[100] min-w-[220px] max-h-[60vh] overflow-y-auto">
                  <DropdownMenuLabel className="text-xs">📤 تصدير</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleExportTranslations}><Download className="w-4 h-4" /> تصدير JSON{editor.isFilterActive ? ` (${editor.filterLabel})` : ''}</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleExportCSV}><FileDown className="w-4 h-4" /> تصدير CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleExportXLIFF}><FileDown className="w-4 h-4" /> تصدير XLIFF</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleExportTMX}><FileDown className="w-4 h-4" /> تصدير TMX</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">🌍 تصدير جميع الإنجليزية الأصلية ({editor.state?.entries?.length || 0})</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleExportAllEnglishJson}><FileDown className="w-4 h-4" /> JSON (للترجمة الخارجية)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleExportAllEnglishTxt}><FileText className="w-4 h-4" /> TXT (نص عادي)</DropdownMenuItem>
                  <DropdownMenuSeparator />
                   <DropdownMenuLabel className="text-xs">📦 تصدير الإنجليزية غير المترجمة ({untranslatedCount}){skippedTechnicalCount > 0 && ` 🔧 مستبعد: ${skippedTechnicalCount}`}</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => editor.handleExportEnglishOnly()}><FileText className="w-4 h-4" /> TXT ملف واحد</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.handleExportEnglishOnlyJson()}><FileText className="w-4 h-4" /> JSON ملف واحد</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowExportEnglishDialog(true)}><FileText className="w-4 h-4" /> تصدير مخصص (تقسيم + ZIP) ⚙️</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">📥 استيراد</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleImportTranslations}><Upload className="w-4 h-4" /> استيراد JSON</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImportExternalJson}><Upload className="w-4 h-4" /> استيراد ترجمة خارجية 🌍</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImportCSV}><Upload className="w-4 h-4" /> استيراد CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImportXLIFF}><Upload className="w-4 h-4" /> استيراد XLIFF 📥</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImportTMX}><Upload className="w-4 h-4" /> استيراد TMX 📥</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={editor.handleImportLegacyJson}><Upload className="w-4 h-4" /> استيراد JSON قديم 🔄</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Bundled Translations — مستقل */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="font-body text-xs border-accent/50 gap-1.5">
                    {editor.loadingBundled ? <Loader2 className="w-3 h-3 animate-spin" /> : <Package className="w-3 h-3" />} ترجمات مدمجة{editor.bundledCount > 0 && <span className="bg-accent text-accent-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">{editor.bundledCount}</span>}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card border-border z-[100] min-w-[200px]">
                  <DropdownMenuLabel className="text-xs">📦 الترجمات المدمجة</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleLoadBundledTranslations} disabled={editor.loadingBundled}>
                    <Download className="w-4 h-4" /> تحميل الترجمات المدمجة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleSaveBundledTranslations} disabled={editor.savingBundled || editor.translatedCount === 0}>
                    {editor.savingBundled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} حفظ التعديلات على المدمجة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleMergeToBundled} disabled={editor.mergingToBundled || editor.translatedCount === 0}>
                    {editor.mergingToBundled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Replace className="w-4 h-4" />} دمج التعديلات في المدمجة 🔀
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.preventDefault(); editor.setAutoMergeToBundled(!editor.autoMergeToBundled); }}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${editor.autoMergeToBundled ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground'}`}>
                      {editor.autoMergeToBundled ? '✓' : ''}
                    </span>
                    دمج تلقائي بعد الحفظ
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={editor.handleCleanBundledTranslations} disabled={editor.cleaningBundled}>
                    {editor.cleaningBundled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />} تنظيف لغوي تلقائي 🧹
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleCheckBundledQuality} disabled={editor.checkingBundledQuality}>
                    {editor.checkingBundledQuality ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} فحص الجودة 🔍
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleDetectBundledConflicts} disabled={editor.conflictDetectionRunning || !editor.state.entries.length}>
                    {editor.conflictDetectionRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} كشف التضاربات ⚡
                  </DropdownMenuItem>
                  {editor.bundledConflicts && editor.bundledConflicts.length > 0 && (
                    <DropdownMenuItem onClick={editor.handleUnifyBundledConflicts} disabled={editor.unifyingConflicts}>
                      {editor.unifyingConflicts ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} توحيد الترجمات ({editor.bundledConflicts.length})
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={editor.handleProofreadBundled} disabled={editor.proofreadingBundled}>
                    {editor.proofreadingBundled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} تصحيح إملائي بالذكاء 🤖
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={editor.handleDownloadBundled}>
                    <FileDown className="w-4 h-4" /> تحميل ملف المدمجة 💾
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Glossary — منفصلة */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="font-body text-xs text-primary border-primary/30 gap-1.5"><BookOpen className="w-3 h-3" /> القواميس{editor.glossaryTermCount > 0 && <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">{editor.glossaryTermCount}</span>}</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card border-border z-[100] min-w-[200px]">
                  <DropdownMenuLabel className="text-xs">📖 تحميل قاموس</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleImportGlossary}><BookOpen className="w-4 h-4" /> قاموس مخصص (.txt)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleLoadXC3Glossary}>🎮 قاموس Xenoblade المدمج</DropdownMenuItem>
                   <DropdownMenuItem onClick={editor.handleLoadUIMenusGlossary}>📋 قاموس القوائم والواجهة</DropdownMenuItem>
                   <DropdownMenuItem onClick={editor.handleLoadFullGlossary}>📚 القاموس الشامل (شخصيات + مواقع + مصطلحات)</DropdownMenuItem>
                   <DropdownMenuItem onClick={editor.handleLoadCombatGlossary}>⚔️ قاموس القتال والتأثيرات</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">🔄 إنشاء تلقائي</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleGenerateGlossaryFromTranslations}>✨ إنشاء قاموس من الترجمات</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleFixGlossaryIssues}>🔧 إصلاح مشاكل القاموس</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">☁️ مزامنة سحابية</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleSaveGlossaryToCloud} disabled={!editor.user || editor.cloudSyncing}><CloudUpload className="w-4 h-4" /> حفظ القاموس</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleLoadGlossaryFromCloud} disabled={!editor.user || editor.cloudSyncing}><Cloud className="w-4 h-4" /> تحميل القاموس</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* NPC Mode toggle + Max lines selector */}
              <Button
                variant={editor.npcMode ? "default" : "outline"}
                size="sm"
                className={`font-body text-xs gap-1.5 transition-all ${
                  editor.npcMode
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/30"
                    : "border-cyan-500/30 text-cyan-400 hover:text-cyan-300"
                }`}
                onClick={() => editor.setNpcMode(!editor.npcMode)}
              >
                🎭 وضع NPC {editor.npcMode ? "✅" : ""}
              </Button>
              {/* Unified Split Button */}
              <Button
                variant="default"
                size="sm"
                className="font-body text-xs gap-1.5 bg-gradient-to-r from-cyan-600 to-amber-600 hover:from-cyan-700 hover:to-amber-700 text-white shadow-lg"
                onClick={editor.handleScanAllSplits}
                disabled={editor.translatedCount === 0}
              >
                ✂️ تقسيم ومزامنة الكل {(editor.npcAffectedCount + editor.lineSyncAffectedCount) > 0 && <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">{editor.npcAffectedCount + editor.lineSyncAffectedCount}</span>}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="font-body text-xs"><MoreVertical className="w-3 h-3" /> أدوات</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card border-border z-[100] min-w-[220px] max-h-[70vh] overflow-y-auto">
                  {/* ─── معالجة عربية ─── */}
                  <DropdownMenuLabel className="text-xs text-primary/80">🔤 معالجة عربية</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setShowArabicProcessConfirm(true)} disabled={editor.applyingArabic}><Sparkles className="w-4 h-4" /> تطبيق المعالجة العربية ✨</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleUndoArabicProcessing} disabled={editor.applyingArabic}><RotateCcw className="w-4 h-4" /> التراجع عن المعالجة العربية ↩️</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleFixAllReversed}><RotateCcw className="w-4 h-4" /> تصحيح الكل (معكوس)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleFixAllStuckCharacters} disabled={editor.needsImproveCount.stuck === 0}><AlertTriangle className="w-4 h-4" /> إصلاح الأحرف الملتصقة 🔤</DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* ─── تنظيف النصوص ─── */}
                  <DropdownMenuLabel className="text-xs text-primary/80">🧹 تنظيف النصوص</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleScanDiacritics}><Type className="w-4 h-4" /> إزالة التشكيلات ✏️</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanDuplicateAlef} disabled={editor.translatedCount === 0}>🔤 إزالة الألف المكرر</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanMissingAlef} disabled={editor.translatedCount === 0}>🅰️ إصلاح الألف المحذوفة</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanMirrorChars} disabled={editor.translatedCount === 0}>🔄 عكس الأقواس والأسهم</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanTagBrackets} disabled={editor.translatedCount === 0}>🔧 إصلاح أقواس الرموز التقنية</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanArabicTextFixes} disabled={editor.translatedCount === 0}>✨ تحسين النصوص (تاء/هاء، ياء/ألف)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleFixMixedLanguage} disabled={editor.fixingMixed || editor.needsImproveCount.mixed === 0}>
                    {editor.fixingMixed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />} إصلاح النصوص المختلطة 🌐
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanNewlines} disabled={editor.translatedCount === 0}>
                    🧹 تنظيف رموز غير مرغوبة
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* ─── تنسيق وتقسيم ─── */}
                  <DropdownMenuLabel className="text-xs text-primary/80">✂️ تنسيق وتقسيم</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleScanSentenceOrder} disabled={editor.translatedCount === 0}>↕️ فحص ترتيب الجمل</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanMergedSentences} disabled={editor.scanningSentences || editor.translatedCount === 0}>
                    {editor.scanningSentences ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} فصل الجمل المندمجة ✂️
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleFlattenAllNewlines} disabled={editor.translatedCount === 0 || editor.multiLineCount === 0}>
                    📏 دمج الأسطر المتعددة {editor.multiLineCount > 0 && <span className="text-muted-foreground text-[10px]">({editor.multiLineCount})</span>}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* ─── مراجعة وجودة ─── */}
                  <DropdownMenuLabel className="text-xs text-primary/80">🔍 مراجعة وجودة</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleReviewTranslations} disabled={editor.reviewing || editor.translatedCount === 0}><ShieldCheck className="w-4 h-4" /> مراجعة ذكية 🔍</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleSmartReview} disabled={editor.smartReviewing || editor.translatedCount === 0}>
                    {editor.smartReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} مراجعة عميقة بالذكاء 🔬
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.setAutoSmartReview(!editor.autoSmartReview)}>
                    {editor.autoSmartReview ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Eye className="w-4 h-4 opacity-40" />} مراجعة تلقائية بعد الترجمة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImproveTranslations} disabled={editor.improvingTranslations || editor.translatedCount === 0}><Sparkles className="w-4 h-4" /> تحسين الترجمات ✨</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleCheckConsistency} disabled={editor.checkingConsistency || editor.translatedCount === 0}>
                    {editor.checkingConsistency ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} فحص اتساق المصطلحات
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleGlossaryCompliance} disabled={editor.checkingGlossaryCompliance || editor.translatedCount === 0 || !editor.activeGlossary}>
                    {editor.checkingGlossaryCompliance ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />} فحص التزام القاموس 📖
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* ─── أدوات متنوعة ─── */}
                  <DropdownMenuLabel className="text-xs text-primary/80">🛠️ متنوعة</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => { setFontTestWord(""); setShowFontTest(true); }} disabled={editor.translatedCount === 0 && (editor.state?.entries.length || 0) === 0}>
                    🔤 تجربة الخط (ملء الكل)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowClearConfirm(editor.isFilterActive ? 'filtered' : 'all')} disabled={editor.translatedCount === 0} className="text-destructive focus:text-destructive">
                    <Trash2 className="w-4 h-4" /> {editor.isFilterActive ? `مسح ترجمة القسم المحدد 🗑️` : `مسح جميع الترجمات 🗑️`}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="mb-6 flex gap-2 flex-wrap">
              {/* ── Export/Import ── */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="font-body"><Download className="w-4 h-4" /> تصدير / استيراد</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-card border-border z-50 min-w-[240px] max-h-[70vh] overflow-y-auto">
                  <DropdownMenuLabel className="text-xs">📤 تصدير</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleExportTranslations}><Download className="w-4 h-4" /> تصدير JSON{editor.isFilterActive ? ` (${editor.filterLabel})` : ''}</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleExportCSV}><FileDown className="w-4 h-4" /> تصدير CSV{editor.isFilterActive ? ` (${editor.filterLabel})` : ''}</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleExportXLIFF}><FileDown className="w-4 h-4" /> تصدير XLIFF (memoQ/Trados)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleExportTMX}><FileDown className="w-4 h-4" /> تصدير TMX (ذاكرة ترجمة)</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">🌍 تصدير جميع الإنجليزية الأصلية ({editor.state?.entries?.length || 0})</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleExportAllEnglishJson}><FileDown className="w-4 h-4" /> JSON (للترجمة الخارجية)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleExportAllEnglishTxt}><FileText className="w-4 h-4" /> TXT (نص عادي)</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">📦 تصدير الإنجليزية غير المترجمة ({untranslatedCount}){skippedTechnicalCount > 0 && ` 🔧 مستبعد: ${skippedTechnicalCount}`}</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => editor.handleExportEnglishOnly()}>📄 TXT ملف واحد</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.handleExportEnglishOnlyJson()}>📋 JSON ملف واحد</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowExportEnglishDialog(true)}>⚙️ تصدير مخصص (تقسيم + ZIP)</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">📥 استيراد</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleImportTranslations}><Upload className="w-4 h-4" /> استيراد JSON{editor.isFilterActive ? ` (${editor.filterLabel})` : ''}</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImportExternalJson}><Upload className="w-4 h-4" /> استيراد ترجمة خارجية 🌍</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImportCSV}><Upload className="w-4 h-4" /> استيراد CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImportXLIFF}><Upload className="w-4 h-4" /> استيراد XLIFF 📥</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImportTMX}><Upload className="w-4 h-4" /> استيراد TMX 📥</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={editor.handleImportLegacyJson}><Upload className="w-4 h-4" /> استيراد JSON قديم 🔄</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Bundled Translations — مستقل */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="font-body border-accent/50 gap-1.5">
                    {editor.loadingBundled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />} ترجمات مدمجة{editor.bundledCount > 0 && <span className="bg-accent text-accent-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">{editor.bundledCount}</span>}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-card border-border z-50 min-w-[220px]">
                  <DropdownMenuLabel className="text-xs">📦 الترجمات المدمجة</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleLoadBundledTranslations} disabled={editor.loadingBundled}>
                    <Download className="w-4 h-4" /> تحميل الترجمات المدمجة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleSaveBundledTranslations} disabled={editor.savingBundled || editor.translatedCount === 0}>
                    {editor.savingBundled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} حفظ التعديلات على المدمجة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleMergeToBundled} disabled={editor.mergingToBundled || editor.translatedCount === 0}>
                    {editor.mergingToBundled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Replace className="w-4 h-4" />} دمج التعديلات في المدمجة 🔀
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.preventDefault(); editor.setAutoMergeToBundled(!editor.autoMergeToBundled); }}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${editor.autoMergeToBundled ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground'}`}>
                      {editor.autoMergeToBundled ? '✓' : ''}
                    </span>
                    دمج تلقائي بعد الحفظ
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={editor.handleCleanBundledTranslations} disabled={editor.cleaningBundled}>
                    {editor.cleaningBundled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />} تنظيف لغوي تلقائي 🧹
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleCheckBundledQuality} disabled={editor.checkingBundledQuality}>
                    {editor.checkingBundledQuality ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} فحص الجودة 🔍
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleDetectBundledConflicts} disabled={editor.conflictDetectionRunning || !editor.state.entries.length}>
                    {editor.conflictDetectionRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} كشف التضاربات ⚡
                  </DropdownMenuItem>
                  {editor.bundledConflicts && editor.bundledConflicts.length > 0 && (
                    <DropdownMenuItem onClick={editor.handleUnifyBundledConflicts} disabled={editor.unifyingConflicts}>
                      {editor.unifyingConflicts ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} توحيد الترجمات ({editor.bundledConflicts.length})
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={editor.handleProofreadBundled} disabled={editor.proofreadingBundled}>
                    {editor.proofreadingBundled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} تصحيح إملائي بالذكاء 🤖
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={editor.handleDownloadBundled}>
                    <FileDown className="w-4 h-4" /> تحميل ملف المدمجة 💾
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* ── Glossary ── */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="font-body border-primary/30 text-primary hover:text-primary gap-1.5"><BookOpen className="w-4 h-4" /> القواميس{editor.glossaryTermCount > 0 && <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">{editor.glossaryTermCount}</span>}</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-card border-border z-50 min-w-[220px]">
                  <DropdownMenuLabel className="text-xs">📖 تحميل قاموس</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleImportGlossary}><BookOpen className="w-4 h-4" /> تحميل قاموس مخصص (.txt)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleLoadXC3Glossary}>🎮 قاموس Xenoblade المدمج</DropdownMenuItem>
                   <DropdownMenuItem onClick={editor.handleLoadUIMenusGlossary}>📋 قاموس القوائم والواجهة</DropdownMenuItem>
                   <DropdownMenuItem onClick={editor.handleLoadFullGlossary}>📚 القاموس الشامل (شخصيات + مواقع + مصطلحات)</DropdownMenuItem>
                   <DropdownMenuItem onClick={editor.handleLoadCombatGlossary}>⚔️ قاموس القتال والتأثيرات</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">🔄 إنشاء تلقائي</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleGenerateGlossaryFromTranslations}>✨ إنشاء قاموس من الترجمات</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleFixGlossaryIssues}>🔧 إصلاح مشاكل القاموس</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">☁️ مزامنة سحابية</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleSaveGlossaryToCloud} disabled={!editor.user || editor.cloudSyncing}>
                    {editor.cloudSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />} حفظ القاموس في السحابة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleLoadGlossaryFromCloud} disabled={!editor.user || editor.cloudSyncing}>
                    {editor.cloudSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />} تحميل القاموس من السحابة
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* NPC Mode toggle + Max lines selector */}
              <Button
                variant={editor.npcMode ? "default" : "outline"}
                className={`font-body gap-1.5 text-base px-6 py-3 transition-all ${
                  editor.npcMode
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/30"
                    : "border-cyan-500/30 text-cyan-400 hover:text-cyan-300"
                }`}
                onClick={() => editor.setNpcMode(!editor.npcMode)}
              >
                🎭 وضع NPC {editor.npcMode ? "✅" : ""}
              </Button>
              {/* Unified Split Button */}
              <Button
                variant="default"
                className="font-body gap-1.5 text-base px-6 py-3 bg-gradient-to-r from-cyan-600 to-amber-600 hover:from-cyan-700 hover:to-amber-700 text-white shadow-lg"
                onClick={editor.handleScanAllSplits}
                disabled={editor.translatedCount === 0}
              >
                ✂️ تقسيم ومزامنة الكل {(editor.npcAffectedCount + editor.lineSyncAffectedCount) > 0 && <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">{editor.npcAffectedCount + editor.lineSyncAffectedCount}</span>}
              </Button>

              {/* ── Cloud Save/Load ── */}
              <Button variant="outline" onClick={editor.handleCloudSave} disabled={!editor.user || editor.cloudSyncing} className="font-body border-secondary/30 text-secondary hover:text-secondary">
                {editor.cloudSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} حفظ ☁️
              </Button>
              <Button variant="outline" onClick={editor.handleCloudLoad} disabled={!editor.user || editor.cloudSyncing} className="font-body border-secondary/30 text-secondary hover:text-secondary">
                {editor.cloudSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Cloud className="w-4 h-4 mr-2" />} تحميل ☁️
              </Button>

              {/* ── Tools ── */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="font-body border-accent/30 text-accent hover:text-accent"><Sparkles className="w-4 h-4" /> الأدوات</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-card border-border z-50 min-w-[260px] max-h-[70vh] overflow-y-auto">
                  {/* ─── تنظيف النصوص ─── */}
                  <DropdownMenuLabel className="text-xs text-primary/80">🧹 تنظيف النصوص</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleFixAllReversed}><RotateCcw className="w-4 h-4" /> تصحيح الكل (عربي معكوس)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleFixAllStuckCharacters} disabled={editor.needsImproveCount.stuck === 0}><AlertTriangle className="w-4 h-4" /> إصلاح الأحرف الملتصقة 🔤</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanDiacritics}><Type className="w-4 h-4" /> إزالة التشكيلات ✏️</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanDuplicateAlef} disabled={editor.translatedCount === 0}>🔤 إزالة الألف المكرر</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanMissingAlef} disabled={editor.translatedCount === 0}>🅰️ إصلاح الألف المحذوفة</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanMirrorChars} disabled={editor.translatedCount === 0}>🔄 عكس الأقواس والأسهم</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanTagBrackets} disabled={editor.translatedCount === 0}>🔧 إصلاح أقواس الرموز التقنية</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanArabicTextFixes} disabled={editor.translatedCount === 0}>✨ تحسين النصوص (تاء/هاء، ياء/ألف، مكررات)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleFixMixedLanguage} disabled={editor.fixingMixed || editor.needsImproveCount.mixed === 0}>
                    {editor.fixingMixed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />} إصلاح النصوص المختلطة 🌐
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanNewlines} disabled={editor.translatedCount === 0}>
                    🧹 تنظيف رموز غير مرغوبة
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* ─── تنسيق وتقسيم ─── */}
                  <DropdownMenuLabel className="text-xs text-primary/80">✂️ تنسيق وتقسيم</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleScanSentenceOrder} disabled={editor.translatedCount === 0}>↕️ فحص ترتيب الجمل</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanMergedSentences} disabled={editor.scanningSentences || editor.translatedCount === 0}>
                    {editor.scanningSentences ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} فصل الجمل المندمجة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleFlattenAllNewlines} disabled={editor.translatedCount === 0 || editor.multiLineCount === 0}>
                    📏 دمج الأسطر المتعددة (سطر واحد) {editor.multiLineCount > 0 && <span className="text-muted-foreground text-[10px]">({editor.multiLineCount})</span>}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* ─── مراجعة وجودة ─── */}
                  <DropdownMenuLabel className="text-xs text-primary/80">🔍 مراجعة وجودة</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleReviewTranslations} disabled={editor.reviewing || editor.translatedCount === 0}>
                    {editor.reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} مراجعة ذكية
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleSmartReview} disabled={editor.smartReviewing || editor.translatedCount === 0}>
                    {editor.smartReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} مراجعة عميقة بالذكاء 🔬
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.setAutoSmartReview(!editor.autoSmartReview)}>
                    {editor.autoSmartReview ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Eye className="w-4 h-4 opacity-40" />} مراجعة تلقائية بعد الترجمة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImproveTranslations} disabled={editor.improvingTranslations || editor.translatedCount === 0}>
                    {editor.improvingTranslations ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} تحسين الترجمات ✨
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleCheckConsistency} disabled={editor.checkingConsistency || editor.translatedCount === 0}>
                    {editor.checkingConsistency ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} فحص اتساق المصطلحات
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleGlossaryCompliance} disabled={editor.checkingGlossaryCompliance || editor.translatedCount === 0 || !editor.activeGlossary}>
                    {editor.checkingGlossaryCompliance ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />} فحص التزام القاموس 📖
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* ─── أدوات متنوعة ─── */}
                  <DropdownMenuLabel className="text-xs text-primary/80">🛠️ أدوات متنوعة</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => { setFontTestWord(""); setShowFontTest(true); }} disabled={editor.translatedCount === 0 && (editor.state?.entries.length || 0) === 0}>
                    🔤 تجربة الخط (ملء الكل)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowClearConfirm(editor.isFilterActive ? 'filtered' : 'all')} disabled={editor.translatedCount === 0} className="text-destructive focus:text-destructive">
                    <Trash2 className="w-4 h-4" /> {editor.isFilterActive ? `مسح ترجمة القسم المحدد 🗑️` : `مسح جميع الترجمات 🗑️`}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Build Options */}
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
            <Button size="lg" onClick={editor.handlePreBuild} disabled={editor.building} className="flex-1 font-display font-bold">
              {editor.building ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء الملف النهائي
            </Button>
          </div>

          {/* Quality Stats Panel */}
          {editor.showQualityStats && (
            <QualityStatsPanel
              qualityStats={editor.qualityStats}
              needsImproveCount={editor.needsImproveCount}
              translatedCount={editor.translatedCount}
              setFilterStatus={editor.setFilterStatus}
              setShowQualityStats={editor.setShowQualityStats}
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

          {/* Diff View */}
          {showDiffView && editor.state && (
            <DiffView
              entries={editor.filteredEntries}
              translations={editor.state.translations}
              onClose={() => setShowDiffView(false)}
            />
          )}

          {/* Pagination Header */}
          {editor.filteredEntries.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">
                عرض {editor.currentPage * PAGE_SIZE + 1}-{Math.min((editor.currentPage + 1) * PAGE_SIZE, editor.filteredEntries.length)} من {editor.filteredEntries.length} نص
              </p>
              <PaginationControls currentPage={editor.currentPage} totalPages={editor.totalPages} totalItems={editor.filteredEntries.length} pageSize={PAGE_SIZE} setCurrentPage={editor.setCurrentPage} />
            </div>
          )}

          {/* Entries List */}
          <div className="space-y-2">
            {editor.filteredEntries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد نصوص مطابقة</p>
            ) : (
              editor.paginatedEntries.map((entry) => {
                const key = `${entry.msbtFile}:${entry.index}`;
                return (
                  <EntryCard
                    key={key}
                    entry={entry}
                    translation={editor.state?.translations[key] || ''}
                    glossary={editor.activeGlossary}
                    isProtected={editor.state?.protectedEntries?.has(key) || false}
                    hasProblem={editor.qualityStats.problemKeys.has(key)}
                    isDamagedTag={editor.qualityStats.damagedTagKeys.has(key)}
                    fuzzyScore={editor.state?.fuzzyScores?.[key]}
                    isMobile={isMobile}
                    translatingSingle={editor.translatingSingle}
                    improvingTranslations={editor.improvingTranslations}
                    previousTranslations={editor.previousTranslations}
                    isTranslationTooShort={editor.isTranslationTooShort}
                    isTranslationTooLong={editor.isTranslationTooLong}
                    hasStuckChars={editor.hasStuckChars}
                    isMixedLanguage={editor.isMixedLanguage}
                    updateTranslation={editor.updateTranslation}
                    handleTranslateSingle={editor.handleTranslateSingle}
                    handleImproveSingleTranslation={editor.handleImproveSingleTranslation}
                    handleUndoTranslation={editor.handleUndoTranslation}
                    handleFixReversed={editor.handleFixReversed}
                    handleLocalFixDamagedTag={editor.handleLocalFixDamagedTag}
                    onAcceptFuzzy={editor.handleAcceptFuzzy}
                    onRejectFuzzy={editor.handleRejectFuzzy}
                    onCompare={(entry) => setCompareEntry(entry)}
                    onSplitNewline={editor.handleSplitSingleEntry}
                    tmSuggestions={findSimilar(key, entry.original)}
                  />
                );
              })
            )}
          </div>

          {/* Pagination Footer */}
          <PaginationControls currentPage={editor.currentPage} totalPages={editor.totalPages} totalItems={editor.filteredEntries.length} pageSize={PAGE_SIZE} setCurrentPage={editor.setCurrentPage} />
        </div>
        </div>

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
      </div>
    </TooltipProvider>
  );
};

export default Editor;
