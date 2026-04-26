import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Sparkles, Loader2, Tag, BookOpen, Wrench, Copy, Eye, Check, X, Table2, Columns3, History, GitCompareArrows, Type, SplitSquareHorizontal, Languages, Scale, Gamepad2, ListOrdered, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TMSuggestion } from "@/hooks/useTranslationMemory";
import DebouncedInput from "./DebouncedInput";
import { ExtractedEntry, displayOriginal, hasArabicChars, isTechnicalText, hasTechnicalTags, previewTagRestore } from "./types";
import { diffTechnicalTags } from "@/lib/xc3-build-tag-guard";
import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";
import { hasOrphanLines, visualLength, splitEvenlyByLines } from "@/lib/balance-lines";
import { countEffectiveLines } from "@/lib/text-tokens";
import { processArabicText, hasArabicChars as hasArabicContent } from "@/lib/arabic-processing";
import { fixMixedBidi } from "@/lib/arabic-processing";
import { computeConfidence, detectLiteralTranslation } from "./TranslationProgressDashboard";

/** Classify a tag token for color-coding */
function getTagDisplayInfo(tag: string): { label: string; color: string; title: string } {
  // PUA characters (private use area — game engine icons/glyphs)
  if (/^[\uE000-\uE0FF]+$/.test(tag)) {
    const codes = [...tag].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
    return { label: `🎨 PUA ${codes}`, color: 'bg-purple-500/15 text-purple-400 border-purple-500/25', title: `رمز رسومي خاص: ${codes}` };
  }
  // Control characters (FFF9–FFFC: ruby/annotation)
  if (/^[\uFFF9-\uFFFC]$/.test(tag)) {
    const names: Record<number, string> = { 0xFFF9: 'ANCHOR', 0xFFFA: 'SEPARATOR', 0xFFFB: 'TERMINATOR', 0xFFFC: 'OBJ' };
    const code = tag.charCodeAt(0);
    const name = names[code] || `U+${code.toString(16).toUpperCase()}`;
    return { label: `⚙ ${name}`, color: 'bg-sky-500/15 text-sky-400 border-sky-500/25', title: `رمز تحكم: ${name}` };
  }
  // Brace tags {key} or {key:value}
  if (/^\{/.test(tag)) {
    const inner = tag.slice(1, -1);
    return { label: `📌 ${inner}`, color: 'bg-amber-500/15 text-amber-400 border-amber-500/25', title: `متغير: ${tag}` };
  }
  // Bracket tags — extract the tag name for display
  const bracketMatch = tag.match(/\\?\[\s*\/?\s*(\w+)\s*(?::([^\]]*?))?\\?\]/);
  if (bracketMatch) {
    const tagName = bracketMatch[1];
    const params = bracketMatch[2]?.trim();
    const numPrefix = tag.match(/^(\d+)\s*\\?\[/)?.[1];
    const numSuffix = tag.match(/\\?\]\s*(\d+)$/)?.[1];
    const num = numPrefix || numSuffix;
    const isClosing = /\\?\[\s*\//.test(tag);

    let color = 'bg-teal-500/15 text-teal-400 border-teal-500/25';
    const nameLower = tagName.toLowerCase();
    if (nameLower === 'xeno') color = 'bg-blue-500/15 text-blue-400 border-blue-500/25';
    else if (nameLower === 'ml') color = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
    else if (/^(passive|active|party|class|hero|gem|skill|art)/i.test(tagName)) color = 'bg-rose-500/15 text-rose-400 border-rose-500/25';

    let label = isClosing ? `/${tagName}` : tagName;
    if (params) {
      const paramShort = params.length > 20 ? params.slice(0, 18) + '…' : params;
      label += `:${paramShort}`;
    }
    if (num) label = `${num}[${label}]`;
    else label = `[${label}]`;

    return { label, color, title: `وسم تقني: ${tag}` };
  }
  // Simple uppercase bracket tags [XENO] etc.
  const simpleMatch = tag.match(/\\?\[\s*([A-Z]{2,10})\s*\\?\]/);
  if (simpleMatch) {
    return { label: `[${simpleMatch[1]}]`, color: 'bg-teal-500/15 text-teal-400 border-teal-500/25', title: `وسم: ${tag}` };
  }
  // [key=value] pattern
  if (/^\[.+=/.test(tag)) {
    return { label: tag.length > 25 ? tag.slice(0, 23) + '…]' : tag, color: 'bg-orange-500/15 text-orange-400 border-orange-500/25', title: `وسم: ${tag}` };
  }
  // Escaped bracket tags \[Name\]
  const escapedMatch = tag.match(/\\?\[\s*([A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*)\s*\\?\]/);
  if (escapedMatch) {
    return { label: `\\[${escapedMatch[1]}\\]`, color: 'bg-rose-500/15 text-rose-400 border-rose-500/25', title: `عبارة محمية: ${tag}` };
  }
  // Fallback
  return { label: tag.length > 20 ? tag.slice(0, 18) + '…' : tag, color: 'bg-accent/15 text-accent border-accent/25', title: `وسم تقني: ${tag}` };
}

/** Renders text with technical tags highlighted visually */
function HighlightedOriginal({ text }: { text: string }) {
  const tagPattern = /(\[\s*\w+\s*:[^\]]*?\](?:\s*\([^)]{1,100}\))?|\[\s*\w+\s*=\s*[^\]]*\]|\{\s*\w+\s*:\s*[^}]*\}|\{[\w]+\}|\d+\s*\[[A-Z]{2,10}\]|\[[A-Z]{2,10}\]\s*\d+|\\?\[\s*\/?\s*\w+\s*:[^\]]*?\\?\]|\d+\s*\\?\[\s*\w+\s*:[^\]]*?\\?\]|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]|[\uE000-\uE0FF]+|[\uFFF9-\uFFFC])/g;

  const lines = text.split('\n');

  const renderLine = (line: string, lineIdx: number) => {
    const parts = line.split(tagPattern);
    if (parts.length <= 1) {
      return <span key={lineIdx}>{displayOriginal(line)}</span>;
    }
    return (
      <span key={lineIdx}>
        {parts.map((part, i) => {
          if (tagPattern.test(part)) {
            const info = getTagDisplayInfo(part);
            return (
              <span
                key={i}
                className={`inline-flex items-center px-1 py-0.5 mx-0.5 rounded text-[11px] font-mono ${info.color} leading-tight`}
                dir="ltr"
                title={info.title}
              >
                {info.label}
              </span>
            );
          }
          return <span key={i}>{displayOriginal(part)}</span>;
        })}
      </span>
    );
  };

  if (lines.length <= 1) {
    return <span>{renderLine(text, 0)}</span>;
  }

  return (
    <span className="whitespace-pre-wrap">
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span className="inline-flex items-center mx-0.5 text-[10px] text-primary/50 select-none" title="فاصل سطر \n">↵{'\n'}</span>
          )}
          {renderLine(line, i)}
        </React.Fragment>
      ))}
    </span>
  );
}
import { toast } from "@/hooks/use-toast";
import { getEdgeFunctionUrl, getSupabaseHeaders } from "@/lib/supabase-edge";

interface EntryCardProps {
  entry: ExtractedEntry;
  translation: string;
  isProtected: boolean;
  hasProblem: boolean;
  isDamagedTag?: boolean;
  fuzzyScore?: number;
  isMobile: boolean;
  translatingSingle: string | null;
  improvingTranslations: boolean;
  previousTranslations: Record<string, string>;
  glossary?: string;
  isTranslationTooShort: (entry: ExtractedEntry, translation: string) => boolean;
  isTranslationTooLong: (entry: ExtractedEntry, translation: string) => boolean;
  hasStuckChars: (translation: string) => boolean;
  isMixedLanguage: (translation: string) => boolean;
  updateTranslation: (key: string, value: string) => void;
  handleTranslateSingle: (entry: ExtractedEntry) => void;
  handleImproveSingleTranslation: (entry: ExtractedEntry) => void;
  handleUndoTranslation: (key: string) => void;
  handleFixReversed: (entry: ExtractedEntry) => void;
  handleLocalFixDamagedTag?: (entry: ExtractedEntry) => void;
  onAcceptFuzzy?: (key: string) => void;
  onRejectFuzzy?: (key: string) => void;
  onCompare?: (entry: ExtractedEntry) => void;
  onSplitNewline?: (key: string) => void;
  tmSuggestions?: TMSuggestion[];
}

function findGlossaryMatches(original: string, glossary?: string): { term: string; translation: string }[] {
  if (!glossary?.trim() || !original?.trim()) return [];
  const origLower = original.toLowerCase();
  const matches: { term: string; translation: string }[] = [];
  for (const line of glossary.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const eng = trimmed.slice(0, eqIdx).trim();
    const arb = trimmed.slice(eqIdx + 1).trim();
    if (!eng || !arb) continue;
    // Word-boundary partial match (case-insensitive)
    const engLower = eng.toLowerCase();
    const regex = new RegExp(`\\b${engLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(origLower)) {
      matches.push({ term: eng, translation: arb });
    }
  }
  // Sort by term length descending (longer matches first)
  return matches.sort((a, b) => b.term.length - a.term.length).slice(0, 6);
}

const EntryCard: React.FC<EntryCardProps> = ({
  entry, translation, isProtected, hasProblem, isDamagedTag, fuzzyScore, isMobile,
  translatingSingle, improvingTranslations, previousTranslations, glossary,
  isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage,
  updateTranslation, handleTranslateSingle, handleImproveSingleTranslation,
  handleUndoTranslation, handleFixReversed, handleLocalFixDamagedTag,
  onAcceptFuzzy, onRejectFuzzy, onCompare, onSplitNewline, tmSuggestions,
}) => {
  const key = `${entry.msbtFile}:${entry.index}`;
  const isTech = isTechnicalText(entry.original);
  const [backTranslation, setBackTranslation] = useState<string | null>(null);
  const [backTranslating, setBackTranslating] = useState(false);
  const [showTagPreview, setShowTagPreview] = useState(false);
  const [balancePreview, setBalancePreview] = useState<string | null>(null);
  const [showGamePreview, setShowGamePreview] = useState(false);
  const [alternatives, setAlternatives] = useState<{ style: string; text: string; reason: string }[] | null>(null);
  const [fetchingAlternatives, setFetchingAlternatives] = useState(false);

  const tagPreview = useMemo(() => {
    if (!isDamagedTag || !translation?.trim()) return null;
    return previewTagRestore(entry.original, translation);
  }, [isDamagedTag, entry.original, translation]);

  const technicalDiff = useMemo(() => {
    if (!translation?.trim() || !hasTechnicalTags(entry.original)) return null;
    const diff = diffTechnicalTags(entry.original, translation);
    if (diff.exactTagMatch) return null;
    return diff;
  }, [entry.original, translation]);

  const handleCopyTags = () => {
    const charRegex = /[\uFFF9-\uFFFC\uE000-\uF8FF]/g;
    const tags = entry.original.match(charRegex);
    if (tags) {
      navigator.clipboard.writeText(tags.join('')).then(() => {
        toast({ title: "📋 تم النسخ", description: `تم نسخ ${tags.length} رمز تقني — الصقها في الترجمة يدوياً` });
      });
    }
  };

  const glossaryMatches = useMemo(
    () => findGlossaryMatches(entry.original, glossary),
    [entry.original, glossary]
  );

  const handleBackTranslate = async () => {
    if (!translation?.trim() || backTranslating) return;
    setBackTranslating(true);
    setBackTranslation(null);
    try {
      const { data, error } = await supabase.functions.invoke('translation-tools', {
        body: { text: translation, style: 'back-translate' },
      });
      if (error) throw error;
      setBackTranslation(data?.result || 'لم يتم الحصول على نتيجة');
    } catch (_e) {
      toast({ title: "خطأ", description: "فشل في الترجمة العكسية", variant: "destructive" });
    } finally {
      setBackTranslating(false);
    }
  };

  const handleQuickAlternatives = async () => {
    if (!translation?.trim() || fetchingAlternatives) return;
    setFetchingAlternatives(true);
    setAlternatives(null);
    try {
      const response = await fetch(getEdgeFunctionUrl("review-translations"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
        body: JSON.stringify({
          entries: [{ key, original: entry.original, translation, maxBytes: entry.maxBytes || 0 }],
          glossary,
          action: 'quick-alternatives',
        }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      setAlternatives(data.alternatives || []);
    } catch (_e) {
      toast({ title: "خطأ", description: "فشل في جلب البدائل", variant: "destructive" });
    } finally {
      setFetchingAlternatives(false);
    }
  };

  return (
    <Card data-entry-key={key} className={`p-3 md:p-4 border-border/50 hover:border-border transition-colors ${hasProblem ? 'border-destructive/30 bg-destructive/5' : ''}`}>
      <div className={`flex ${isMobile ? 'flex-col' : 'items-start'} gap-3 md:gap-4`}>
        <div className="flex-1 min-w-0">
          {/* Table & column context for BDAT entries */}
          {(() => {
            const match = entry.label.match(/^(.+?)\[(\d+)\]\.(.+)$/);
            if (match) {
              const [, tblName, rowIdx, colName] = match;
              return (
                <div className="flex flex-wrap items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/20">
                    <Table2 className="w-3 h-3" /> {tblName}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                    <Columns3 className="w-3 h-3" /> {colName}
                  </span>
                  <span className="text-muted-foreground/60">صف {rowIdx}</span>
                </div>
              );
            }
            return <p className="text-xs text-muted-foreground mb-1 truncate">{entry.msbtFile} • {entry.label}</p>;
          })()}
          <p className="font-body text-sm mb-2 break-words" dir="auto" style={{ unicodeBidi: 'isolate' }}><HighlightedOriginal text={entry.original} /></p>
          {hasTechnicalTags(entry.original) && (
            <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
              💡 الرموز الملونة (⚙ تحكم • 🎨 تنسيق • 📌 متغير) أكواد خاصة بمحرك اللعبة — <span className="font-semibold text-accent">لا تحذفها من الترجمة</span>
            </p>
          )}
          {isTech && <p className="text-xs text-accent mb-2">⚠️ نص تقني - تحتاج حذر في الترجمة</p>}
          {hasProblem && (
            <p className="text-xs text-destructive mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> يحتاج مراجعة
            </p>
          )}
          {/* Glossary hints */}
          {glossaryMatches.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mb-2">
              <BookOpen className="w-3 h-3 text-primary/60 shrink-0" />
              {glossaryMatches.map((m, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  {m.term} → {m.translation}
                </span>
              ))}
            </div>
          )}
          {entry.original.includes('\n') && (
            <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 mb-2">
              ↵ {entry.original.split('\n').length} أسطر في الأصل
            </span>
          )}
          {translation?.trim() && (() => {
            const confidence = computeConfidence(entry, translation);
            const isLiteral = detectLiteralTranslation(entry.original, translation);
            return (
              <div className="flex flex-wrap gap-1 mb-2">
                {/* Confidence badge */}
                <span className={`text-[10px] px-1.5 py-0.5 rounded border border-border/30 ${confidence.color} bg-background`}>
                  <Shield className="w-3 h-3 inline mr-0.5" />{confidence.score}% {confidence.label}
                </span>
                {isLiteral && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">📝 ترجمة حرفية محتملة</span>
                )}
                {isTranslationTooShort(entry, translation) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">📏 قصيرة جداً</span>
                )}
                {isTranslationTooLong(entry, translation) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">📐 تتجاوز الحد</span>
                )}
                {hasStuckChars(translation) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20">🔤 أحرف ملتصقة</span>
                )}
                {isMixedLanguage(translation) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20">🌐 لغة مختلطة</span>
                )}
                {translation && /[a-zA-Z]/.test(translation) && hasArabicContent(translation) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] px-2 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => {
                      const fixed = fixMixedBidi(translation);
                      if (fixed !== translation) updateTranslation(key, fixed);
                    }}
                    title="إصلاح اتجاه النص المختلط عربي-إنجليزي"
                  >
                    🌐 إصلاح الاتجاه ↩
                  </Button>
                )}
                {isDamagedTag && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">⚠️ رموز تالفة</span>
                )}
                {technicalDiff && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 font-semibold flex items-center gap-1">
                    🧷 رموز تقنية مختلفة
                    {technicalDiff.missingTags.length > 0 && ` (${technicalDiff.missingTags.length} مفقود)`}
                    {technicalDiff.extraTags.length > 0 && ` (${technicalDiff.extraTags.length} زائد)`}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 px-1 text-[10px] text-primary hover:bg-primary/10 ml-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        const fixed = restoreTagsLocally(entry.original, translation);
                        if (fixed !== translation) {
                          updateTranslation(key, fixed);
                          toast({ title: "🔧 إصلاح تلقائي", description: "تم إصلاح الرموز التقنية" });
                        } else {
                          updateTranslation(key, entry.original);
                          toast({ title: "↩️ استعادة", description: "لم يُصلح تلقائياً — تم استعادة الأصل" });
                        }
                      }}
                    >
                      إصلاح ⚡
                    </Button>
                  </span>
                )}
                {/* Corrupted $N variable warning */}
                {translation && /\$\d/.test(entry.original) && (
                  /دولار\s*\$?\d|(\d)\s*\.\s*\$|\$\s*\.\s*\d|\d+\s+دولار|\$\d+\.(?!\d)/.test(translation)
                ) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 font-semibold">
                    💲 متغير $N مترجم خطأ — سيُصلح تلقائياً عند البناء
                  </span>
                )}
                {/* Missing $N variable warning */}
                {translation && /\$\d/.test(entry.original) && (() => {
                  const origVars = (entry.original.match(/\$\d+/g) || []) as string[];
                  const transVars = (translation.match(/\$\d+/g) || []) as string[];
                  const missing = origVars.filter((v: string) => !transVars.includes(v));
                  if (missing.length === 0) return null;
                  return (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 font-semibold">
                      🚫 متغيرات مفقودة: {missing.join('، ')} — سيُستعاد النص الأصلي عند البناء
                    </span>
                  );
                })()}
                {/msg_(ask|cq|fev|nq|sq|tlk|tq)/i.test(key) && (() => {
                  const lines = translation.split('\n');
                  const lineCount = lines.length;
                  const maxLineLen = Math.max(...lines.map(l => visualLength(l)));
                  const warnings: string[] = [];
                  if (lineCount > 2) warnings.push(`${lineCount} أسطر`);
                  if (maxLineLen > 42) warnings.push(`طول ${maxLineLen}`);
                  if (warnings.length === 0) return null;
                  return (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> NPC: {warnings.join(' • ')}
                    </span>
                  );
                })()}
                {fuzzyScore != null && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${fuzzyScore >= 80 ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : fuzzyScore >= 70 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-orange-500/10 text-orange-600 border-orange-500/20'}`}>
                    🔍 مطابقة جزئية {fuzzyScore}%
                  </span>
                )}
                {fuzzyScore != null && onAcceptFuzzy && onRejectFuzzy && (
                  <>
                    <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-emerald-600 hover:bg-emerald-500/10" onClick={() => onAcceptFuzzy(key)}>
                      <Check className="w-3 h-3" /> قبول
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-destructive hover:bg-destructive/10" onClick={() => onRejectFuzzy(key)}>
                      <X className="w-3 h-3" /> رفض
                    </Button>
                  </>
                )}
              </div>
            );
          })()}
          {hasArabicChars(entry.original) && (!translation || translation === entry.original) && (
            <Button variant="ghost" size="sm" onClick={() => handleFixReversed(entry)} className="text-xs text-accent mb-2 h-7 px-2">
              <RotateCcw className="w-3 h-3" /> تصحيح المعكوس
            </Button>
          )}
          <div className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-2`}>
            <div className="flex-1 w-full min-w-0">
              <DebouncedInput
                value={translation}
                onChange={(val) => updateTranslation(key, val)}
                placeholder="أدخل الترجمة..."
                className="flex-1 w-full px-3 py-2 rounded bg-background border border-border font-body text-sm"
                multiline
              />
              {translation?.trim() && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 px-1" dir="ltr">
                  {translation.split('\n').map((line, i, arr) => {
                    const vLen = visualLength(line);
                    return (
                      <span
                        key={i}
                        className={`text-[10px] font-mono ${vLen > 42 ? 'text-destructive' : vLen > 37 ? 'text-amber-500' : 'text-muted-foreground/60'}`}
                      >
                        {arr.length > 1 ? `L${i + 1}:` : ''}{vLen}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleTranslateSingle(entry)} disabled={translatingSingle === key} title="ترجمة هذا النص">
                {translatingSingle === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
              </Button>
              {onCompare && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => onCompare(entry)} title="مقارنة المحركات الثلاثة">
                  <GitCompareArrows className="w-4 h-4 text-accent" />
                </Button>
              )}
              {translation?.trim() && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleBackTranslate} disabled={backTranslating} title="ترجمة عكسية — تحقق من دقة الترجمة">
                  {backTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4 text-accent" />}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleImproveSingleTranslation(entry)} disabled={improvingTranslations || !translation?.trim()} title="تحسين هذه الترجمة">
                {improvingTranslations ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-secondary" />}
              </Button>
              {translation?.trim() && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleQuickAlternatives} disabled={fetchingAlternatives} title="📝 3 بدائل فورية">
                  {fetchingAlternatives ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListOrdered className="w-4 h-4 text-primary" />}
                </Button>
              )}
              {translation?.trim() && /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/.test(translation) && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => {
                  const cleaned = translation.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '');
                  updateTranslation(key, cleaned);
                }} title="إزالة التشكيلات">
                  <Type className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
              {onSplitNewline && translation?.trim() && !translation.includes('\n') && translation.length > 42 && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => onSplitNewline(key)} title="تقسيم النص إلى أسطر">
                  <SplitSquareHorizontal className="w-4 h-4 text-primary" />
                </Button>
              )}
              {translation?.trim() && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => {
                  const englishLineCount = countEffectiveLines(entry.original);
                  const balanced = englishLineCount > 1
                    ? splitEvenlyByLines(translation, englishLineCount)
                    : translation.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
                  if (balanced !== translation) {
                    setBalancePreview(balanced);
                  } else {
                    toast({ title: "⚖️ متوازن", description: "النص متوازن بالفعل" });
                  }
                }} title="⚖️ إعادة توازن الأسطر">
                  <Scale className={`w-4 h-4 ${hasOrphanLines(translation) ? 'text-destructive' : 'text-accent'}`} />
                </Button>
              )}
              {translation?.trim() && hasArabicContent(translation) && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setShowGamePreview(prev => !prev)} title="🎮 معاينة كما ستظهر في اللعبة">
                  <Gamepad2 className={`w-4 h-4 ${showGamePreview ? 'text-primary' : 'text-muted-foreground'}`} />
                </Button>
              )}
              {isDamagedTag && handleLocalFixDamagedTag && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setShowTagPreview(prev => !prev)} title="👁 معاينة الإصلاح قبل التطبيق">
                  <Eye className="w-4 h-4 text-accent" />
                </Button>
              )}
              {isDamagedTag && handleLocalFixDamagedTag && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleLocalFixDamagedTag(entry)} title="🔧 إصلاح الرموز محلياً (بدون AI)">
                  <Wrench className="w-4 h-4 text-destructive" />
                </Button>
              )}
              {isDamagedTag && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleCopyTags} title="📋 نسخ الرموز التقنية من الأصل">
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
              {isDamagedTag && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleTranslateSingle(entry)} disabled={translatingSingle === key} title="🤖 إعادة ترجمة بالـ AI">
                  {translatingSingle === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-destructive" />}
                </Button>
              )}
              {previousTranslations[key] !== undefined && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleUndoTranslation(key)} title="تراجع عن التعديل">
                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
          {/* Game preview */}
          {showGamePreview && translation?.trim() && (
            <div className="mt-2 p-3 rounded-lg border border-primary/30 bg-primary/5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-primary font-semibold font-display">
                  <Gamepad2 className="w-3.5 h-3.5" /> معاينة كما في اللعبة
                </span>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => setShowGamePreview(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <div className="bg-black/90 rounded-md p-3 border border-primary/10">
                {translation.split('\n').map((line, i) => (
                  <p key={i} dir="ltr" className="text-white font-body text-sm leading-relaxed tracking-wide" style={{ unicodeBidi: 'bidi-override', fontFeatureSettings: '"liga" 0' }}>
                    {processArabicText(line)}
                  </p>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                ⓘ هذه محاكاة تقريبية — النتيجة الفعلية تعتمد على خط اللعبة
              </p>
            </div>
          )}
          {/* Tag restore preview */}
          {showTagPreview && tagPreview?.hasDiff && (
            <div className="mt-2 p-2 rounded border border-accent/30 bg-accent/5 text-xs space-y-1.5">
              <p className="font-semibold text-accent">👁 معاينة الإصلاح:</p>
              <div className="space-y-1">
                <div className="flex gap-2 items-start">
                  <span className="text-destructive shrink-0">قبل:</span>
                  <span dir="rtl" className="break-words">{displayOriginal(tagPreview.before)}</span>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-primary shrink-0">بعد:</span>
                  <span dir="rtl" className="break-words">{displayOriginal(tagPreview.after)}</span>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="default" className="h-6 text-[10px] px-2" onClick={() => { handleLocalFixDamagedTag?.(entry); setShowTagPreview(false); }}>
                  <Check className="w-3 h-3 ml-1" /> تطبيق
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setShowTagPreview(false)}>
                  <X className="w-3 h-3 ml-1" /> إغلاق
                </Button>
              </div>
            </div>
          )}
          {/* Balance lines preview */}
          {balancePreview && (
            <div className="mt-2 p-2 rounded border border-accent/30 bg-accent/5 text-xs space-y-1.5">
              <p className="font-semibold text-accent">⚖️ معاينة توازن الأسطر:</p>
              <div className="space-y-1">
                <div className="flex gap-2 items-start">
                  <span className="text-destructive shrink-0">قبل:</span>
                  <pre dir="rtl" className="break-words whitespace-pre-wrap text-foreground font-body">{translation}</pre>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-primary shrink-0">بعد:</span>
                  <pre dir="rtl" className="break-words whitespace-pre-wrap text-foreground font-body">{balancePreview}</pre>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="default" className="h-6 text-[10px] px-2" onClick={() => { updateTranslation(key, balancePreview); setBalancePreview(null); }}>
                  <Check className="w-3 h-3 ml-1" /> تطبيق
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setBalancePreview(null)}>
                  <X className="w-3 h-3 ml-1" /> إغلاق
                </Button>
              </div>
            </div>
          )}
          {/* Back-translation result */}
          {backTranslation && (
            <div className="mt-2 p-2 rounded border border-accent/20 bg-accent/5 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-accent font-semibold">
                  <Languages className="w-3.5 h-3.5" /> ترجمة عكسية
                </span>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => setBackTranslation(null)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <p dir="ltr" className="text-foreground break-words">{backTranslation}</p>
            </div>
          )}
          {/* Quick Alternatives */}
          {alternatives && alternatives.length > 0 && (
            <div className="mt-2 p-2 rounded border border-primary/20 bg-primary/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                  <ListOrdered className="w-3.5 h-3.5" /> بدائل مقترحة
                </span>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => setAlternatives(null)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
              {alternatives.map((alt, i) => {
                const styleEmoji = alt.style === 'natural' ? '💬' : alt.style === 'concise' ? '✂️' : '📚';
                const styleLabel = alt.style === 'natural' ? 'طبيعي' : alt.style === 'concise' ? 'مختصر' : 'أدبي';
                return (
                  <div key={i} className="flex items-start gap-2 text-[11px] group">
                    <span className="shrink-0 px-1 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 text-[10px]">
                      {styleEmoji} {styleLabel}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground font-body" dir="rtl">{alt.text}</p>
                      {alt.reason && <p className="text-[10px] text-muted-foreground mt-0.5">{alt.reason}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:bg-primary/10 shrink-0"
                      onClick={() => { updateTranslation(key, alt.text); setAlternatives(null); }}
                      title="استخدام هذا البديل"
                    >
                      استخدام
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Translation Memory Suggestions */}
          {tmSuggestions && tmSuggestions.length > 0 && (
            <div className="mt-2 p-2 rounded border border-secondary/20 bg-secondary/5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-secondary font-semibold">
                <History className="w-3.5 h-3.5" />
                <span>اقتراحات من ذاكرة الترجمة</span>
              </div>
              {tmSuggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] group">
                  <span className="shrink-0 px-1 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/20 text-[10px]">
                    {s.similarity}%
                  </span>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-muted-foreground truncate" title={s.original}>{s.original}</p>
                    <p className="text-foreground font-body truncate" dir="rtl" title={s.translation}>{s.translation}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-secondary hover:bg-secondary/10 shrink-0"
                    onClick={() => updateTranslation(key, s.translation)}
                    title="استخدام هذه الترجمة"
                  >
                    استخدام
                  </Button>
                </div>
              ))}
            </div>
          )}
          {/* Byte usage progress bar — uses UTF-8 to match max_utf8_bytes from parser/inspector */}
          {entry.maxBytes > 0 && translation && (() => {
            const byteUsed = new TextEncoder().encode(translation).length;
            const ratio = byteUsed / entry.maxBytes;
            const pct = Math.round(ratio * 100);
            const barWidth = Math.min(ratio * 100, 100);
            const isOver = ratio > 1;
            const isWarn = !isOver && ratio > 0.85;
            const barColor = isOver
              ? 'bg-destructive'
              : isWarn
              ? 'bg-amber-500'
              : ratio > 0.6
              ? 'bg-primary'
              : 'bg-emerald-500';
            return (
              <div className={`mt-1.5 rounded p-1.5 transition-colors ${isOver ? 'bg-destructive/10 border border-destructive/30' : isWarn ? 'bg-amber-500/10 border border-amber-500/20' : ''}`}>
                <div className="flex justify-between items-center text-[10px] mb-1 gap-2">
                  <span className="text-muted-foreground font-mono">{byteUsed}/{entry.maxBytes} بايت</span>
                  <div className="flex items-center gap-1.5">
                    {isOver && (
                      <span className="flex items-center gap-0.5 font-bold text-destructive animate-pulse">
                        <AlertTriangle className="w-3 h-3" /> تجاوز الحد!
                      </span>
                    )}
                    {isWarn && !isOver && (
                      <span className="flex items-center gap-0.5 font-bold text-amber-600">
                        <AlertTriangle className="w-3 h-3" /> اقتربت من الحد
                      </span>
                    )}
                    <span className={`font-bold tabular-nums ${isOver ? 'text-destructive' : isWarn ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {pct}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor} rounded-full transition-all duration-300 ${isOver ? 'animate-pulse' : ''}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                {isOver && (
                  <p className="text-[10px] text-destructive mt-1">
                    تجاوز بـ {byteUsed - entry.maxBytes} بايت — قصّر الترجمة لتجنب تلف اللعبة
                  </p>
                )}
              </div>
            );
          })()}
        </div>
        {!isMobile && (
          <div className="flex flex-col gap-1 items-center">
            {isProtected && <Tag className="w-5 h-5 text-accent" />}
          </div>
        )}
      </div>
    </Card>
  );
};

export default React.memo(EntryCard);
