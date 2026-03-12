import React, { useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Wrench, CheckCircle2, X, Sparkles } from "lucide-react";
import { EditorState } from "@/components/editor/types";



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
  let quoteStack: string[] = [];
  
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

  const handleScan = useCallback(() => {
    setScanning(true);
    // Use setTimeout to not block UI
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
        if (isEnabled("alef_fix")) {
          const after = fixMissingAlef(cleaned);
          if (after !== cleaned) { appliedTypes.push("alef_fix"); cleaned = after; }
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

  // Check if any cleanup feature is enabled
  const anyEnabled = ["hamza_unify", "quote_fix", "number_unify", "invisible_chars", "question_mark_fix", "unicode_fix", "alef_fix"].some(id => isEnabled(id));
  if (!anyEnabled || dismissed) return null;

  const enabledTools = Object.keys(TOOL_LABELS).filter(id => isEnabled(id));

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
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="text-xs h-7"
                onClick={(e) => { e.stopPropagation(); handleScan(); }}
                disabled={scanning}
              >
                {scanning ? (
                  <><Sparkles className="w-3 h-3 animate-spin" /> جاري الفحص...</>
                ) : (
                  <><Sparkles className="w-3 h-3" /> فحص وتنظيف</>
                )}
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={(e) => { e.stopPropagation(); setDismissed(true); }}>
                <X className="w-3 h-3" />
              </Button>
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3 space-y-3">
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

            {/* No results yet */}
            {!scanResults && !scanning && (
              <p className="text-xs text-muted-foreground text-center py-2">
                اضغط "فحص وتنظيف" لمسح جميع الترجمات وتطبيق أدوات التنظيف المفعّلة
              </p>
            )}

            {/* Results */}
            {scanResults && scanResults.length === 0 && (
              <div className="flex items-center gap-2 justify-center py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
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
                          <Button size="sm" variant="ghost" className="text-xs h-6 text-emerald-400" onClick={() => handleApplySingle(result)}>
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
                        ))
                        }
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-destructive/10 rounded p-1.5 font-body" dir="rtl">
                          <span className="text-[10px] text-muted-foreground block mb-0.5">قبل:</span>
                          {result.before.slice(0, 100)}{result.before.length > 100 ? '...' : ''}
                        </div>
                        <div className="bg-emerald-500/10 rounded p-1.5 font-body" dir="rtl">
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
