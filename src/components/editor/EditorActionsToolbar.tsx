import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, Loader2, Save, Upload, FileDown, Cloud, CloudUpload, BookOpen, AlertTriangle, Eye, RotateCcw, CheckCircle2, ShieldCheck, MoreVertical, Replace, Type, Trash2, Package, Wand2, Rows3, Languages, Sparkles, Filter } from "lucide-react";
import type { ToolType } from "@/components/editor/ToolHelpDialog";
import type { useEditorState } from "@/hooks/useEditorState";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "activeGlossary"
  | "advancedAnalysisTab"
  | "advancedAnalyzing"
  | "applyingArabic"
  | "autoMergeToBundled"
  | "autoSmartReview"
  | "bundledConflicts"
  | "bundledCount"
  | "checkingBundledQuality"
  | "checkingConsistency"
  | "checkingGlossaryCompliance"
  | "cleaningBundled"
  | "cloudSyncing"
  | "conflictDetectionRunning"
  | "detectingWeak"
  | "enhancingTranslations"
  | "filterLabel"
  | "filteredEntries"
  | "fixingMixed"
  | "glossaryTermCount"
  | "handleAutoCorrect"
  | "handleCheckBundledQuality"
  | "handleCheckConsistency"
  | "handleCleanBundledTranslations"
  | "handleCloudLoad"
  | "handleCloudSave"
  | "handleContextRetranslate"
  | "handleContextReview"
  | "handleDetectBundledConflicts"
  | "handleDetectWeak"
  | "handleDownloadBundled"
  | "handleEnhanceTranslations"
  | "handleExportAllEnglishJson"
  | "handleExportAllEnglishTxt"
  | "handleExportCSV"
  | "handleExportEnglishOnly"
  | "handleExportEnglishOnlyJson"
  | "handleExportSkillsGlossary"
  | "handleExportTMX"
  | "handleExportTranslations"
  | "handleExportXLIFF"
  | "handleFixAllReversed"
  | "handleFixAllStuckCharacters"
  | "handleFixGlossaryIssues"
  | "handleFixMixedLanguage"
  | "handleFlattenAllNewlines"
  | "handleGenerateGlossaryFromTranslations"
  | "handleGlossaryCompliance"
  | "handleGrammarCheck"
  | "handleImportCSV"
  | "handleImportExternalJson"
  | "handleImportGlossary"
  | "handleImportLegacyJson"
  | "handleImportTMX"
  | "handleImportTranslations"
  | "handleImportXLIFF"
  | "handleImproveTranslations"
  | "handleLoadBundledTranslations"
  | "handleLoadCombatGlossary"
  | "handleLoadFullGlossary"
  | "handleLoadGlossaryFromCloud"
  | "handleLoadUIMenusGlossary"
  | "handleLoadXC3Glossary"
  | "handleMergeToBundled"
  | "handleProofreadBundled"
  | "handleReviewTranslations"
  | "handleSaveBundledTranslations"
  | "handleSaveGlossaryToCloud"
  | "handleScanAllSplits"
  | "handleScanArabicTextFixes"
  | "handleScanDiacritics"
  | "handleScanGlossaryDuplicates"
  | "handleScanLonelyLam"
  | "handleScanMirrorChars"
  | "handleScanNewlines"
  | "handleScanTagBrackets"
  | "handleSmartMergeGlossaries"
  | "handleSmartReview"
  | "handleUndoArabicProcessing"
  | "handleUnifyBundledConflicts"
  | "improvingTranslations"
  | "isFilterActive"
  | "lineSyncAffectedCount"
  | "loadingBundled"
  | "mergingToBundled"
  | "multiLineCount"
  | "needsImproveCount"
  | "npcAffectedCount"
  | "npcMode"
  | "proofreadingBundled"
  | "reviewing"
  | "savingBundled"
  | "setAutoMergeToBundled"
  | "setAutoSmartReview"
  | "setNpcMode"
  | "smartReviewing"
  | "state"
  | "translatedCount"
  | "unifyingConflicts"
  | "user"
>;

interface EditorActionsToolbarProps {
  editor: EditorSubset;
  isMobile: boolean;
  untranslatedCount: number;
  skippedTechnicalCount: number;
  setShowExportEnglishDialog: (v: boolean) => void;
  setShowClearConfirm: (v: 'all' | 'filtered' | null) => void;
  setShowToolHelp: (v: ToolType) => void;
  setShowFontTest: (v: boolean) => void;
  setFontTestWord: (v: string) => void;
  setShowArabicProcessConfirm: (v: boolean) => void;
}

const EditorActionsToolbar: React.FC<EditorActionsToolbarProps> = ({
  editor,
  isMobile,
  untranslatedCount,
  skippedTechnicalCount,
  setShowExportEnglishDialog,
  setShowClearConfirm,
  setShowToolHelp,
  setShowFontTest,
  setFontTestWord,
  setShowArabicProcessConfirm,
}) => (
  <>
          {/* Cloud & Actions */}
          {isMobile ? (
            <div className="flex flex-wrap gap-1.5 mb-6">
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
                <DropdownMenuContent align="end" className="bg-card border-border z-[100] w-[min(calc(100vw-1.5rem),360px)] max-w-[360px] max-h-[70vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <DropdownMenuLabel className="text-xs">📤 تصدير</DropdownMenuLabel>
                  {editor.isFilterActive && (
                    <div className="px-2 py-1.5 text-[11px] text-primary bg-primary/10 rounded mx-1 mb-1" dir="rtl">
                      ⚠️ سيتم تصدير <strong>{editor.filteredEntries.length}</strong> جملة فقط ({editor.filterLabel})
                    </div>
                  )}
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
                <DropdownMenuContent align="end" className="bg-card border-border z-[100] w-[min(calc(100vw-1.5rem),360px)] max-w-[360px] max-h-[70vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                  <DropdownMenuItem onClick={editor.handleDetectBundledConflicts} disabled={editor.conflictDetectionRunning || !editor.state?.entries.length}>
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
                <DropdownMenuContent align="end" className="bg-card border-border z-[100] w-[min(calc(100vw-1.5rem),360px)] max-w-[360px] max-h-[70vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                  <DropdownMenuItem onClick={editor.handleScanGlossaryDuplicates}>🔍 فحص التكرارات المتعارضة</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">📤 تصدير أقسام</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleExportSkillsGlossary}>⚔️ تصدير المهارات والفنون فقط</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">🔀 دمج ذكي</DropdownMenuLabel>
                  <DropdownMenuItem onClick={editor.handleSmartMergeGlossaries}>🔍 مقارنة قاموس القتال مع الشامل</DropdownMenuItem>
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
                <DropdownMenuContent align="end" className="bg-card border-border z-[100] w-[min(calc(100vw-1.5rem),360px)] max-w-[360px] max-h-[70vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                  <DropdownMenuItem onClick={editor.handleScanMirrorChars} disabled={editor.translatedCount === 0}>🔄 عكس الأقواس والأسهم</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanTagBrackets} disabled={editor.translatedCount === 0}>🔧 إصلاح أقواس الرموز التقنية</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanArabicTextFixes} disabled={editor.translatedCount === 0}>✨ تحسين النصوص (تاء/هاء، ياء/ألف)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanLonelyLam} disabled={editor.translatedCount === 0}>🚫 إصلاح اللام المنفردة (ل → لا)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleFixMixedLanguage} disabled={editor.fixingMixed || editor.needsImproveCount.mixed === 0}>
                    {editor.fixingMixed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />} إصلاح النصوص المختلطة 🌐
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanNewlines} disabled={editor.translatedCount === 0}>
                    🧹 تنظيف رموز غير مرغوبة
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* ─── تنسيق وتقسيم ─── */}
                  <DropdownMenuLabel className="text-xs text-primary/80">✂️ تنسيق وتقسيم</DropdownMenuLabel>
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
                  <DropdownMenuItem onClick={editor.handleGrammarCheck} disabled={editor.smartReviewing || editor.translatedCount === 0}>
                    {editor.smartReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />} فحص القواعد النحوية 📝
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleContextReview} disabled={editor.smartReviewing || editor.translatedCount === 0}>
                    {editor.smartReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />} مراجعة سياقية 🎯
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.setAutoSmartReview(!editor.autoSmartReview)}>
                    {editor.autoSmartReview ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Eye className="w-4 h-4 opacity-40" />} مراجعة تلقائية بعد الترجمة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImproveTranslations} disabled={editor.improvingTranslations || editor.translatedCount === 0}><Sparkles className="w-4 h-4" /> تحسين الترجمات ✨</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleAutoCorrect} disabled={editor.smartReviewing || editor.translatedCount === 0}>
                    {editor.smartReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />} تصحيح إملائي تلقائي ✏️
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleDetectWeak} disabled={editor.detectingWeak || editor.translatedCount === 0}>
                    {editor.detectingWeak ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} كشف الترجمات الركيكة 🔍
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleContextRetranslate} disabled={editor.smartReviewing || editor.translatedCount === 0}>
                    {editor.smartReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />} إعادة ترجمة بالسياق 🎯
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleCheckConsistency} disabled={editor.checkingConsistency || editor.translatedCount === 0}>
                    {editor.checkingConsistency ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} فحص اتساق المصطلحات
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleGlossaryCompliance} disabled={editor.checkingGlossaryCompliance || editor.translatedCount === 0 || !editor.activeGlossary}>
                    {editor.checkingGlossaryCompliance ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />} فحص التزام القاموس 📖
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleEnhanceTranslations} disabled={editor.enhancingTranslations || editor.translatedCount === 0}>
                    {editor.enhancingTranslations ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} تحسين سياقي شامل 🎯
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-primary/80">🧠 تحليل متقدم</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setShowToolHelp('literal-detect')} disabled={editor.advancedAnalyzing || editor.translatedCount === 0}>
                    {editor.advancedAnalyzing && editor.advancedAnalysisTab === 'literal-detect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} كشف الترجمات الحرفية 📝
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowToolHelp('style-unify')} disabled={editor.advancedAnalyzing || editor.translatedCount === 0}>
                    {editor.advancedAnalyzing && editor.advancedAnalysisTab === 'style-unify' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />} توحيد الأسلوب 🎨
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowToolHelp('consistency-check')} disabled={editor.advancedAnalyzing || editor.translatedCount === 0}>
                    {editor.advancedAnalyzing && editor.advancedAnalysisTab === 'consistency-check' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} فحص اتساق شامل 🛡️
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowToolHelp('alternatives')} disabled={editor.advancedAnalyzing || editor.translatedCount === 0}>
                    {editor.advancedAnalyzing && editor.advancedAnalysisTab === 'alternatives' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rows3 className="w-4 h-4" />} بدائل متعددة الأسلوب 📝
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowToolHelp('full-analysis')} disabled={editor.advancedAnalyzing || editor.translatedCount === 0}>
                    {editor.advancedAnalyzing && editor.advancedAnalysisTab === 'full-analysis' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} تحليل شامل متكامل 🧠
                  </DropdownMenuItem>


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
                  {editor.isFilterActive && (
                    <div className="px-2 py-1.5 text-[11px] text-primary bg-primary/10 rounded mx-1 mb-1" dir="rtl">
                      ⚠️ سيتم تصدير <strong>{editor.filteredEntries.length}</strong> جملة فقط ({editor.filterLabel})
                    </div>
                  )}
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
                  <DropdownMenuItem onClick={editor.handleDetectBundledConflicts} disabled={editor.conflictDetectionRunning || !editor.state?.entries.length}>
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
                  
                  <DropdownMenuItem onClick={editor.handleScanMirrorChars} disabled={editor.translatedCount === 0}>🔄 عكس الأقواس والأسهم</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanTagBrackets} disabled={editor.translatedCount === 0}>🔧 إصلاح أقواس الرموز التقنية</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanArabicTextFixes} disabled={editor.translatedCount === 0}>✨ تحسين النصوص (تاء/هاء، ياء/ألف، مكررات)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanLonelyLam} disabled={editor.translatedCount === 0}>🚫 إصلاح اللام المنفردة (ل → لا)</DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleFixMixedLanguage} disabled={editor.fixingMixed || editor.needsImproveCount.mixed === 0}>
                    {editor.fixingMixed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />} إصلاح النصوص المختلطة 🌐
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleScanNewlines} disabled={editor.translatedCount === 0}>
                    🧹 تنظيف رموز غير مرغوبة
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* ─── تنسيق وتقسيم ─── */}
                  <DropdownMenuLabel className="text-xs text-primary/80">✂️ تنسيق وتقسيم</DropdownMenuLabel>
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
                  <DropdownMenuItem onClick={editor.handleGrammarCheck} disabled={editor.smartReviewing || editor.translatedCount === 0}>
                    {editor.smartReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />} فحص القواعد النحوية 📝
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleContextReview} disabled={editor.smartReviewing || editor.translatedCount === 0}>
                    {editor.smartReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />} مراجعة سياقية 🎯
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.setAutoSmartReview(!editor.autoSmartReview)}>
                    {editor.autoSmartReview ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Eye className="w-4 h-4 opacity-40" />} مراجعة تلقائية بعد الترجمة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleImproveTranslations} disabled={editor.improvingTranslations || editor.translatedCount === 0}>
                    {editor.improvingTranslations ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} تحسين الترجمات ✨
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleAutoCorrect} disabled={editor.smartReviewing || editor.translatedCount === 0}>
                    {editor.smartReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />} تصحيح إملائي تلقائي ✏️
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleDetectWeak} disabled={editor.detectingWeak || editor.translatedCount === 0}>
                    {editor.detectingWeak ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} كشف الترجمات الركيكة 🔍
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={editor.handleContextRetranslate} disabled={editor.smartReviewing || editor.translatedCount === 0}>
                    {editor.smartReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />} إعادة ترجمة بالسياق 🎯
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
  </>
);

export default EditorActionsToolbar;
