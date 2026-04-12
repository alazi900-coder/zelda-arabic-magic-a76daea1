import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, X, ChevronDown, ChevronUp, Pencil, Copy, Search, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ConsistencyGroup {
  term: string;
  variants: { key: string; translation: string; file: string }[];
}

interface ConsistencyResultsPanelProps {
  results: { groups: ConsistencyGroup[]; aiSuggestions: { best: string; reason: string }[] };
  onApplyFix: (groupIndex: number, bestTranslation: string) => void;
  onApplyAll: () => void;
  onClose: () => void;
}

const ConsistencyResultsPanel: React.FC<ConsistencyResultsPanelProps> = ({ results, onApplyFix, onApplyAll, onClose }) => {
  const [expandedGroup, setExpandedGroup] = React.useState<number | null>(0);
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [resolvedGroups, setResolvedGroups] = React.useState<Set<number>>(new Set());

  if (results.groups.length === 0) return null;

  const filteredGroups = results.groups.map((g, i) => ({ ...g, originalIndex: i })).filter(g => {
    if (resolvedGroups.has(g.originalIndex)) return false;
    if (!searchTerm) return true;
    return g.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
           g.variants.some(v => v.translation.includes(searchTerm));
  });

  const startEditing = (index: number, currentTranslation: string) => {
    setEditingIndex(index);
    setEditValue(currentTranslation);
  };

  const applyCustomEdit = (index: number) => {
    if (editValue.trim()) {
      onApplyFix(index, editValue.trim());
      setResolvedGroups(prev => new Set([...prev, index]));
    }
    setEditingIndex(null);
  };

  const handleApplyFix = (groupIndex: number, translation: string) => {
    onApplyFix(groupIndex, translation);
    setResolvedGroups(prev => new Set([...prev, groupIndex]));
  };

  const handleApplyAll = () => {
    onApplyAll();
    setResolvedGroups(new Set(results.groups.map((_, i) => i)));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "تم النسخ" });
  };

  const unresolvedCount = results.groups.length - resolvedGroups.size;

  return (
    <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              🔍 تناقضات الترجمة
              <Badge variant="outline" className="text-xs">{unresolvedCount} متبقي</Badge>
              {resolvedGroups.size > 0 && (
                <Badge className="bg-green-500/10 text-green-600 text-xs">✅ {resolvedGroups.size} تم حله</Badge>
              )}
            </h3>
          </div>
          <div className="flex gap-2">
            {unresolvedCount > 0 && results.aiSuggestions.length > 0 && (
              <Button variant="default" size="sm" onClick={handleApplyAll} className="text-sm font-display">
                <CheckCircle2 className="w-4 h-4" /> توحيد الكل تلقائياً
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Search */}
        {results.groups.length > 3 && (
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث في المصطلحات..."
              className="pr-9 h-9 text-sm"
              dir="rtl"
            />
          </div>
        )}

        <ScrollArea className="max-h-[550px]">
          <div className="space-y-2">
            {filteredGroups.map((group) => {
              const i = group.originalIndex;
              const suggestion = results.aiSuggestions[i];
              const isExpanded = expandedGroup === i;
              const uniqueTranslations = [...new Set(group.variants.map(v => v.translation.trim()))];
              const isEditing = editingIndex === i;

              return (
                <div key={i} className="rounded-xl border border-border/50 bg-card/50 overflow-hidden transition-all">
                  {/* Collapsed header */}
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : i)}
                    className="w-full flex items-center justify-between p-3 text-right hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      <Badge variant="outline" className="text-[11px]">
                        {uniqueTranslations.length} ترجمة • {group.variants.length} موضع
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-foreground" dir="ltr">"{group.term}"</span>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(group.term); }}
                        title="نسخ المصطلح"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3">
                      {/* Translations list */}
                      <div className="space-y-2">
                        {uniqueTranslations.map((t, j) => {
                          const count = group.variants.filter(v => v.translation.trim() === t).length;
                          const isBest = suggestion?.best === t;
                          const files = [...new Set(group.variants.filter(v => v.translation.trim() === t).map(v => v.file))];
                          return (
                            <div key={j} className={`rounded-lg p-3 transition-all ${isBest ? 'bg-green-500/10 border border-green-500/20 ring-1 ring-green-500/10' : 'bg-muted/30 border border-transparent'}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="font-body text-base leading-relaxed mb-1" dir="rtl">{t}</p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {isBest && (
                                      <Badge className="bg-green-500/20 text-green-600 text-[10px]">✅ مقترح</Badge>
                                    )}
                                    <span className="text-[11px] text-muted-foreground">({count}×)</span>
                                    {files.length <= 3 && files.map((f, fi) => (
                                      <span key={fi} className="text-[10px] text-muted-foreground font-mono">{f.split(':')[0]}</span>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <Button
                                    variant={isBest ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => handleApplyFix(i, t)}
                                    className="h-8 px-3 text-xs font-display gap-1"
                                  >
                                    <ArrowRight className="w-3 h-3" />
                                    توحيد
                                  </Button>
                                  <Button
                                    variant="ghost" size="sm"
                                    onClick={() => startEditing(i, t)}
                                    className="h-8 px-2 text-xs"
                                    title="تعديل ثم توحيد"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Custom edit field */}
                      {isEditing && (
                        <div className="flex items-center gap-2 bg-primary/5 rounded-lg p-3 border border-primary/20">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 text-sm h-9 font-body"
                            dir="rtl"
                            placeholder="اكتب الترجمة المعدّلة..."
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') applyCustomEdit(i);
                              if (e.key === 'Escape') setEditingIndex(null);
                            }}
                          />
                          <Button size="sm" className="h-9 px-4 text-xs" onClick={() => applyCustomEdit(i)}>
                            توحيد
                          </Button>
                          <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => setEditingIndex(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}

                      {/* Write custom button */}
                      {!isEditing && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-9 text-xs border-dashed"
                          onClick={() => startEditing(i, uniqueTranslations[0] || '')}
                        >
                          <Pencil className="w-3.5 h-3.5 ml-1" />
                          كتابة ترجمة مخصصة وتوحيد الكل
                        </Button>
                      )}

                      {suggestion?.reason && (
                        <p className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-2.5">
                          💡 {suggestion.reason}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {filteredGroups.length === 0 && searchTerm && (
          <p className="text-center text-sm text-muted-foreground py-4">لا توجد نتائج لـ "{searchTerm}"</p>
        )}
        {filteredGroups.length === 0 && !searchTerm && resolvedGroups.size > 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">✅ تم حل جميع التناقضات!</p>
        )}
      </CardContent>
    </Card>
  );
};

export default ConsistencyResultsPanel;
