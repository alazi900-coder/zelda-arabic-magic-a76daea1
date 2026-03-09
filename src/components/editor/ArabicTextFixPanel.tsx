import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, X, XCircle } from "lucide-react";
import type { TextFixResult } from "@/lib/arabic-text-fixes";

interface ArabicTextFixPanelProps {
  results: TextFixResult[];
  onAccept: (key: string, fixType: string) => void;
  onReject: (key: string, fixType: string) => void;
  onAcceptAll: () => void;
  onClose: () => void;
}

const FIX_TYPE_CONFIG: Record<string, { emoji: string; color: string }> = {
  'taa-haa': { emoji: '🔤', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  'yaa-alef': { emoji: '✏️', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  'repeated': { emoji: '🔁', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  'ai-artifact': { emoji: '🧹', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  'lonely-lam': { emoji: '🚫', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
};

const ArabicTextFixPanel: React.FC<ArabicTextFixPanelProps> = ({
  results, onAccept, onReject, onAcceptAll, onClose,
}) => {
  const pending = results.filter(r => r.status === 'pending');
  const accepted = results.filter(r => r.status === 'accepted').length;
  const rejected = results.filter(r => r.status === 'rejected').length;

  // Group by type for summary
  const typeCounts: Record<string, number> = {};
  for (const r of results) {
    typeCounts[r.fixType] = (typeCounts[r.fixType] || 0) + 1;
  }

  if (results.length === 0) return null;

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display font-bold text-sm">
              ✨ تحسين النصوص العربية — {results.length} نتيجة
              {accepted > 0 && <span className="text-secondary mr-2"> ✅ {accepted}</span>}
              {rejected > 0 && <span className="text-destructive mr-2"> ❌ {rejected}</span>}
            </h3>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {Object.entries(typeCounts).map(([type, count]) => {
                const cfg = FIX_TYPE_CONFIG[type];
                return (
                  <Badge key={type} variant="outline" className={`text-[10px] ${cfg?.color || ''}`}>
                    {cfg?.emoji} {results.find(r => r.fixType === type)?.fixLabel} ({count})
                  </Badge>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            {pending.length > 0 && (
              <Button variant="default" size="sm" onClick={onAcceptAll} className="text-xs font-display">
                <CheckCircle2 className="w-3 h-3" /> موافقة على الكل ({pending.length}) ✨
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {results.map((item, idx) => {
            if (item.status !== 'pending') return null;
            const cfg = FIX_TYPE_CONFIG[item.fixType];
            return (
              <div
                key={`${item.key}-${item.fixType}-${idx}`}
                className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]" dir="ltr">
                      {item.key}
                    </p>
                    <Badge variant="outline" className={`text-[10px] ${cfg?.color || ''}`}>
                      {cfg?.emoji} {item.fixLabel}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{item.details}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => onAccept(item.key, item.fixType)}>
                      <CheckCircle2 className="w-3 h-3" /> قبول
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => onReject(item.key, item.fixType)}>
                      <XCircle className="w-3 h-3" /> رفض
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-destructive/5 border border-destructive/20" dir="rtl">
                    <span className="text-[10px] text-muted-foreground block mb-1">قبل:</span>
                    <span className="font-body">{item.before}</span>
                  </div>
                  <div className="p-2 rounded bg-secondary/10 border border-secondary/30" dir="rtl">
                    <span className="text-[10px] text-muted-foreground block mb-1">بعد:</span>
                    <span className="font-body">{item.after}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default ArabicTextFixPanel;
