import React, { useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Wrench, X } from "lucide-react";
import { ExtractedEntry, EditorState } from "@/components/editor/types";
import { useFeatureFlags } from "@/lib/feature-flags";

interface QualityIssue {
  key: string;
  entryLabel: string;
  original: string;
  translation: string;
  issues: { type: string; message: string; fix?: string }[];
}

interface QualityChecksPanelProps {
  state: EditorState;
  onApplyFix: (key: string, fixedText: string) => void;
  onFilterByKeys: (keys: Set<string>) => void;
  onNavigateToEntry?: (key: string) => void;
}

// === Check functions ===

function extractNumbers(text: string): string[] {
  return (text.match(/\d+/g) || []).sort();
}

function checkNumbers(original: string, translation: string): { type: string; message: string } | null {
  const origNums = extractNumbers(original);
  const transNums = extractNumbers(translation);
  if (origNums.length === 0) return null;
  const missing = origNums.filter(n => !transNums.includes(n));
  const extra = transNums.filter(n => !origNums.includes(n));
  if (missing.length > 0 || extra.length > 0) {
    const parts: string[] = [];
    if (missing.length) parts.push(`أرقام مفقودة: ${missing.join(', ')}`);
    if (extra.length) parts.push(`أرقام زائدة: ${extra.join(', ')}`);
    return { type: "number_check", message: `⚠️ ${parts.join(' | ')}` };
  }
  return null;
}

function extractVariables(text: string): string[] {
  return (text.match(/\{[^}]+\}/g) || []).sort();
}

function checkVariables(original: string, translation: string): { type: string; message: string } | null {
  const origVars = extractVariables(original);
  if (origVars.length === 0) return null;
  const transVars = extractVariables(translation);
  const missing = origVars.filter(v => !transVars.includes(v));
  const extra = transVars.filter(v => !origVars.includes(v));
  if (missing.length > 0 || extra.length > 0) {
    const parts: string[] = [];
    if (missing.length) parts.push(`متغيرات مفقودة: ${missing.join(', ')}`);
    if (extra.length) parts.push(`متغيرات زائدة: ${extra.join(', ')}`);
    return { type: "variable_check", message: `⚠️ ${parts.join(' | ')}` };
  }
  return null;
}

function checkExtraSpaces(translation: string): { type: string; message: string; fix?: string } | null {
  if (/  +/.test(translation)) {
    return {
      type: "extra_spaces_check",
      message: "مسافات مزدوجة في الترجمة",
      fix: translation.replace(/ {2,}/g, ' '),
    };
  }
  return null;
}

function checkRemainingEnglish(translation: string): { type: string; message: string } | null {
  // Strip tags, variables, control chars
  const stripped = translation
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g, '')
    .trim();
  if (!stripped) return null;
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(stripped);
  if (!hasArabic) return null; // pure english text is likely intentional
  const whitelist = new Set([
    'HP', 'MP', 'AP', 'TP', 'EXP', 'ATK', 'DEF', 'NPC', 'HUD', 'FPS', 'XP', 'DLC', 'UI', 'OK', 'NG',
    'NOAH', 'MIO', 'LANZ', 'SENA', 'TAION', 'EUNIE', 'RIKU', 'MANANA',
    'AIONIOS', 'KEVES', 'AGNUS', 'COLONY',
    'ARTS', 'TALENT', 'CHAIN', 'ATTACK', 'OUROBOROS', 'INTERLINK', 'BLADE', 'BLADES',
    'ZL', 'ZR', 'PLUS', 'MINUS',
  ]);
  const englishWords = stripped.match(/[a-zA-Z]{3,}/g) || [];
  const realEnglish = englishWords.filter(w => !whitelist.has(w.toUpperCase()));
  if (realEnglish.length > 0) {
    return {
      type: "remaining_english",
      message: `كلمات إنجليزية متبقية: ${realEnglish.slice(0, 5).join(', ')}${realEnglish.length > 5 ? '...' : ''}`,
    };
  }
  return null;
}

function checkLength(entry: ExtractedEntry, translation: string): { type: string; message: string } | null {
  if (!entry.original?.trim() || !translation?.trim()) return null;
  const origLen = entry.original.trim().length;
  const transLen = translation.trim().length;
  if (origLen < 5) return null;
  const ratio = transLen / origLen;
  if (ratio < 0.2) {
    return { type: "length_check", message: `الترجمة قصيرة جداً (${Math.round(ratio * 100)}% من الأصل)` };
  }
  if (ratio > 3.0) {
    return { type: "length_check", message: `الترجمة طويلة جداً (${Math.round(ratio * 100)}% من الأصل)` };
  }
  return null;
}

function checkPunctuation(original: string, translation: string): { type: string; message: string } | null {
  const origEnd = original.trim().slice(-1);
  const transEnd = translation.trim().slice(-1);
  // Map equivalent punctuation
  const equivMap: Record<string, string[]> = {
    '.': ['.', '。'],
    '!': ['!', '！'],
    '?': ['?', '？', '؟'],
    ':': [':'],
    ';': [';', '؛'],
  };
  if (equivMap[origEnd]) {
    const validEnds = equivMap[origEnd];
    if (!validEnds.includes(transEnd) && transEnd !== origEnd) {
      return { type: "punctuation_check", message: `علامة الترقيم النهائية مختلفة: "${origEnd}" → "${transEnd}"` };
    }
  }
  return null;
}

function checkRepetition(translation: string): { type: string; message: string } | null {
  const stripped = translation
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g, '')
    .trim();
  const words = stripped.split(/\s+/).filter(w => w.length > 2);
  if (words.length < 4) return null;
  // Check for consecutive repeated words (same word 3+ times)
  for (let i = 0; i < words.length - 2; i++) {
    if (words[i] === words[i + 1] && words[i] === words[i + 2]) {
      return { type: "repetition_check", message: `تكرار متتالي: "${words[i]}" ×3+` };
    }
  }
  // Check for high frequency of same word
  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }
  const stopWords = new Set(['في', 'من', 'إلى', 'على', 'مع', 'عن', 'أو', 'و', 'ثم', 'لا', 'لم', 'لن', 'قد', 'هو', 'هي', 'هذا', 'هذه', 'ذلك', 'تلك', 'ما', 'أن', 'إن', 'كان', 'كل', 'بعد', 'قبل', 'عند', 'حتى', 'بين', 'إذا', 'لكن']);
  for (const [word, count] of Object.entries(freq)) {
    if (stopWords.has(word)) continue;
    if (count >= 3 && count / words.length > 0.2) {
      return { type: "repetition_check", message: `تكرار مفرط: "${word}" (${count} مرات من ${words.length} كلمة)` };
    }
  }
  return null;
}

// Grammar check is a placeholder — flags obvious patterns
function checkGrammar(translation: string): { type: string; message: string } | null {
  const stripped = translation
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g, '')
    .trim();
  if (!stripped || stripped.length < 5) return null;
  // Check for common Arabic grammar issues
  // 1. Double ال (الال)
  if (/الال/.test(stripped)) {
    return { type: "grammar_check", message: 'خطأ نحوي محتمل: "الال" (تعريف مكرر)' };
  }
  // 2. ة followed by ة without space
  if (/ةة/.test(stripped)) {
    return { type: "grammar_check", message: 'خطأ محتمل: تاء مربوطة مكررة "ةة"' };
  }
  return null;
}

const CHECK_LABELS: Record<string, string> = {
  number_check: "🔢 فحص الأرقام",
  variable_check: "📎 فحص المتغيرات",
  extra_spaces_check: "⬜ مسافات زائدة",
  remaining_english: "🔤 نص إنجليزي متبقي",
  length_check: "📏 فحص الطول",
  punctuation_check: "❗ علامات الترقيم",
  repetition_check: "🔁 تكرار لغوي",
  grammar_check: "📝 قواعد نحوية",
};

export default function QualityChecksPanel({ state, onApplyFix, onFilterByKeys, onNavigateToEntry }: QualityChecksPanelProps) {
  const { isEnabled } = useFeatureFlags();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const results = useMemo(() => {
    const issues: QualityIssue[] = [];
    const typeCounts: Record<string, number> = {};

    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key]?.trim();
      if (!translation) continue;

      const entryIssues: { type: string; message: string; fix?: string }[] = [];

      if (isEnabled("number_check")) {
        const r = checkNumbers(entry.original, translation);
        if (r) entryIssues.push(r);
      }
      if (isEnabled("variable_check")) {
        const r = checkVariables(entry.original, translation);
        if (r) entryIssues.push(r);
      }
      if (isEnabled("extra_spaces_check")) {
        const r = checkExtraSpaces(translation);
        if (r) entryIssues.push(r);
      }
      if (isEnabled("remaining_english")) {
        const r = checkRemainingEnglish(translation);
        if (r) entryIssues.push(r);
      }
      if (isEnabled("length_check")) {
        const r = checkLength(entry, translation);
        if (r) entryIssues.push(r);
      }
      if (isEnabled("punctuation_check")) {
        const r = checkPunctuation(entry.original, translation);
        if (r) entryIssues.push(r);
      }
      if (isEnabled("repetition_check")) {
        const r = checkRepetition(translation);
        if (r) entryIssues.push(r);
      }
      if (isEnabled("grammar_check")) {
        const r = checkGrammar(translation);
        if (r) entryIssues.push(r);
      }

      if (entryIssues.length > 0) {
        issues.push({ key, entryLabel: entry.label, original: entry.original, translation, issues: entryIssues });
        for (const iss of entryIssues) {
          typeCounts[iss.type] = (typeCounts[iss.type] || 0) + 1;
        }
      }
    }

    return { issues, typeCounts };
  }, [state.entries, state.translations, isEnabled]);

  const handleFixAll = useCallback((type: string) => {
    for (const issue of results.issues) {
      for (const iss of issue.issues) {
        if (iss.type === type && iss.fix) {
          onApplyFix(issue.key, iss.fix);
        }
      }
    }
  }, [results.issues, onApplyFix]);

  // Check if any quality feature is enabled
  const anyEnabled = ["number_check", "variable_check", "extra_spaces_check", "remaining_english", "length_check", "punctuation_check", "repetition_check", "grammar_check"].some(id => isEnabled(id));
  if (!anyEnabled || dismissed) return null;

  const totalIssues = results.issues.length;
  if (totalIssues === 0 && !open) return null;

  const allIssueKeys = new Set(results.issues.map(i => i.key));

  const filteredIssues = activeFilter
    ? results.issues.filter(i => i.issues.some(iss => iss.type === activeFilter))
    : results.issues;

  const filteredKeys = new Set(filteredIssues.map(i => i.key));

  return (
    <Card className="mb-4 border-emerald-500/30 bg-emerald-500/5">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardContent className="p-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full text-right">
            <div className="flex items-center gap-2">
              {totalIssues > 0 ? (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              <span className="font-display font-bold text-sm">
                فحص الجودة المتقدم
              </span>
              {totalIssues > 0 && (
                <Badge variant="destructive" className="text-xs">{totalIssues} مشكلة</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {totalIssues > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); onFilterByKeys(activeFilter ? filteredKeys : allIssueKeys); }}>
                  فلترة {activeFilter ? CHECK_LABELS[activeFilter] : 'المشاكل'}
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={(e) => { e.stopPropagation(); setDismissed(true); }}>
                <X className="w-3 h-3" />
              </Button>
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3 space-y-2">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(results.typeCounts).map(([type, count]) => (
                <Badge
                  key={type}
                  variant={activeFilter === type ? "default" : "outline"}
                  className={`text-xs gap-1 cursor-pointer transition-colors ${activeFilter === type ? 'ring-2 ring-primary' : 'hover:bg-accent/20'}`}
                  onClick={() => setActiveFilter(activeFilter === type ? null : type)}
                >
                  {CHECK_LABELS[type] || type} <span className="font-bold">{count}</span>
                </Badge>
              ))}
              {activeFilter && (
                <Badge variant="outline" className="text-xs gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => setActiveFilter(null)}>
                  <X className="w-3 h-3" /> إلغاء الفلتر
                </Badge>
              )}
            </div>

            {/* Fixable types */}
            {results.typeCounts["extra_spaces_check"] && (
              <div className="flex items-center justify-between bg-background/50 rounded p-2">
                <span className="text-xs font-body">⬜ {results.typeCounts["extra_spaces_check"]} مسافات زائدة قابلة للإصلاح</span>
                <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => handleFixAll("extra_spaces_check")}>
                  <Wrench className="w-3 h-3 ml-1" /> إصلاح الكل
                </Button>
              </div>
            )}

            {/* Issue list */}
            <div className="max-h-80 overflow-y-auto space-y-2">
              {filteredIssues.slice(0, 50).map((issue) => (
                <div key={issue.key} className={`bg-background/40 rounded p-2 space-y-1 ${onNavigateToEntry ? 'cursor-pointer hover:bg-background/60 transition-colors' : ''}`} onClick={() => onNavigateToEntry?.(issue.key)}>
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{issue.entryLabel} {onNavigateToEntry && <span className="text-primary">← انتقل</span>}</span>
                    {issue.issues.some(i => i.fix) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-6 text-emerald-400"
                        onClick={() => {
                          const fix = issue.issues.find(i => i.fix)?.fix;
                          if (fix) onApplyFix(issue.key, fix);
                        }}
                      >
                        <Wrench className="w-3 h-3" /> إصلاح
                      </Button>
                    )}
                  </div>
                  {(activeFilter ? issue.issues.filter(iss => iss.type === activeFilter) : issue.issues).map((iss, i) => (
                    <p key={i} className="text-xs text-amber-300 font-body">{iss.message}</p>
                  ))}
                </div>
              ))}
              {filteredIssues.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  و {filteredIssues.length - 50} مشكلة أخرى...
                </p>
              )}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
