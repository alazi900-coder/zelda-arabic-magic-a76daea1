import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, AlertTriangle, BookOpen, BarChart3, TrendingUp, Zap } from "lucide-react";
import type { EditorState, ExtractedEntry } from "./types";
import { hasTechnicalTags, isTechnicalText, categorizeFile, categorizeBdatTable, categorizeDanganronpaFile } from "./types";

export interface QualityStats {
  tooLong: number;
  nearLimit: number;
  missingTags: number;
  placeholderMismatch: number;
  total: number;
  problemKeys: Set<string>;
  damagedTags: number;
  damagedTagKeys: Set<string>;
  missingTagKeys: Set<string>;
}

interface Props {
  state: EditorState;
  qualityStats: QualityStats | null;
  glossarySessionStats: { directMatches: number; lockedTerms: number; contextTerms: number; batchesCompleted: number; totalBatches: number; textsTranslated: number; freeTranslations: number };
  aiRequestsToday: number;
  aiRequestsMonth: number;
}

/** Compute translation confidence for a single entry */
export function computeConfidence(entry: ExtractedEntry, translation: string, glossaryMap?: Map<string, string>): { score: number; label: string; color: string } {
  if (!translation?.trim()) return { score: 0, label: "غير مترجم", color: "text-muted-foreground" };

  let score = 50; // base

  // Length ratio check
  const origLen = entry.original.length;
  const transLen = translation.length;
  const ratio = transLen / Math.max(origLen, 1);
  if (ratio >= 0.3 && ratio <= 3.0) score += 15;
  else if (ratio < 0.15 || ratio > 5.0) score -= 20;

  // Tag integrity
  if (hasTechnicalTags(entry.original)) {
    const origTagCount = (entry.original.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || []).length;
    const transTagCount = (translation.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || []).length;
    if (origTagCount === transTagCount) score += 15;
    else score -= 25;
  } else {
    score += 10; // No tags = no risk
  }

  // Contains Arabic
  if (/[\u0600-\u06FF]/.test(translation)) score += 10;
  else score -= 30;

  // Glossary compliance (if glossary available)
  if (glossaryMap && glossaryMap.size > 0) {
    const origLower = entry.original.toLowerCase();
    let matchedTerms = 0, totalTerms = 0;
    for (const [eng, arb] of glossaryMap) {
      if (eng.length < 3) continue;
      if (origLower.includes(eng)) {
        totalTerms++;
        if (translation.includes(arb)) matchedTerms++;
      }
    }
    if (totalTerms > 0) {
      score += Math.round((matchedTerms / totalTerms) * 15);
    }
  }

  // Byte overflow penalty
  if (entry.maxBytes > 0) {
    const bytes = new TextEncoder().encode(translation).length;
    if (bytes > entry.maxBytes) score -= 20;
  }

  // Line count sync
  const origLines = entry.original.split('\n').length;
  const transLines = translation.split('\n').length;
  if (origLines === transLines) score += 5;

  score = Math.max(0, Math.min(100, score));

  if (score >= 85) return { score, label: "ممتازة", color: "text-emerald-500" };
  if (score >= 65) return { score, label: "جيدة", color: "text-primary" };
  if (score >= 45) return { score, label: "مقبولة", color: "text-amber-500" };
  return { score, label: "ضعيفة", color: "text-destructive" };
}

/** Detect likely literal translations */
export function detectLiteralTranslation(original: string, translation: string, englishRatioThreshold = 0.4): boolean {
  return analyzeLiteralTranslation(original, translation).englishRatio > englishRatioThreshold
    && analyzeLiteralTranslation(original, translation).totalWords > 3;
}

/** Returns the actual english-word ratio + counts so the UI can show *why* an entry was flagged. */
export function analyzeLiteralTranslation(original: string, translation: string): {
  englishWords: number;
  totalWords: number;
  englishRatio: number;
} {
  if (!original?.trim() || !translation?.trim()) {
    return { englishWords: 0, totalWords: 0, englishRatio: 0 };
  }
  const transWords = translation.split(/\s+/).filter(Boolean);
  let englishWords = 0;
  for (const w of transWords) {
    if (/^[a-zA-Z]{3,}$/.test(w) && !/^(TAG|NEWLINE|NPC|HP|AP|SP|CP|TP|EXP|ATK|DEF|DPS|AOE|UI|HUD|QTE|DLC|LV|MAX|KO)$/i.test(w)) {
      englishWords++;
    }
  }
  const totalWords = transWords.length;
  const englishRatio = totalWords > 0 ? englishWords / totalWords : 0;
  return { englishWords, totalWords, englishRatio };
}

/** Detect same English text translated differently across entries */
export function detectInconsistencies(state: EditorState): { english: string; translations: { key: string; translation: string }[] }[] {
  const groups = new Map<string, { key: string; translation: string }[]>();
  
  for (const entry of state.entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    const trans = state.translations[key]?.trim();
    if (!trans) continue;
    
    const norm = entry.original.trim().toLowerCase();
    if (norm.length < 3) continue;
    
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm)!.push({ key, translation: trans });
  }
  
  const inconsistencies: { english: string; translations: { key: string; translation: string }[] }[] = [];
  for (const [english, entries] of groups) {
    if (entries.length < 2) continue;
    const uniqueTranslations = new Set(entries.map(e => e.translation));
    if (uniqueTranslations.size > 1) {
      inconsistencies.push({ english, translations: entries });
    }
  }
  
  return inconsistencies.sort((a, b) => b.translations.length - a.translations.length);
}

export default function TranslationProgressDashboard({ state, qualityStats, glossarySessionStats, aiRequestsToday, aiRequestsMonth }: Props) {
  const stats = useMemo(() => {
    const total = state.entries.length;
    const translated = Object.values(state.translations).filter(v => v?.trim()).length;
    const untranslated = total - translated;
    const percentage = total > 0 ? Math.round((translated / total) * 100) : 0;
    
    // Category breakdown
    const categories = new Map<string, { total: number; translated: number }>();
    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const isBdat = /^.+?\[\d+\]\./.test(entry.label);
      const isDr = !isBdat && entry.msbtFile.includes(':') && !entry.msbtFile.startsWith('bdat');
      const cat = isBdat
        ? categorizeBdatTable(entry.label, entry.msbtFile.includes(':') ? entry.msbtFile.split(':')[1] : undefined, entry.original)
        : isDr ? categorizeDanganronpaFile(entry.msbtFile) : categorizeFile(entry.msbtFile);
      
      if (!categories.has(cat)) categories.set(cat, { total: 0, translated: 0 });
      const c = categories.get(cat)!;
      c.total++;
      if (state.translations[key]?.trim()) c.translated++;
    }
    
    const technical = state.entries.filter(e => isTechnicalText(e.original)).length;
    const withTags = state.entries.filter(e => hasTechnicalTags(e.original)).length;
    
    return { total, translated, untranslated, percentage, categories, technical, withTags };
  }, [state.entries, state.translations]);

  const topCategories = useMemo(() => {
    return Array.from(stats.categories.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 6);
  }, [stats.categories]);

  return (
    <div className="space-y-3">
      {/* Main progress */}
      <Card className="p-4 border-border/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-primary" /> تقدم الترجمة
          </h3>
          <span className="text-2xl font-bold text-primary">{stats.percentage}%</span>
        </div>
        <Progress value={stats.percentage} className="h-3 mb-3" />
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded bg-primary/10 border border-primary/20">
            <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-primary" />
            <div className="font-bold text-primary">{stats.translated}</div>
            <div className="text-muted-foreground">مترجم</div>
          </div>
          <div className="p-2 rounded bg-accent/10 border border-accent/20">
            <Clock className="w-4 h-4 mx-auto mb-1 text-accent" />
            <div className="font-bold text-accent">{stats.untranslated}</div>
            <div className="text-muted-foreground">متبقي</div>
          </div>
          <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-destructive" />
            <div className="font-bold text-destructive">{qualityStats?.problemKeys.size || 0}</div>
            <div className="text-muted-foreground">مشاكل</div>
          </div>
        </div>
      </Card>

      {/* Category breakdown */}
      <Card className="p-3 border-border/50">
        <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-secondary" /> تقدم الفئات
        </h4>
        <div className="space-y-2">
          {topCategories.map(([cat, data]) => {
            const pct = data.total > 0 ? Math.round((data.translated / data.total) * 100) : 0;
            return (
              <div key={cat} className="space-y-0.5">
                <div className="flex justify-between text-[11px]">
                  <span className="truncate text-foreground">{cat}</span>
                  <span className="text-muted-foreground shrink-0">{data.translated}/{data.total} ({pct}%)</span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            );
          })}
        </div>
      </Card>

      {/* AI usage stats */}
      <Card className="p-3 border-border/50">
        <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-accent" /> إحصائيات الجلسة
        </h4>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">طلبات AI اليوم:</span>
            <span className="font-bold text-accent">{aiRequestsToday}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">هذا الشهر:</span>
            <span className="font-bold text-accent">{aiRequestsMonth}</span>
          </div>
          {glossarySessionStats.freeTranslations > 0 && (
            <div className="flex items-center gap-1.5 col-span-2">
              <BookOpen className="w-3 h-3 text-primary" />
              <span className="text-muted-foreground">ترجمات مجانية:</span>
              <span className="font-bold text-primary">{glossarySessionStats.freeTranslations}</span>
            </div>
          )}
          {glossarySessionStats.lockedTerms > 0 && (
            <div className="flex items-center gap-1.5 col-span-2">
              <span className="text-muted-foreground">🔒 مصطلحات مقفلة:</span>
              <span className="font-bold">{glossarySessionStats.lockedTerms}</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
