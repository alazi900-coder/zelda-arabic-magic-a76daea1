import React, { useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Wrench, X, Sparkles, Search, Loader2, Check, RefreshCw } from "lucide-react";
import { ExtractedEntry, EditorState } from "@/components/editor/types";
import { useFeatureFlags } from "@/lib/feature-flags";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
  glossary?: string;
}

// === Check functions ===

function extractNumbers(text: string): string[] {
  return (text.match(/\d+/g) || []).sort();
}

function checkNumbers(original: string, translation: string): { type: string; message: string; fix?: string } | null {
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
  const stripped = translation
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g, '')
    .trim();
  if (!stripped) return null;
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(stripped);
  if (!hasArabic) return null;
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

function checkPunctuation(original: string, translation: string): { type: string; message: string; fix?: string } | null {
  const origEnd = original.trim().slice(-1);
  const transEnd = translation.trim().slice(-1);
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
      // Auto-fix: append the correct punctuation
      const arabicEquiv: Record<string, string> = { '?': '؟', ';': '؛' };
      const fixChar = arabicEquiv[origEnd] || origEnd;
      const trimmed = translation.trim();
      const fix = /[.!?؟؛:،]$/.test(trimmed)
        ? trimmed.slice(0, -1) + fixChar
        : trimmed + fixChar;
      return { type: "punctuation_check", message: `علامة الترقيم النهائية مختلفة: "${origEnd}" → "${transEnd}"`, fix };
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
  for (let i = 0; i < words.length - 2; i++) {
    if (words[i] === words[i + 1] && words[i] === words[i + 2]) {
      return { type: "repetition_check", message: `تكرار متتالي: "${words[i]}" ×3+` };
    }
  }
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

function checkGrammar(translation: string): { type: string; message: string } | null {
  const stripped = translation
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g, '')
    .trim();
  if (!stripped || stripped.length < 5) return null;
  if (/الال/.test(stripped)) {
    return { type: "grammar_check", message: 'خطأ نحوي محتمل: "الال" (تعريف مكرر)' };
  }
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

// Types that can be auto-fixed without AI
const FIXABLE_TYPES = new Set(["extra_spaces_check", "punctuation_check"]);

export default function QualityChecksPanel({ state, onApplyFix, onFilterByKeys, onNavigateToEntry, glossary }: QualityChecksPanelProps) {
  const { isEnabled } = useFeatureFlags();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  
  // AI features state
  const [aiFixing, setAiFixing] = useState<Record<string, boolean>>({});
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string>>({});
  const [contextChecking, setContextChecking] = useState(false);
  const [contextResults, setContextResults] = useState<Array<{ key: string; issues: string[]; suggestion?: string }>>([]);
  const [batchImproving, setBatchImproving] = useState(false);
  const [improveResults, setImproveResults] = useState<Record<string, string>>({});
  const [improvementStyle, setImprovementStyle] = useState<string>('natural');
  const [autoFixRunning, setAutoFixRunning] = useState(false);
  const [autoFixProgress, setAutoFixProgress] = useState('');

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

  // === Feature 1: Batch fix by type ===
  const handleFixAll = useCallback((type: string) => {
    let fixCount = 0;
    for (const issue of results.issues) {
      for (const iss of issue.issues) {
        if (iss.type === type && iss.fix) {
          onApplyFix(issue.key, iss.fix);
          fixCount++;
        }
      }
    }
    if (fixCount > 0) {
      toast({ title: "✅ تم الإصلاح", description: `تم إصلاح ${fixCount} مشكلة من نوع ${CHECK_LABELS[type] || type}` });
    }
  }, [results.issues, onApplyFix]);

  // === Comprehensive Auto-Fix: fix all auto-fixable, then AI for the rest ===
  const handleComprehensiveFix = useCallback(async () => {
    setAutoFixRunning(true);
    
    // Step 1: Apply all auto-fixes
    let autoFixed = 0;
    const remainingIssues: QualityIssue[] = [];
    
    setAutoFixProgress('⚡ تطبيق الإصلاحات التلقائية...');
    for (const issue of results.issues) {
      const fixableIss = issue.issues.filter(i => i.fix);
      if (fixableIss.length > 0) {
        // Apply the first available fix
        onApplyFix(issue.key, fixableIss[0].fix!);
        autoFixed++;
        // If there are remaining non-fixable issues, queue for AI
        const nonFixable = issue.issues.filter(i => !i.fix);
        if (nonFixable.length > 0) {
          remainingIssues.push({ ...issue, issues: nonFixable });
        }
      } else {
        remainingIssues.push(issue);
      }
    }

    toast({ title: "⚡ إصلاح تلقائي", description: `تم إصلاح ${autoFixed} مشكلة تلقائياً` });

    // Step 2: Request AI fixes for remaining (max 10 at a time)
    if (remainingIssues.length > 0 && isEnabled("ai_fix_suggest")) {
      const batch = remainingIssues.slice(0, 10);
      setAutoFixProgress(`🤖 طلب اقتراحات AI لـ ${batch.length} مشكلة متبقية...`);
      
      let aiCount = 0;
      for (const issue of batch) {
        try {
          const issueDescriptions = issue.issues.map(i => i.message).join('\n');
          const { data, error } = await supabase.functions.invoke('translation-tools', {
            body: {
              style: 'ai-fix',
              original: issue.original,
              translation: issue.translation,
              issues: issueDescriptions,
            },
          });
          if (!error && data?.result) {
            setAiSuggestions(prev => ({ ...prev, [issue.key]: data.result }));
            aiCount++;
          }
        } catch { /* skip failed */ }
        setAutoFixProgress(`🤖 اقتراحات AI: ${aiCount}/${batch.length}...`);
      }
      
      toast({ title: "🤖 اقتراحات AI", description: `${aiCount} اقتراح جاهز للمراجعة${remainingIssues.length > 10 ? ` (${remainingIssues.length - 10} مشكلة أخرى)` : ''}` });
    }

    setAutoFixProgress('');
    setAutoFixRunning(false);
  }, [results.issues, onApplyFix, isEnabled]);

  // === Feature 2: AI Fix suggestion ===
  const handleAiFix = useCallback(async (issue: QualityIssue) => {
    setAiFixing(prev => ({ ...prev, [issue.key]: true }));
    try {
      const issueDescriptions = issue.issues.map(i => i.message).join('\n');
      const { data, error } = await supabase.functions.invoke('translation-tools', {
        body: {
          style: 'ai-fix',
          original: issue.original,
          translation: issue.translation,
          issues: issueDescriptions,
        },
      });
      if (error) throw error;
      if (data?.result) {
        setAiSuggestions(prev => ({ ...prev, [issue.key]: data.result }));
      }
    } catch (e) {
      toast({ title: "خطأ", description: "فشل في الحصول على اقتراح AI", variant: "destructive" });
    } finally {
      setAiFixing(prev => ({ ...prev, [issue.key]: false }));
    }
  }, []);

  // === Feature 3: Context check ===
  const handleContextCheck = useCallback(async () => {
    const issuesToCheck = (activeFilter ? results.issues.filter(i => i.issues.some(iss => iss.type === activeFilter)) : results.issues).slice(0, 20);
    if (issuesToCheck.length === 0) return;
    setContextChecking(true);
    setContextResults([]);
    try {
      const entries = issuesToCheck.map(i => ({
        key: i.key,
        original: i.original,
        translation: i.translation,
      }));
      const { data, error } = await supabase.functions.invoke('translation-tools', {
        body: { style: 'context-check', entries, glossary: glossary?.slice(0, 3000) },
      });
      if (error) throw error;
      if (data?.result) {
        try {
          const parsed = JSON.parse(data.result.replace(/```json\n?|```/g, ''));
          setContextResults(Array.isArray(parsed) ? parsed : []);
          toast({ title: "✅ تم الفحص السياقي", description: `تم فحص ${entries.length} نص — ${parsed.length} مشكلة سياقية` });
        } catch {
          toast({ title: "تحذير", description: "تعذر تحليل نتائج الفحص السياقي", variant: "destructive" });
        }
      }
    } catch (e) {
      toast({ title: "خطأ", description: "فشل الفحص السياقي", variant: "destructive" });
    } finally {
      setContextChecking(false);
    }
  }, [results.issues, activeFilter, glossary]);

  // === Feature 4: Batch improve ===
  const handleBatchImprove = useCallback(async () => {
    const toImprove = (activeFilter ? results.issues.filter(i => i.issues.some(iss => iss.type === activeFilter)) : results.issues).slice(0, 15);
    if (toImprove.length === 0) return;
    setBatchImproving(true);
    setImproveResults({});
    try {
      const entries = toImprove.map(i => ({
        key: i.key,
        original: i.original,
        translation: i.translation,
      }));
      const { data, error } = await supabase.functions.invoke('translation-tools', {
        body: { style: 'batch-improve', entries, improvementStyle, glossary: glossary?.slice(0, 3000) },
      });
      if (error) throw error;
      if (data?.result) {
        try {
          const parsed = JSON.parse(data.result.replace(/```json\n?|```/g, ''));
          if (Array.isArray(parsed)) {
            const map: Record<string, string> = {};
            for (const item of parsed) {
              if (item.key && item.improved) map[item.key] = item.improved;
            }
            setImproveResults(map);
            toast({ title: "✅ تم التحسين", description: `${Object.keys(map).length} ترجمة محسّنة جاهزة للمراجعة` });
          }
        } catch {
          toast({ title: "تحذير", description: "تعذر تحليل نتائج التحسين", variant: "destructive" });
        }
      }
    } catch (e) {
      toast({ title: "خطأ", description: "فشل تحسين الصياغة", variant: "destructive" });
    } finally {
      setBatchImproving(false);
    }
  }, [results.issues, activeFilter, improvementStyle, glossary]);

  const applyAllImproved = useCallback(() => {
    let count = 0;
    for (const [key, improved] of Object.entries(improveResults)) {
      onApplyFix(key, improved);
      count++;
    }
    setImproveResults({});
    toast({ title: "✅ تم التطبيق", description: `تم تطبيق ${count} تحسين` });
  }, [improveResults, onApplyFix]);

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

  // Count fixable issues by type
  const fixableByType: Record<string, number> = {};
  for (const issue of results.issues) {
    for (const iss of issue.issues) {
      if (iss.fix) {
        fixableByType[iss.type] = (fixableByType[iss.type] || 0) + 1;
      }
    }
  }

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

            {/* === Comprehensive Auto-Fix Button === */}
            {totalIssues > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded p-2 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <span className="text-xs font-bold text-primary">🔧 الإصلاح الشامل</span>
                    <p className="text-[10px] text-muted-foreground">يطبق كل الإصلاحات التلقائية ثم يطلب اقتراحات AI للمشاكل المتبقية</p>
                    {autoFixProgress && <p className="text-[10px] text-primary mt-1">{autoFixProgress}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    className="text-xs h-8 gap-1"
                    onClick={handleComprehensiveFix}
                    disabled={autoFixRunning}
                  >
                    {autoFixRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    إصلاح شامل
                  </Button>
                </div>
              </div>
            )}

            {/* === Feature 1: Batch fix buttons per type === */}
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(fixableByType).map(([type, count]) => (
                <Button key={type} size="sm" variant="secondary" className="text-xs h-7 gap-1" onClick={() => handleFixAll(type)}>
                  <Wrench className="w-3 h-3" /> إصلاح كل {CHECK_LABELS[type] || type} ({count})
                </Button>
              ))}
            </div>

            {/* === Feature 3 & 4: AI Action Buttons === */}
            <div className="flex flex-wrap gap-2 mb-3">
              {isEnabled("context_check") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 gap-1 border-primary/30 text-primary"
                  onClick={handleContextCheck}
                  disabled={contextChecking}
                >
                  {contextChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  فحص سياقي ({Math.min(filteredIssues.length, 20)} نص)
                </Button>
              )}
              {isEnabled("batch_improve") && (
                <div className="flex items-center gap-1">
                  <select
                    className="text-xs h-7 rounded border border-border bg-background px-2"
                    value={improvementStyle}
                    onChange={(e) => setImprovementStyle(e.target.value)}
                  >
                    <option value="natural">طبيعي</option>
                    <option value="formal">رسمي</option>
                    <option value="concise">مختصر</option>
                    <option value="expressive">تعبيري</option>
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 gap-1 border-accent/30 text-accent"
                    onClick={handleBatchImprove}
                    disabled={batchImproving}
                  >
                    {batchImproving ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    تحسين الصياغة ({Math.min(filteredIssues.length, 15)} نص)
                  </Button>
                </div>
              )}
            </div>

            {/* === Feature 3: Context check results === */}
            {contextResults.length > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded p-2 mb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary">🎮 نتائج الفحص السياقي ({contextResults.length} مشكلة)</span>
                  <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setContextResults([])}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                {contextResults.map((cr, idx) => (
                  <div key={idx} className="bg-background/40 rounded p-2 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted-foreground truncate max-w-[200px]">{cr.key}</span>
                      {onNavigateToEntry && (
                        <Button size="sm" variant="ghost" className="text-xs h-5 text-primary" onClick={() => onNavigateToEntry(cr.key)}>
                          ← انتقل
                        </Button>
                      )}
                    </div>
                    {cr.issues.map((iss, i) => (
                      <p key={i} className="text-amber-400">⚠️ {iss}</p>
                    ))}
                    {cr.suggestion && (
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-emerald-400 flex-1" dir="rtl">💡 {cr.suggestion}</p>
                        <Button size="sm" variant="ghost" className="text-xs h-5 text-emerald-400" onClick={() => { onApplyFix(cr.key, cr.suggestion!); setContextResults(prev => prev.filter((_, i) => i !== idx)); }}>
                          <Check className="w-3 h-3" /> تطبيق
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* === Feature 4: Batch improve results === */}
            {Object.keys(improveResults).length > 0 && (
              <div className="bg-accent/5 border border-accent/20 rounded p-2 mb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-accent">✍️ تحسينات الصياغة ({Object.keys(improveResults).length})</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" className="text-xs h-6 gap-1" onClick={applyAllImproved}>
                      <Check className="w-3 h-3" /> تطبيق الكل
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setImproveResults({})}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                {Object.entries(improveResults).map(([key, improved]) => {
                  const original = results.issues.find(i => i.key === key);
                  return (
                    <div key={key} className="bg-background/40 rounded p-2 text-xs space-y-1">
                      <span className="font-mono text-muted-foreground">{original?.entryLabel || key}</span>
                      <p className="text-muted-foreground line-through" dir="rtl">{original?.translation}</p>
                      <p className="text-accent" dir="rtl">{improved}</p>
                      <div className="flex gap-1 mt-1">
                        <Button size="sm" variant="ghost" className="text-xs h-5 text-emerald-400" onClick={() => { onApplyFix(key, improved); setImproveResults(prev => { const n = { ...prev }; delete n[key]; return n; }); }}>
                          <Check className="w-3 h-3" /> قبول
                        </Button>
                        <Button size="sm" variant="ghost" className="text-xs h-5 text-destructive" onClick={() => setImproveResults(prev => { const n = { ...prev }; delete n[key]; return n; })}>
                          <X className="w-3 h-3" /> رفض
                        </Button>
                        {onNavigateToEntry && (
                          <Button size="sm" variant="ghost" className="text-xs h-5 text-primary" onClick={() => onNavigateToEntry(key)}>
                            ← انتقل
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Issue list */}
            <div className="max-h-80 overflow-y-auto space-y-2">
              {filteredIssues.slice(0, 50).map((issue) => (
                <div key={issue.key} className={`bg-background/40 rounded p-2 space-y-1 ${onNavigateToEntry ? 'cursor-pointer hover:bg-background/60 transition-colors' : ''}`}>
                  <div className="flex items-start justify-between">
                    <span
                      className="text-xs font-mono text-muted-foreground truncate max-w-[200px] hover:text-primary cursor-pointer"
                      onClick={() => onNavigateToEntry?.(issue.key)}
                    >
                      {issue.entryLabel} {onNavigateToEntry && <span className="text-primary">← انتقل</span>}
                    </span>
                    <div className="flex gap-1">
                      {/* Auto-fix button */}
                      {issue.issues.some(i => i.fix) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-6 text-emerald-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            const fix = issue.issues.find(i => i.fix)?.fix;
                            if (fix) onApplyFix(issue.key, fix);
                          }}
                        >
                          <Wrench className="w-3 h-3" /> إصلاح
                        </Button>
                      )}
                      {/* === Feature 2: AI Fix button === */}
                      {isEnabled("ai_fix_suggest") && !issue.issues.every(i => i.fix) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-6 text-primary"
                          onClick={(e) => { e.stopPropagation(); handleAiFix(issue); }}
                          disabled={aiFixing[issue.key]}
                        >
                          {aiFixing[issue.key] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          إصلاح AI
                        </Button>
                      )}
                    </div>
                  </div>
                  {(activeFilter ? issue.issues.filter(iss => iss.type === activeFilter) : issue.issues).map((iss, i) => (
                    <p key={i} className="text-xs text-amber-300 font-body">{iss.message}</p>
                  ))}
                  {/* AI suggestion display */}
                  {aiSuggestions[issue.key] && (
                    <div className="mt-1 bg-primary/5 border border-primary/20 rounded p-2 space-y-1">
                      <p className="text-xs text-primary" dir="rtl">💡 {aiSuggestions[issue.key]}</p>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="text-xs h-5 text-emerald-400" onClick={(e) => { e.stopPropagation(); onApplyFix(issue.key, aiSuggestions[issue.key]); setAiSuggestions(prev => { const n = { ...prev }; delete n[issue.key]; return n; }); }}>
                          <Check className="w-3 h-3" /> قبول
                        </Button>
                        <Button size="sm" variant="ghost" className="text-xs h-5 text-destructive" onClick={(e) => { e.stopPropagation(); setAiSuggestions(prev => { const n = { ...prev }; delete n[issue.key]; return n; }); }}>
                          <X className="w-3 h-3" /> رفض
                        </Button>
                      </div>
                    </div>
                  )}
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
