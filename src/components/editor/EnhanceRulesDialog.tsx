import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Search, Shield, RotateCcw } from "lucide-react";
import {
  ENHANCE_RULES,
  type EnhanceRuleId,
  loadEnabledRules,
  saveEnabledRules,
} from "@/lib/enhance-rules";

interface EnhanceRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** يُستدعى بعد الحفظ بمجموعة القواعد المُفعَّلة الجديدة. */
  onSaved?: (enabled: Set<EnhanceRuleId>) => void;
}

export function EnhanceRulesDialog({ open, onOpenChange, onSaved }: EnhanceRulesDialogProps) {
  const [enabled, setEnabled] = useState<Set<EnhanceRuleId>>(() => loadEnabledRules());

  // إعادة قراءة القيم عند فتح الحوار (لو غيّر المستخدم في تبويب آخر).
  useEffect(() => {
    if (open) setEnabled(loadEnabledRules());
  }, [open]);

  const toggle = (id: EnhanceRuleId) => {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    saveEnabledRules(enabled);
    onSaved?.(enabled);
    onOpenChange(false);
  };

  const handleResetDefaults = () => {
    const defaults = new Set(ENHANCE_RULES.filter(r => r.defaultEnabled).map(r => r.id));
    setEnabled(defaults);
  };

  const detectRules = ENHANCE_RULES.filter(r => r.kind === 'detect');
  const protectRules = ENHANCE_RULES.filter(r => r.kind === 'protect');
  const enabledCount = enabled.size;
  const totalCount = ENHANCE_RULES.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            قواعد الذكاء الاصطناعي
          </DialogTitle>
          <DialogDescription>
            شغّل أو أوقف القواعد التي يتّبعها الـ AI أثناء فحص الترجمات.
            <span className="block mt-1 text-xs">
              مُفعَّل الآن:{" "}
              <Badge variant="secondary" className="text-[10px]">
                {enabledCount} من {totalCount}
              </Badge>
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-2 px-2 max-h-[55vh]">
          <div className="space-y-4 py-2">
            {/* قواعد الاكتشاف */}
            <section>
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-foreground">
                <Search className="w-4 h-4 text-blue-500" />
                ماذا يبحث الـ AI عنه؟
              </div>
              <div className="space-y-1.5">
                {detectRules.map(rule => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    checked={enabled.has(rule.id)}
                    onToggle={() => toggle(rule.id)}
                  />
                ))}
              </div>
            </section>

            {/* قواعد الحماية */}
            <section>
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-foreground">
                <Shield className="w-4 h-4 text-amber-500" />
                ماذا لا يفعل الـ AI؟
              </div>
              <div className="space-y-1.5">
                {protectRules.map(rule => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    checked={enabled.has(rule.id)}
                    onToggle={() => toggle(rule.id)}
                  />
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={handleResetDefaults} className="gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            استعادة الافتراضي
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button size="sm" onClick={handleSave}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({
  rule,
  checked,
  onToggle,
}: {
  rule: (typeof ENHANCE_RULES)[number];
  checked: boolean;
  onToggle: () => void;
}) {
  const isDisabledCritical = rule.critical && !checked;
  return (
    <label
      className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
        checked ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-border hover:bg-muted/50'
      }`}
    >
      <Switch
        checked={checked}
        onCheckedChange={onToggle}
        className="mt-0.5 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-foreground">{rule.label}</span>
          {rule.critical && (
            <Badge
              variant={isDisabledCritical ? 'destructive' : 'outline'}
              className="text-[9px] gap-0.5 py-0 h-4"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              حرجة
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
          {rule.description}
        </p>
        {isDisabledCritical && (
          <p className="text-[11px] text-destructive mt-1">
            ⚠️ إيقاف هذه القاعدة قد يُنتج اقتراحات تكسر اللعبة عند البناء.
          </p>
        )}
      </div>
    </label>
  );
}
