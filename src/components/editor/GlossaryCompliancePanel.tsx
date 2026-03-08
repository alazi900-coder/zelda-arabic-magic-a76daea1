import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, X, ChevronDown, ChevronUp, BookOpen, Replace } from "lucide-react";

export interface GlossaryViolation {
  key: string;
  original: string;
  translation: string;
  violations: {
    englishTerm: string;
    expectedArabic: string;
    /** The wrong/missing Arabic fragment found (empty if term is completely absent) */
    foundFragment: string;
  }[];
  /** The corrected translation with glossary terms replaced */
  corrected: string;
}

interface GlossaryCompliancePanelProps {
  violations: GlossaryViolation[];
  onApplyFix: (index: number) => void;
  onApplyAll: () => void;
  onClose: () => void;
}

const GlossaryCompliancePanel: React.FC<GlossaryCompliancePanelProps> = ({ violations, onApplyFix, onApplyAll, onClose }) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [filterType, setFilterType] = useState<"all" | "missing" | "wrong">("all");

  const filtered = useMemo(() => {
    if (filterType === "all") return violations;
    return violations.filter(v =>
      v.violations.some(viol =>
        filterType === "missing" ? !viol.foundFragment : !!viol.foundFragment
      )
    );
  }, [violations, filterType]);

  const missingCount = violations.filter(v => v.violations.some(vl => !vl.foundFragment)).length;
  const wrongCount = violations.filter(v => v.violations.some(vl => !!vl.foundFragment)).length;

  if (violations.length === 0) return null;

  /** Highlight glossary terms in the corrected text */
  function highlightCorrected(corrected: string, expectedTerms: string[]): React.ReactNode {
    if (expectedTerms.length === 0) return corrected;
    // Build regex to match any expected Arabic term
    const escaped = expectedTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`(${escaped.join('|')})`, 'g');
    const parts = corrected.split(re);
    return parts.map((part, i) =>
      expectedTerms.includes(part)
        ? <span key={i} className="bg-emerald-500/20 text-emerald-400 rounded px-0.5 font-bold">{part}</span>
        : part
    );
  }

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            فحص التزام القاموس — {violations.length} مخالفة
          </h3>
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={onApplyAll} className="text-xs font-display">
              <CheckCircle2 className="w-3 h-3" /> تصحيح الكل تلقائياً
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setFilterType("all")}
            className={`text-xs px-2 py-1 rounded transition-colors ${filterType === "all" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/30"}`}
          >
            الكل ({violations.length})
          </button>
          <button
            onClick={() => setFilterType("missing")}
            className={`text-xs px-2 py-1 rounded transition-colors ${filterType === "missing" ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:bg-muted/30"}`}
          >
            مصطلح مفقود ({missingCount})
          </button>
          <button
            onClick={() => setFilterType("wrong")}
            className={`text-xs px-2 py-1 rounded transition-colors ${filterType === "wrong" ? "bg-red-500/20 text-red-400" : "text-muted-foreground hover:bg-muted/30"}`}
          >
            ترجمة مختلفة ({wrongCount})
          </button>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filtered.map((v, i) => {
            const realIndex = violations.indexOf(v);
            const isExpanded = expandedIndex === realIndex;
            return (
              <div key={realIndex} className="rounded-lg border border-border/50 bg-card/50 overflow-hidden">
                <button
                  onClick={() => setExpandedIndex(isExpanded ? null : realIndex)}
                  className="w-full flex items-center justify-between p-3 text-right hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    <span className="text-xs text-muted-foreground">{v.violations.length} مصطلح</span>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    {v.violations.slice(0, 3).map((viol, j) => (
                      <span key={j} className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">
                        {viol.englishTerm}
                      </span>
                    ))}
                    {v.violations.length > 3 && <span className="text-[10px] text-muted-foreground">+{v.violations.length - 3}</span>}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3">
                    {/* English original */}
                    <div className="text-xs bg-muted/20 rounded p-2" dir="ltr">
                      <span className="text-muted-foreground text-[10px] block mb-1">🇬🇧 النص الأصلي:</span>
                      {v.original}
                    </div>

                    {/* Current translation (with wrong terms highlighted) */}
                    <div className="text-xs bg-red-500/5 border border-red-500/10 rounded p-2">
                      <span className="text-muted-foreground text-[10px] block mb-1">❌ الترجمة الحالية:</span>
                      <span className="font-body">{v.translation}</span>
                    </div>

                    {/* Corrected translation (with correct terms highlighted) */}
                    <div className="text-xs bg-emerald-500/5 border border-emerald-500/10 rounded p-2">
                      <span className="text-muted-foreground text-[10px] block mb-1">✅ الترجمة المصححة:</span>
                      <span className="font-body">
                        {highlightCorrected(v.corrected, v.violations.map(vl => vl.expectedArabic))}
                      </span>
                    </div>

                    {/* Violation details */}
                    <div className="space-y-1">
                      {v.violations.map((viol, j) => (
                        <div key={j} className="flex items-center justify-between text-[10px] bg-muted/20 rounded px-2 py-1">
                          <span className="text-muted-foreground">
                            {viol.foundFragment
                              ? <>وُجد: <span className="text-red-400 line-through">{viol.foundFragment}</span></>
                              : <span className="text-amber-400">مفقود من الترجمة</span>
                            }
                          </span>
                          <div className="flex items-center gap-2" dir="ltr">
                            <span className="font-mono text-primary">{viol.englishTerm}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-emerald-400 font-bold">{viol.expectedArabic}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button
                      variant="default" size="sm"
                      onClick={() => onApplyFix(realIndex)}
                      className="w-full text-xs font-display"
                    >
                      <Replace className="w-3 h-3" /> تطبيق التصحيح
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default GlossaryCompliancePanel;
