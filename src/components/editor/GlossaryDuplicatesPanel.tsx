import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, AlertTriangle, Check, ChevronDown, ChevronUp, Trash2, Copy, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GlossaryDuplicate {
  key: string;
  /** All different values found for this key, ordered by line number */
  values: Array<{
    value: string;
    lineNumber: number;
    section?: string;
  }>;
}

interface GlossaryDuplicatesPanelProps {
  duplicates: GlossaryDuplicate[];
  onFix: (key: string, chosenValue: string) => void;
  onFixAll: (strategy: 'first' | 'last' | 'longest') => void;
  onClose: () => void;
}

const GlossaryDuplicatesPanel: React.FC<GlossaryDuplicatesPanelProps> = ({
  duplicates, onFix, onFixAll, onClose,
}) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(duplicates.slice(0, 3).map(d => d.key)));

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalConflicts = useMemo(() => 
    duplicates.reduce((sum, d) => sum + d.values.length - 1, 0), 
    [duplicates]
  );

  if (duplicates.length === 0) return null;

  return (
    <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="font-display font-bold text-sm">
              فحص التكرارات — {duplicates.length} مفتاح متكرر ({totalConflicts} تعارض)
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Quick fix buttons */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onFixAll('first')}
            className="text-xs h-7 gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
          >
            <Check className="w-3 h-3" /> الإبقاء على الأول
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onFixAll('last')}
            className="text-xs h-7 gap-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
          >
            <RefreshCw className="w-3 h-3" /> الإبقاء على الأخير
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onFixAll('longest')}
            className="text-xs h-7 gap-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
          >
            <Copy className="w-3 h-3" /> الإبقاء على الأطول
          </Button>
        </div>

        {/* Duplicates list */}
        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-2">
            {duplicates.map((dup) => {
              const isExpanded = expandedKeys.has(dup.key);
              return (
                <div
                  key={dup.key}
                  className="rounded-lg border border-border/50 bg-card/50 overflow-hidden"
                >
                  {/* Collapsed header */}
                  <button
                    onClick={() => toggleExpand(dup.key)}
                    className="w-full flex items-center justify-between p-2.5 text-right hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/40 text-amber-400">
                        {dup.values.length} قيم
                      </Badge>
                    </div>
                    <span className="font-mono text-sm text-foreground truncate max-w-[70%]" dir="ltr">
                      {dup.key}
                    </span>
                  </button>

                  {/* Expanded values */}
                  {isExpanded && (
                    <div className="px-2.5 pb-2.5 space-y-1.5">
                      {dup.values.map((val, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-center justify-between gap-2 p-2 rounded text-xs",
                            idx === 0
                              ? "bg-emerald-500/10 border border-emerald-500/20"
                              : "bg-muted/30 border border-border/30"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                سطر {val.lineNumber}
                              </span>
                              {val.section && (
                                <span className="text-[10px] text-muted-foreground/60 truncate max-w-[120px]">
                                  • {val.section}
                                </span>
                              )}
                              {idx === 0 && (
                                <Badge className="text-[9px] h-3.5 px-1 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                  الأول
                                </Badge>
                              )}
                              {idx === dup.values.length - 1 && idx !== 0 && (
                                <Badge className="text-[9px] h-3.5 px-1 bg-blue-500/20 text-blue-400 border-blue-500/30">
                                  الأخير
                                </Badge>
                              )}
                            </div>
                            <div className="font-body text-foreground" dir="rtl">
                              {val.value}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onFix(dup.key, val.value)}
                            className="h-7 px-2 text-xs gap-1 text-emerald-400 hover:bg-emerald-500/20"
                            title="اختيار هذه القيمة"
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default GlossaryDuplicatesPanel;
