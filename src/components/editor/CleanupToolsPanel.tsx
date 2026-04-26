import React, { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Wrench, CheckCircle2, X, Sparkles, Search, Type } from "lucide-react";
import { EditorState } from "@/components/editor/types";
import { checkArabicTypos, applyTypoFix, type TypoResult } from "@/lib/arabic-typo-checker";



interface CleanupResult {
  key: string;
  label: string;
  original: string;
  before: string;
  after: string;
  types: string[];
}

interface CleanupToolsPanelProps {
  state: EditorState;
  onApplyFix: (key: string, fixedText: string) => void;
  onApplyAll: (fixes: { key: string; value: string }[]) => void;
}

// === Cleanup functions ===

/** توحيد الهمزات - Normalize hamza forms */
function unifyHamza(text: string): string {
  return text
    .replace(/[أإآٱ]/g, (ch) => {
      // آ stays as آ (alef madda)
      if (ch === 'آ') return 'آ';
      // أ إ ٱ → أ (normalize to أ)
      return 'أ';
    });
}

/** إصلاح الاقتباسات - Convert quotes to Arabic style */
function fixQuotes(text: string): string {
  // Don't touch quotes inside tags
  let result = '';
  let inTag = false;
  const quoteStack: string[] = [];
  
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '[' || ch === '{') { inTag = true; result += ch; continue; }
    if (ch === ']' || ch === '}') { inTag = false; result += ch; continue; }
    if (inTag) { result += ch; continue; }
    
    if (ch === '"' || ch === '\u201C' || ch === '\u201D') {
      if (quoteStack.length === 0) {
        result += '«';
        quoteStack.push('«');
      } else {
        result += '»';
        quoteStack.pop();
      }
    } else if (ch === "'" || ch === '\u2018' || ch === '\u2019') {
      // Single quotes — less common in Arabic, keep as-is
      result += ch;
    } else {
      result += ch;
    }
  }
  return result;
}

/** توحيد الأرقام - Convert Western digits to Arabic-Indic */
function unifyNumbersToArabic(text: string): string {
  return text.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + parseInt(d)));
}

/** توحيد الأرقام - Convert Arabic-Indic to Western */
function unifyNumbersToWestern(text: string): string {
  return text.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** إزالة الأحرف غير المرئية - Remove zero-width characters */
function removeInvisibleChars(text: string): string {
  return text.replace(/[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '');
}

/** إصلاح علامة الاستفهام - Convert ? to ؟ in Arabic context */
function fixQuestionMark(text: string): string {
  // Only fix ? that's surrounded by Arabic text
  return text.replace(/(\p{Script=Arabic})\s*\?/gu, '$1؟');
}

/** إصلاح Unicode - Fix common Unicode issues */
function fixUnicode(text: string): string {
  let result = text;
  // Fix common mojibake/encoding issues
  // Replace U+FFFD (replacement character) — can't auto-fix but flag it
  // Fix common Arabic encoding errors
  result = result.replace(/\u0640{2,}/g, '\u0640'); // Multiple tatweel → single
  // Fix misplaced combining marks at start
  result = result.replace(/^[\u064B-\u065F\u0670]+/, '');
  return result;
}


const TOOL_LABELS: Record<string, { name: string; emoji: string }> = {
  hamza_unify: { name: "توحيد الهمزات", emoji: "🔤" },
  quote_fix: { name: "إصلاح الاقتباسات", emoji: "«»" },
  number_unify: { name: "توحيد الأرقام", emoji: "🔢" },
  invisible_chars: { name: "أحرف غير مرئية", emoji: "👻" },
  question_mark_fix: { name: "علامة الاستفهام", emoji: "؟" },
  unicode_fix: { name: "إصلاح Unicode", emoji: "🔧" },
};

export default function CleanupToolsPanel({ state, onApplyFix, onApplyAll }: CleanupToolsPanelProps) {
  const isEnabled = (_id: string) => true;
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [numberMode, setNumberMode] = useState<'arabic' | 'western'>('arabic');
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<CleanupResult[] | null>(null);
  const [typoResults, setTypoResults] = useState<TypoResult[] | null>(null);
  const [typoScanning, setTypoScanning] = useState(false);

  // --- Typo checker ---
  const handleTypoScan = useCallback(() => {
    setTypoScanning(true);
    setTimeout(() => {
      const results = checkArabicTypos(state.translations, { maxResults: 500 });
      setTypoResults(results);
      setTypoScanning(false);
      setOpen(true);
    }, 50);
  }, [state.translations]);

  const handleApplyTypo = useCallback((typo: TypoResult) => {
    const currentText = state.translations[typo.key];
    if (!currentText) return;
    const fixed = applyTypoFix(currentText, typo);
    onApplyFix(typo.key, fixed);
    setTypoResults(prev => prev?.filter(t => t !== typo) || null);
  }, [state.translations, onApplyFix]);

  const handleApplyAllTypos = useCallback(() => {
    if (!typoResults) return;
    // Group by key and apply all fixes per key
    const byKey = new Map<string, TypoResult[]>();
    for (const t of typoResults) {
      if (!byKey.has(t.key)) byKey.set(t.key, []);
      byKey.get(t.key)!.push(t);
    }
    const fixes: { key: string; value: string }[] = [];
    for (const [key, typos] of byKey) {
      let text = state.translations[key] || '';
      for (const typo of typos) {
        text = applyTypoFix(text, typo);
      }
      fixes.push({ key, value: text });
    }
    onApplyAll(fixes);
    setTypoResults(null);
  }, [typoResults, state.translations, onApplyAll]);

  const handleRejectTypo = useCallback((typo: TypoResult) => {
    setTypoResults(prev => prev?.filter(t => t !== typo) || null);
  }, []);

  const handleScan = useCallback(() => {
    setScanning(true);
    setTimeout(() => {
      const results: CleanupResult[] = [];

      for (const entry of state.entries) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const translation = state.translations[key]?.trim();
        if (!translation) continue;

        let cleaned = translation;
        const appliedTypes: string[] = [];

        if (isEnabled("hamza_unify")) {
          const after = unifyHamza(cleaned);
          if (after !== cleaned) { appliedTypes.push("hamza_unify"); cleaned = after; }
        }
        if (isEnabled("quote_fix")) {
          const after = fixQuotes(cleaned);
          if (after !== cleaned) { appliedTypes.push("quote_fix"); cleaned = after; }
        }
        if (isEnabled("number_unify")) {
          const after = numberMode === 'arabic' ? unifyNumbersToArabic(cleaned) : unifyNumbersToWestern(cleaned);
          if (after !== cleaned) { appliedTypes.push("number_unify"); cleaned = after; }
        }
        if (isEnabled("invisible_chars")) {
          const after = removeInvisibleChars(cleaned);
          if (after !== cleaned) { appliedTypes.push("invisible_chars"); cleaned = after; }
        }
        if (isEnabled("question_mark_fix")) {
          const after = fixQuestionMark(cleaned);
          if (after !== cleaned) { appliedTypes.push("question_mark_fix"); cleaned = after; }
        }
        if (isEnabled("unicode_fix")) {
          const after = fixUnicode(cleaned);
          if (after !== cleaned) { appliedTypes.push("unicode_fix"); cleaned = after; }
        }
        if (appliedTypes.length > 0) {
          results.push({
            key,
            label: entry.label,
            original: entry.original,
            before: translation,
            after: cleaned,
            types: appliedTypes,
          });
        }
      }

      setScanResults(results);
      setScanning(false);
      setOpen(true);
    }, 50);
  }, [state.entries, state.translations, isEnabled, numberMode]);

  const handleApplyAll = useCallback(() => {
    if (!scanResults) return;
    onApplyAll(scanResults.map(r => ({ key: r.key, value: r.after })));
    setScanResults(null);
  }, [scanResults, onApplyAll]);

  const handleApplySingle = useCallback((result: CleanupResult) => {
    onApplyFix(result.key, result.after);
    setScanResults(prev => prev?.filter(r => r.key !== result.key) || null);
  }, [onApplyFix]);

  const handleReject = useCallback((key: string) => {
    setScanResults(prev => prev?.filter(r => r.key !== key) || null);
  }, []);

  const anyEnabled = ["hamza_unify", "quote_fix", "number_unify", "invisible_chars", "question_mark_fix", "unicode_fix"].some(id => isEnabled(id));
  if (!anyEnabled || dismissed) return null;

  const enabledTools = Object.keys(TOOL_LABELS).filter(id => isEnabled(id));

  // Typo category labels
  const typoCategoryLabels: Record<string, { name: string; emoji: string }> = {
    hamza: { name: 'همزة', emoji: '🔤' },
    taa: { name: 'تاء', emoji: 'ة' },
    alef: { name: 'ألف', emoji: 'ى' },
    common: { name: 'شائع', emoji: '📝' },
    duplicate: { name: 'تكرار', emoji: '♻️' },
    spacing: { name: 'مسافة', emoji: '⬜' },
    letter: { name: 'حرف', emoji: '🔡' },
    yaa: { name: 'ياء', emoji: 'ي' },
    waw: { name: 'واو', emoji: 'و' },
    haa: { name: 'هاء', emoji: 'ه' },
  };

  // Group typo results by category for summary
  const typoCategoryCounts: Record<string, number> = {};
  if (typoResults) {
    for (const t of typoResults) {
      typoCategoryCounts[t.category] = (typoCategoryCounts[t.category] || 0) + 1;
    }
  }

  return (
    <Card className="mb-4 border-sky-500/30 bg-sky-500/5">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardContent className="p-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full text-right">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-sky-400" />
              <span className="font-display font-bold text-sm">أدوات التنظيف</span>
              {scanResults && scanResults.length > 0 && (
                <Badge variant="secondary" className="text-xs">{scanResults.length} تعديل</Badge>
              )}
              {typoResults && typoResults.length > 0 && (
                <Badge variant="destructive" className="text-xs">{typoResults.length} خطأ إملائي</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-muted-foreground"
                onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
              >
                <X className="w-3 h-3" />
              </Button>
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3 space-y-3">
            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="text-xs h-9 gap-1.5"
                onClick={(e) => { e.stopPropagation(); handleScan(); }}
                disabled={scanning}
              >
                {scanning ? (
                  <><Sparkles className="w-3 h-3 animate-spin" /> جاري الفحص...</>
                ) : (
                  <><Wrench className="w-3 h-3" /> فحص وتنظيف</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-9 gap-1.5 border-orange-500/30 text-orange-600 hover:bg-orange-500/10"
                onClick={(e) => { e.stopPropagation(); handleTypoScan(); }}
                disabled={typoScanning}
              >
                {typoScanning ? (
                  <><Search className="w-3 h-3 animate-spin" /> جاري الفحص...</>
                ) : (
                  <><Type className="w-3 h-3" /> فحص إملائي محلي</>
                )}
              </Button>
            </div>

            {/* Enabled tools */}
            <div className="flex flex-wrap gap-2">
              {enabledTools.map(id => (
                <Badge key={id} variant="outline" className="text-xs gap-1">
                  {TOOL_LABELS[id].emoji} {TOOL_LABELS[id].name}
                </Badge>
              ))}
            </div>

            {/* Number mode toggle */}
            {isEnabled("number_unify") && (
              <div className="flex items-center gap-2 bg-background/50 rounded p-2">
                <span className="text-xs font-body">اتجاه توحيد الأرقام:</span>
                <Button
                  size="sm"
                  variant={numberMode === 'arabic' ? 'default' : 'outline'}
                  className="text-xs h-6"
                  onClick={() => setNumberMode('arabic')}
                >
                  ١٢٣ عربية
                </Button>
                <Button
                  size="sm"
                  variant={numberMode === 'western' ? 'default' : 'outline'}
                  className="text-xs h-6"
                  onClick={() => setNumberMode('western')}
                >
                  123 غربية
                </Button>
              </div>
            )}

            {/* ===== TYPO RESULTS ===== */}
            {typoResults && typoResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold font-display flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-orange-500" />
                      أخطاء إملائية — {typoResults.length} خطأ
                    </h4>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(typoCategoryCounts).map(([cat, count]) => (
                        <Badge key={cat} variant="outline" className="text-[10px] gap-0.5">
                          {typoCategoryLabels[cat]?.emoji} {typoCategoryLabels[cat]?.name} ({count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" variant="default" className="text-xs h-7 gap-1" onClick={handleApplyAllTypos}>
                    <CheckCircle2 className="w-3 h-3" /> إصلاح الكل
                  </Button>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-1.5">
                  {typoResults.slice(0, 100).map((typo, i) => (
                    <div key={`${typo.key}-${i}`} className="bg-background/40 rounded-lg p-2.5 space-y-1">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">
                            {typoCategoryLabels[typo.category]?.emoji} {typoCategoryLabels[typo.category]?.name}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{typo.reason}</span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="text-xs h-6 text-green-500" onClick={() => handleApplyTypo(typo)}>
                            ✓
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs h-6 text-destructive" onClick={() => handleRejectTypo(typo)}>
                            ✕
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm" dir="rtl">
                        <span className="bg-red-500/10 px-1.5 py-0.5 rounded text-red-600 line-through font-body">{typo.word}</span>
                        <span className="text-muted-foreground">←</span>
                        <span className="bg-green-500/10 px-1.5 py-0.5 rounded text-green-600 font-body">{typo.suggestion}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono truncate" dir="ltr">
                        {typo.key.split(':').slice(0, 2).join(':')}
                      </p>
                    </div>
                  ))}
                  {typoResults.length > 100 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      و {typoResults.length - 100} خطأ آخر...
                    </p>
                  )}
                </div>
              </div>
            )}

            {typoResults && typoResults.length === 0 && (
              <div className="flex items-center gap-2 justify-center py-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm font-display">لا توجد أخطاء إملائية ✨</span>
              </div>
            )}

            {/* ===== CLEANUP RESULTS ===== */}
            {!scanResults && !scanning && !typoResults && (
              <p className="text-xs text-muted-foreground text-center py-2">
                اضغط أحد الأزرار لفحص جميع الترجمات
              </p>
            )}

            {scanResults && scanResults.length === 0 && (
              <div className="flex items-center gap-2 justify-center py-3">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm font-display">لا توجد تعديلات مطلوبة ✨</span>
              </div>
            )}

            {scanResults && scanResults.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-body text-muted-foreground">
                    {scanResults.length} ترجمة تحتاج تنظيف
                  </span>
                  <Button size="sm" variant="default" className="text-xs h-7" onClick={handleApplyAll}>
                    <Wrench className="w-3 h-3 ml-1" /> تطبيق الكل ({scanResults.length})
                  </Button>
                </div>

                <div className="max-h-80 overflow-y-auto space-y-2">
                  {scanResults.slice(0, 50).map((result) => (
                    <div key={result.key} className="bg-background/40 rounded p-2 space-y-1">
                      <div className="flex items-start justify-between">
                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{result.label}</span>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="text-xs h-6 text-green-500" onClick={() => handleApplySingle(result)}>
                            ✓ قبول
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs h-6 text-destructive" onClick={() => handleReject(result.key)}>
                            ✕ رفض
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {result.types.map(t => (
                          <Badge key={t} variant="outline" className="text-[10px]">{TOOL_LABELS[t]?.emoji} {TOOL_LABELS[t]?.name}</Badge>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-red-500/10 rounded p-1.5 font-body" dir="rtl">
                          <span className="text-[10px] text-muted-foreground block mb-0.5">قبل:</span>
                          {result.before.slice(0, 100)}{result.before.length > 100 ? '...' : ''}
                        </div>
                        <div className="bg-green-500/10 rounded p-1.5 font-body" dir="rtl">
                          <span className="text-[10px] text-muted-foreground block mb-0.5">بعد:</span>
                          {result.after.slice(0, 100)}{result.after.length > 100 ? '...' : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  {scanResults.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      و {scanResults.length - 50} تعديل آخر...
                    </p>
                  )}
                </div>
              </>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
