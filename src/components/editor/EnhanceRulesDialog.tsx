import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Search, Shield, RotateCcw, Plus, Pencil, Trash2, X, ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import {
  BUILTIN_RULES,
  type EnhanceRule,
  type EnhanceRuleId,
  loadEnabledRules,
  saveEnabledRules,
  loadCustomRules,
  saveCustomRules,
  generateCustomRuleId,
  loadBuiltinOverrides,
  saveBuiltinOverrides,
  getBuiltinRulesMerged,
  type BuiltinOverride,
} from "@/lib/enhance-rules";

interface EnhanceRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (enabled: Set<EnhanceRuleId>, allRules: EnhanceRule[]) => void;
}

interface EditState {
  id: string | null; // null = جديدة، string = تعديل
  isBuiltin: boolean;
  label: string;
  description: string;
  prompt: string;
  kind: 'detect' | 'protect';
}

const emptyEdit: EditState = { id: null, isBuiltin: false, label: '', description: '', prompt: '', kind: 'detect' };

export function EnhanceRulesDialog({ open, onOpenChange, onSaved }: EnhanceRulesDialogProps) {
  const [enabled, setEnabled] = useState<Set<EnhanceRuleId>>(() => loadEnabledRules());
  const [customRules, setCustomRules] = useState<EnhanceRule[]>(() => loadCustomRules());
  const [overrides, setOverrides] = useState<Record<string, BuiltinOverride>>(() => loadBuiltinOverrides());
  const [editing, setEditing] = useState<EditState | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setEnabled(loadEnabledRules());
      setCustomRules(loadCustomRules());
      setOverrides(loadBuiltinOverrides());
      setEditing(null);
      setExpanded(new Set());
    }
  }, [open]);

  const builtinMerged = BUILTIN_RULES.map(r => {
    const o = overrides[r.id];
    return o ? { ...r, ...o } : r;
  });
  const allRules = [...builtinMerged, ...customRules];

  const toggle = (id: EnhanceRuleId) => {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    saveEnabledRules(enabled);
    saveCustomRules(customRules);
    saveBuiltinOverrides(overrides);
    onSaved?.(enabled, allRules);
    onOpenChange(false);
  };

  const handleResetDefaults = () => {
    const defaults = new Set<EnhanceRuleId>(BUILTIN_RULES.filter(r => r.defaultEnabled).map(r => r.id));
    for (const c of customRules) defaults.add(c.id);
    setEnabled(defaults);
  };

  const startNew = () => setEditing({ ...emptyEdit });

  const startEdit = (r: EnhanceRule) => {
    const isBuiltin = BUILTIN_RULES.some(b => b.id === r.id);
    setEditing({
      id: r.id, isBuiltin,
      label: r.label, description: r.description, prompt: r.prompt, kind: r.kind,
    });
  };

  const saveEditing = () => {
    if (!editing) return;
    const label = editing.label.trim();
    const prompt = editing.prompt.trim();
    if (!label || !prompt) return;

    if (editing.id && editing.isBuiltin) {
      // override للقاعدة المبنيّة
      setOverrides(prev => ({
        ...prev,
        [editing.id!]: { label, description: editing.description.trim(), prompt },
      }));
    } else if (editing.id) {
      // تعديل قاعدة مخصّصة
      setCustomRules(prev => prev.map(r => r.id === editing.id ? {
        ...r, label, description: editing.description.trim(), prompt, kind: editing.kind,
      } : r));
    } else {
      // قاعدة جديدة
      const newId = generateCustomRuleId();
      const newRule: EnhanceRule = {
        id: newId, label, description: editing.description.trim(),
        prompt, kind: editing.kind, defaultEnabled: true, custom: true,
      };
      setCustomRules(prev => [...prev, newRule]);
      setEnabled(prev => new Set(prev).add(newId));
      setExpanded(prev => new Set(prev).add(newId));
    }
    setEditing(null);
  };

  const deleteRule = (id: string) => {
    setCustomRules(prev => prev.filter(r => r.id !== id));
    setEnabled(prev => {
      const next = new Set(prev); next.delete(id); return next;
    });
  };

  const revertBuiltin = (id: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const detectRules = allRules.filter(r => r.kind === 'detect');
  const protectRules = allRules.filter(r => r.kind === 'protect');

  const renderRow = (rule: EnhanceRule) => {
    const isBuiltin = BUILTIN_RULES.some(b => b.id === rule.id);
    const hasOverride = isBuiltin && !!overrides[rule.id];
    return (
      <RuleRow
        key={rule.id}
        rule={rule}
        checked={enabled.has(rule.id)}
        expanded={expanded.has(rule.id)}
        hasOverride={hasOverride}
        onToggle={() => toggle(rule.id)}
        onToggleExpand={() => toggleExpand(rule.id)}
        onEdit={() => startEdit(rule)}
        onDelete={rule.custom ? () => deleteRule(rule.id) : undefined}
        onRevert={hasOverride ? () => revertBuiltin(rule.id) : undefined}
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[92vh] sm:h-auto sm:max-h-[92vh] flex flex-col p-4 sm:p-6" dir="rtl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="w-5 h-5 text-primary" />
            قواعد الذكاء الاصطناعي
          </DialogTitle>
          <DialogDescription className="text-xs">
            شغّل/أوقف، عدّل البروميت، أو أنشئ قواعد جديدة.{" "}
            <Badge variant="secondary" className="text-[10px]">
              {enabled.size} من {allRules.length}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">
          <div className="space-y-3 py-2">
            {/* وضع التحرير/الإضافة */}
            {editing && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-primary">
                    {editing.id ? (editing.isBuiltin ? '✏️ تعديل قاعدة مبنيّة' : '✏️ تعديل قاعدة') : '➕ قاعدة جديدة'}
                  </p>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">الاسم *</Label>
                  <Input
                    value={editing.label}
                    onChange={e => setEditing({ ...editing, label: e.target.value })}
                    placeholder="مثل: حماية كلمات معيّنة"
                    className="h-8 text-sm" dir="rtl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">الوصف (اختياري)</Label>
                  <Input
                    value={editing.description}
                    onChange={e => setEditing({ ...editing, description: e.target.value })}
                    placeholder="شرح مختصر يظهر في القائمة"
                    className="h-8 text-sm" dir="rtl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">البروميت المُرسَل للـ AI *</Label>
                  <Textarea
                    value={editing.prompt}
                    onChange={e => setEditing({ ...editing, prompt: e.target.value })}
                    placeholder="مثل: 🚫 لا تترجم كلمة 'Monado' أبداً."
                    className="text-sm min-h-[100px] font-mono"
                    dir="rtl"
                  />
                </div>
                {!editing.isBuiltin && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">النوع</Label>
                    <RadioGroup
                      value={editing.kind}
                      onValueChange={(v) => setEditing({ ...editing, kind: v as 'detect' | 'protect' })}
                      className="flex gap-3"
                    >
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <RadioGroupItem value="detect" /> اكتشاف
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <RadioGroupItem value="protect" /> حماية
                      </label>
                    </RadioGroup>
                  </div>
                )}
                <div className="flex gap-2 justify-end pt-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>
                    إلغاء
                  </Button>
                  <Button
                    size="sm" className="h-7 text-xs"
                    onClick={saveEditing}
                    disabled={!editing.label.trim() || !editing.prompt.trim()}
                  >
                    {editing.id ? 'حفظ التعديل' : 'إضافة'}
                  </Button>
                </div>
              </div>
            )}

            {/* زرّ إضافة دائم */}
            {!editing && (
              <Button
                variant="outline" size="sm" onClick={startNew}
                className="w-full gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/5"
              >
                <Plus className="w-4 h-4" />
                إضافة قاعدة جديدة
              </Button>
            )}

            <section>
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-foreground">
                <Search className="w-4 h-4 text-blue-500" />
                ماذا يبحث الـ AI عنه؟
              </div>
              <div className="space-y-1.5">
                {detectRules.map(renderRow)}
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-foreground">
                <Shield className="w-4 h-4 text-amber-500" />
                ماذا لا يفعل الـ AI؟
              </div>
              <div className="space-y-1.5">
                {protectRules.map(renderRow)}
              </div>
            </section>
          </div>
        </ScrollArea>


        <DialogFooter className="shrink-0 flex-row gap-2 flex-wrap sm:gap-2">
          <Button variant="outline" size="sm" onClick={handleResetDefaults} className="gap-1.5 h-8 text-xs">
            <RotateCcw className="w-3.5 h-3.5" />
            استعادة الافتراضي
          </Button>
          <div className="flex-1 min-w-0" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
            إلغاء
          </Button>
          <Button size="sm" onClick={handleSave} className="h-8 text-xs">
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({
  rule, checked, expanded, hasOverride, onToggle, onToggleExpand, onEdit, onDelete, onRevert,
}: {
  rule: EnhanceRule;
  checked: boolean;
  expanded: boolean;
  hasOverride: boolean;
  onToggle: () => void;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  onRevert?: () => void;
}) {
  const isDisabledCritical = rule.critical && !checked;
  return (
    <div
      className={`p-2.5 rounded-lg border transition-colors ${
        checked ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-border'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Switch checked={checked} onCheckedChange={onToggle} className="mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-foreground break-words">{rule.label}</span>
            {rule.critical && (
              <Badge variant={isDisabledCritical ? 'destructive' : 'outline'} className="text-[9px] gap-0.5 py-0 h-4">
                <AlertTriangle className="w-2.5 h-2.5" />
                حرجة
              </Badge>
            )}
            {rule.custom && (
              <Badge variant="outline" className="text-[9px] py-0 h-4 border-primary/40 text-primary">مخصّصة</Badge>
            )}
            {hasOverride && (
              <Badge variant="outline" className="text-[9px] py-0 h-4 border-amber-500/50 text-amber-600">معدّلة</Badge>
            )}
          </div>
          {rule.description && (
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed [overflow-wrap:anywhere]">
              {rule.description}
            </p>
          )}
          {isDisabledCritical && (
            <p className="text-[11px] text-destructive mt-1">
              ⚠️ إيقاف هذه القاعدة قد يُنتج اقتراحات تكسر اللعبة عند البناء.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onToggleExpand} title={expanded ? 'إخفاء البروميت' : 'عرض البروميت'}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="تعديل البروميت">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          {onRevert && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600 hover:bg-amber-500/10" onClick={onRevert} title="استعادة الأصلي">
              <Undo2 className="w-3.5 h-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={onDelete} title="حذف">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="mt-2 mr-9 rounded border border-border bg-background/60 p-2">
          <p className="text-[10px] text-muted-foreground mb-1">البروميت المُرسَل للـ AI:</p>
          <pre className="text-[11px] whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-foreground/90" dir="rtl">
            {rule.prompt}
          </pre>
        </div>
      )}
    </div>
  );
}
