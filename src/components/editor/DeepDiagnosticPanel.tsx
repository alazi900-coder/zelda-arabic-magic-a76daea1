import React, { useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Search, Loader2, Copy, Filter } from "lucide-react";
import { ExtractedEntry, EditorState, hasTechnicalTags } from "@/components/editor/types";
import { hasArabicPresentationForms } from "@/lib/arabic-processing";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

type Severity = "critical" | "warning" | "info";

interface DiagnosticIssue {
  key: string;
  label: string;
  original: string;
  translation: string;
  severity: Severity;
  category: string;
  message: string;
  fix?: string;
}

interface DiagnosticCategory {
  id: string;
  label: string;
  icon: string;
  severity: Severity;
  description: string;
}

const CATEGORIES: DiagnosticCategory[] = [
  { id: "control_chars", label: "رموز تحكم مفقودة", icon: "⛔", severity: "critical", description: "رموز تحكم (U+FFF9-FFFC) مفقودة من الترجمة — تسبب توقف اللعبة وخلل الرسوميات" },
  { id: "pua_chars", label: "رموز خاصة مفقودة", icon: "🔴", severity: "critical", description: "رموز المنطقة الخاصة (U+E000-E0FF) مفقودة — تتحكم بالأيقونات والألوان" },
  { id: "byte_overflow", label: "تجاوز حد البايت", icon: "📏", severity: "critical", description: "الترجمة تتجاوز الحد الأقصى للبايتات — تُفسد جدول النصوص" },
  { id: "double_shaped", label: "معالجة عربية مزدوجة", icon: "🔄", severity: "critical", description: "نص معالج مرتين (Double Reshaping) — يظهر مقلوب ومفكك في اللعبة" },
  { id: "null_char", label: "رمز NULL داخل النص", icon: "💀", severity: "critical", description: "وجود \\0 (NULL) وسط النص — يقطع النص فوراً ويسبب تجمّد المحرك" },
  { id: "unmatched_ruby", label: "وسم Ruby غير مغلق", icon: "🔓", severity: "critical", description: "وسم [System:Ruby] بدون إغلاق [/System:Ruby] أو العكس — يعلّق محرك الرسائل" },
  { id: "broken_tag_syntax", label: "وسم بصيغة تالفة", icon: "🧩", severity: "critical", description: "وسم [...] مفتوح بدون إغلاق أو أقواس متداخلة خاطئة — يتجمّد المحلل" },
  { id: "control_extra", label: "رموز تحكم زائدة", icon: "⚠️", severity: "critical", description: "رموز تحكم في الترجمة أكثر من الأصل — تُربك محرك الرسائل" },
  { id: "invisible_chars", label: "أحرف غير مرئية مشبوهة", icon: "👻", severity: "warning", description: "أحرف Unicode غير مرئية (ZWJ, ZWNJ, BOM, إلخ) قد تُربك المحرك" },
  { id: "tag_mismatch", label: "وسوم [Tag] مفقودة", icon: "🏷️", severity: "warning", description: "وسوم [System:...] أو [/...] مفقودة — قد تسبب خلل في العرض" },
  { id: "placeholder_mismatch", label: "عناصر نائبة مفقودة", icon: "⬛", severity: "warning", description: "رموز \uFFFC نائبة مفقودة — قد تسبب خلل في الواجهة" },
  { id: "newline_mismatch", label: "فرق كبير بعدد الأسطر", icon: "📄", severity: "warning", description: "عدد الأسطر في الترجمة يختلف كثيراً عن الأصل — قد يكسر صندوق الحوار" },
  { id: "empty_translation", label: "ترجمة فارغة/مسافات فقط", icon: "🫥", severity: "warning", description: "ترجمة تحتوي مسافات أو أحرف غير مرئية فقط" },
  { id: "identical_to_original", label: "ترجمة مطابقة للأصل", icon: "📋", severity: "info", description: "النص لم يُترجم (مطابق للنص الإنجليزي)" },
];

// ═══════════════════════════════════════════════════
// Detection functions
// ═══════════════════════════════════════════════════

const RE_CONTROL = /[\uFFF9\uFFFA\uFFFB\uFFFC]/g;
const RE_PUA = /[\uE000-\uE0FF]/g;
const RE_TAG = /\[[^\]]*\]/g;
const RE_PLACEHOLDER = /\uFFFC/g;
const RE_PRESENTATION_B = /[\uFE70-\uFEFF]/;
const RE_PRESENTATION_A = /[\uFB50-\uFDFF]/;
const RE_ARABIC_STANDARD = /[\u0600-\u06FF]/;
const RE_NULL_CHAR = /\x00/;
const RE_INVISIBLE = /[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2060\u2061\u2062\u2063\u2064\uFEFF\u00AD\u034F\u061C\u180E]/g;
const RE_RUBY_OPEN = /\[\s*System\s*:\s*Ruby[^\]]*\]/gi;
const RE_RUBY_CLOSE = /\[\s*\/\s*System\s*:\s*Ruby[^\]]*\]/gi;
const RE_BRACKET_OPEN = /\[/g;
const RE_BRACKET_CLOSE = /\]/g;
const encoder = new TextEncoder();

function countMatches(text: string, re: RegExp): number {
  re.lastIndex = 0;
  return (text.match(re) || []).length;
}

function getMatches(text: string, re: RegExp): string[] {
  re.lastIndex = 0;
  return text.match(re) || [];
}

function detectIssues(entry: ExtractedEntry, translation: string): DiagnosticIssue[] {
  const key = `${entry.msbtFile}:${entry.index}`;
  const trimmed = translation.trim();
  const issues: DiagnosticIssue[] = [];
  const base = { key, label: entry.label, original: entry.original, translation };

  // 1. Control characters missing (CRITICAL - causes crashes)
  const origControl = countMatches(entry.original, RE_CONTROL);
  const transControl = countMatches(trimmed, RE_CONTROL);
  if (origControl > 0 && transControl < origControl) {
    issues.push({
      ...base,
      severity: "critical",
      category: "control_chars",
      message: `${origControl - transControl} رمز تحكم مفقود من أصل ${origControl} (U+FFF9-FFFC)`,
    });
  }

  // 2. PUA characters missing (CRITICAL - icons/colors)
  const origPua = countMatches(entry.original, RE_PUA);
  const transPua = countMatches(trimmed, RE_PUA);
  if (origPua > 0 && transPua < origPua) {
    issues.push({
      ...base,
      severity: "critical",
      category: "pua_chars",
      message: `${origPua - transPua} رمز خاص مفقود من أصل ${origPua} (U+E000-E0FF)`,
    });
  }

  // 3. Byte overflow (CRITICAL - corrupts string table)
  if (entry.maxBytes > 0) {
    const byteLen = encoder.encode(trimmed).length;
    if (byteLen > entry.maxBytes) {
      issues.push({
        ...base,
        severity: "critical",
        category: "byte_overflow",
        message: `${byteLen} بايت من حد أقصى ${entry.maxBytes} (تجاوز ${byteLen - entry.maxBytes} بايت)`,
      });
    }
  }

  // 4. Double-shaped Arabic (CRITICAL - text appears reversed/broken)
  if (RE_PRESENTATION_B.test(trimmed) || RE_PRESENTATION_A.test(trimmed)) {
    if (RE_ARABIC_STANDARD.test(trimmed)) {
      // Has BOTH standard Arabic AND presentation forms = double shaped
      issues.push({
        ...base,
        severity: "critical",
        category: "double_shaped",
        message: "النص يحتوي حروف عربية عادية ومعالجة في نفس الوقت — معالجة مزدوجة",
      });
    }
  }

  // 5. NULL character inside text (CRITICAL - truncates string, freezes engine)
  if (RE_NULL_CHAR.test(trimmed)) {
    issues.push({
      ...base,
      severity: "critical",
      category: "null_char",
      message: "يحتوي رمز NULL (\\0) — يقطع النص ويسبب تجمّد المحرك",
    });
  }

  // 6. Unmatched Ruby tags (CRITICAL - hangs message parser)
  const rubyOpens = countMatches(trimmed, RE_RUBY_OPEN);
  const rubyCloses = countMatches(trimmed, RE_RUBY_CLOSE);
  if (rubyOpens !== rubyCloses) {
    issues.push({
      ...base,
      severity: "critical",
      category: "unmatched_ruby",
      message: `${rubyOpens} فتح [System:Ruby] مقابل ${rubyCloses} إغلاق [/System:Ruby] — غير متطابقة`,
    });
  }

  // 7. Broken bracket syntax (CRITICAL - parser hang)
  const bracketOpens = countMatches(trimmed, RE_BRACKET_OPEN);
  const bracketCloses = countMatches(trimmed, RE_BRACKET_CLOSE);
  if (bracketOpens !== bracketCloses) {
    issues.push({
      ...base,
      severity: "critical",
      category: "broken_tag_syntax",
      message: `${bracketOpens} قوس '[' مقابل ${bracketCloses} قوس ']' — أقواس غير متوازنة`,
    });
  }

  // 8. Extra control characters (more than original - confuses engine)
  if (transControl > origControl && origControl > 0) {
    issues.push({
      ...base,
      severity: "critical",
      category: "control_extra",
      message: `${transControl - origControl} رمز تحكم زائد (${transControl} في الترجمة مقابل ${origControl} في الأصل)`,
    });
  }

  // 9. Invisible/suspicious Unicode characters
  const invisibleMatches = getMatches(trimmed, RE_INVISIBLE);
  if (invisibleMatches.length > 0) {
    const codepoints = invisibleMatches.slice(0, 5).map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);
    issues.push({
      ...base,
      severity: "warning",
      category: "invisible_chars",
      message: `${invisibleMatches.length} حرف غير مرئي: ${codepoints.join(', ')}${invisibleMatches.length > 5 ? '...' : ''}`,
    });
  }

  // 5 (orig). Tag mismatch [System:...] etc
  const origTags = getMatches(entry.original, RE_TAG);
  if (origTags.length > 0) {
    const missingTags = origTags.filter(t => !trimmed.includes(t));
    if (missingTags.length > 0) {
      issues.push({
        ...base,
        severity: "warning",
        category: "tag_mismatch",
        message: `${missingTags.length} وسم مفقود: ${missingTags.slice(0, 3).join(', ')}${missingTags.length > 3 ? '...' : ''}`,
      });
    }
  }

  // 6 (orig). Placeholder mismatch
  const origPh = countMatches(entry.original, RE_PLACEHOLDER);
  const transPh = countMatches(trimmed, RE_PLACEHOLDER);
  if (origPh > 0 && origPh !== transPh) {
    issues.push({
      ...base,
      severity: "warning",
      category: "placeholder_mismatch",
      message: `${origPh} عنصر نائب في الأصل، ${transPh} في الترجمة`,
    });
  }

  // 10. Newline count mismatch (warning)
  const origNewlines = (entry.original.match(/\n/g) || []).length;
  const transNewlines = (trimmed.match(/\n/g) || []).length;
  if (origNewlines > 0 && Math.abs(transNewlines - origNewlines) >= 2) {
    issues.push({
      ...base,
      severity: "warning",
      category: "newline_mismatch",
      message: `${origNewlines} سطر في الأصل مقابل ${transNewlines} في الترجمة (فرق ${Math.abs(transNewlines - origNewlines)})`,
    });
  }

  // 7 (orig). Empty/whitespace only
  if (translation.length > 0 && trimmed.length === 0) {
    issues.push({
      ...base,
      severity: "warning",
      category: "empty_translation",
      message: "الترجمة تحتوي مسافات أو أحرف غير مرئية فقط",
    });
  }

  // 8 (orig). Identical to original (info)
  if (trimmed === entry.original.trim() && trimmed.length > 6) {
    issues.push({
      ...base,
      severity: "info",
      category: "identical_to_original",
      message: "النص مطابق للأصل الإنجليزي (لم يُترجم)",
    });
  }

  return issues;
}

// ═══════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════

interface DeepDiagnosticPanelProps {
  state: EditorState;
  onNavigateToEntry?: (key: string) => void;
  onApplyFix?: (key: string, fixedText: string) => void;
  onFilterByKeys?: (keys: Set<string>) => void;
}

export default function DeepDiagnosticPanel({ state, onNavigateToEntry, onApplyFix, onFilterByKeys }: DeepDiagnosticPanelProps) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [issues, setIssues] = useState<DiagnosticIssue[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const runScan = useCallback(() => {
    setScanning(true);
    setScanned(false);
    setActiveFilter(null);

    // Use setTimeout to avoid blocking UI
    setTimeout(() => {
      const allIssues: DiagnosticIssue[] = [];
      for (const entry of state.entries) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const translation = state.translations[key];
        if (!translation) continue;
        const entryIssues = detectIssues(entry, translation);
        allIssues.push(...entryIssues);
      }
      setIssues(allIssues);
      setScanning(false);
      setScanned(true);
    }, 50);
  }, [state.entries, state.translations]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of CATEGORIES) counts[cat.id] = 0;
    for (const issue of issues) {
      counts[issue.category] = (counts[issue.category] || 0) + 1;
    }
    return counts;
  }, [issues]);

  const severityCounts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 };
    for (const issue of issues) c[issue.severity]++;
    return c;
  }, [issues]);

  const filteredIssues = useMemo(() => {
    if (!activeFilter) return issues;
    return issues.filter(i => i.category === activeFilter);
  }, [issues, activeFilter]);

  const handleFilterInEditor = useCallback((categoryId: string) => {
    const keys = new Set(issues.filter(i => i.category === categoryId).map(i => i.key));
    if (keys.size > 0 && onFilterByKeys) {
      onFilterByKeys(keys);
      toast({ title: "🔍 تصفية", description: `عرض ${keys.size} نص في المحرر` });
    }
  }, [issues, onFilterByKeys]);

  const handleRestoreTags = useCallback((issue: DiagnosticIssue) => {
    if (!onApplyFix) return;
    // For control_chars and pua_chars: copy missing chars from original
    const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === issue.key);
    if (!entry) return;

    let fixed = issue.translation;
    
    if (issue.category === "control_chars" || issue.category === "pua_chars") {
      const re = issue.category === "control_chars" ? RE_CONTROL : RE_PUA;
      const origChars = getMatches(entry.original, re);
      const transChars = getMatches(fixed, re);
      
      // Find which specific characters are missing
      const transCopy = [...transChars];
      const missing: { char: string; origIndex: number }[] = [];
      
      for (let i = 0; i < origChars.length; i++) {
        const idx = transCopy.indexOf(origChars[i]);
        if (idx !== -1) {
          transCopy.splice(idx, 1);
        } else {
          missing.push({ char: origChars[i], origIndex: i });
        }
      }
      
      // Strategy: use original text structure, replace only the translatable parts
      // This is safest — use original as base and inject translated content
      onApplyFix(issue.key, entry.original); // Reset to original as safe fallback
      toast({ title: "↩️ استعادة", description: "تم استعادة النص الأصلي كإجراء آمن" });
      return;
    }

    if (issue.category === "empty_translation") {
      // Remove empty translation
      onApplyFix(issue.key, "");
      return;
    }

    onApplyFix(issue.key, entry.original);
    toast({ title: "↩️ استعادة النص الأصلي" });
  }, [state.entries, onApplyFix]);

  const criticalCount = severityCounts.critical;
  const warningCount = severityCounts.warning;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Card className="cursor-pointer hover:bg-muted/30 transition-colors border-destructive/30">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              <span className="font-display font-bold text-sm">فحص عميق للمشاكل الحرجة</span>
              {scanned && (
                <>
                  {criticalCount > 0 && (
                    <Badge variant="destructive" className="text-xs">{criticalCount} حرج</Badge>
                  )}
                  {warningCount > 0 && (
                    <Badge className="text-xs bg-yellow-600">{warningCount} تحذير</Badge>
                  )}
                  {criticalCount === 0 && warningCount === 0 && (
                    <Badge className="text-xs bg-secondary">✅ سليم</Badge>
                  )}
                </>
              )}
            </div>
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </CardContent>
        </Card>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <Card className="mt-1 border-destructive/20">
          <CardContent className="p-3 space-y-3">
            {/* Scan button */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={runScan}
                disabled={scanning}
                className="font-display font-bold"
              >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Search className="w-4 h-4 ml-1" />}
                {scanning ? "جاري الفحص..." : "فحص شامل"}
              </Button>
              {scanned && (
                <span className="text-xs text-muted-foreground">
                  فُحص {state.entries.length} نص — وُجدت {issues.length} مشكلة
                </span>
              )}
            </div>

            {scanned && issues.length > 0 && (
              <>
                {/* Summary */}
                <div className={`p-3 rounded-lg border ${
                  criticalCount > 0 ? 'bg-destructive/10 border-destructive/30' :
                  warningCount > 0 ? 'bg-yellow-500/10 border-yellow-500/30' :
                  'bg-secondary/10 border-secondary/30'
                }`}>
                  <p className="text-sm font-display font-bold mb-2">
                    {criticalCount > 0 
                      ? `⛔ ${criticalCount} مشكلة حرجة ستسبب مشاكل في اللعبة!`
                      : `⚠️ ${warningCount} تحذير — قد تؤثر على جودة العرض`
                    }
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {CATEGORIES.map(cat => {
                      const count = categoryCounts[cat.id];
                      if (count === 0) return null;
                      return (
                        <Badge
                          key={cat.id}
                          variant={cat.severity === "critical" ? "destructive" : "outline"}
                          className={`text-xs cursor-pointer ${activeFilter === cat.id ? 'ring-2 ring-primary' : ''} ${
                            cat.severity === "warning" ? 'border-yellow-500 text-yellow-400' : ''
                          }`}
                          onClick={() => setActiveFilter(activeFilter === cat.id ? null : cat.id)}
                        >
                          {cat.icon} {cat.label}: {count}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Category details */}
                {activeFilter && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {CATEGORIES.find(c => c.id === activeFilter)?.description}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => handleFilterInEditor(activeFilter)}
                      >
                        <Filter className="w-3 h-3 ml-1" />
                        عرض في المحرر
                      </Button>
                    </div>

                    <ScrollArea className="max-h-64" dir="rtl">
                      <div className="space-y-1">
                        {filteredIssues.slice(0, 100).map((issue, i) => (
                          <div
                            key={`${issue.key}-${i}`}
                            className={`p-2 rounded text-xs border ${
                              issue.severity === "critical" ? "bg-destructive/5 border-destructive/20" :
                              issue.severity === "warning" ? "bg-yellow-500/5 border-yellow-500/20" :
                              "bg-muted/20 border-border/50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-mono text-[10px] text-muted-foreground truncate">{issue.label}</p>
                                <p className="text-foreground mt-0.5">{issue.message}</p>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                {onNavigateToEntry && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => onNavigateToEntry(issue.key)}
                                    title="انتقل للنص"
                                  >
                                    🔍
                                  </Button>
                                )}
                                {onApplyFix && (
                                  issue.category === "control_chars" || issue.category === "pua_chars" || 
                                  issue.category === "empty_translation" || issue.category === "null_char" ||
                                  issue.category === "unmatched_ruby" || issue.category === "broken_tag_syntax" ||
                                  issue.category === "control_extra"
                                ) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => handleRestoreTags(issue)}
                                    title="استعادة النص الأصلي"
                                  >
                                    ↩️
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {filteredIssues.length > 100 && (
                          <p className="text-xs text-center text-muted-foreground py-2">
                            +{filteredIssues.length - 100} مشكلة أخرى...
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* Bulk fix critical */}
                {criticalCount > 0 && onApplyFix && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="font-display font-bold text-xs"
                      onClick={() => {
                        const fixableCategories = new Set(["control_chars", "pua_chars", "null_char", "unmatched_ruby", "broken_tag_syntax", "control_extra"]);
                        const criticalIssues = issues.filter(i => i.severity === "critical" && fixableCategories.has(i.category));
                        const fixedKeys = new Set<string>();
                        for (const issue of criticalIssues) {
                          if (fixedKeys.has(issue.key)) continue;
                          const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === issue.key);
                          if (entry) {
                            onApplyFix(issue.key, entry.original);
                            fixedKeys.add(issue.key);
                          }
                        }
                        toast({ title: "↩️ استعادة جماعية", description: `تم استعادة النص الأصلي لـ ${fixedKeys.size} نص تالف` });
                        setTimeout(runScan, 500);
                      }}
                    >
                      ↩️ استعادة النصوص الأصلية للمشاكل الحرجة ({new Set(issues.filter(i => i.severity === "critical").map(i => i.key)).size})
                    </Button>
                  </div>
                )}
              </>
            )}

            {scanned && issues.length === 0 && (
              <div className="text-center p-4 bg-secondary/10 rounded-lg border border-secondary/30">
                <CheckCircle2 className="w-8 h-8 text-secondary mx-auto mb-2" />
                <p className="text-sm font-display font-bold">✅ لا توجد مشاكل حرجة</p>
                <p className="text-xs text-muted-foreground mt-1">
                  كل الترجمات سليمة ولا تحتوي رموز مفقودة أو تالفة
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
