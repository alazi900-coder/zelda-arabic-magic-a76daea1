import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  X, Check, AlertTriangle, Lightbulb, BookOpen, Palette,
  Shield, Layers, User, Swords, Heart, Settings, MessageSquare,
  HelpCircle, ChevronDown, ChevronUp, Loader2, Brain, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// === Types ===
export interface LiteralResult {
  key: string;
  original: string;
  translation: string;
  isLiteral: boolean;
  literalScore: number;
  issues: string[];
  naturalVersion?: string;
  explanation?: string;
}

export interface StyleResult {
  key: string;
  original: string;
  translation: string;
  styleIssues: string[];
  currentTone: string;
  suggestedTone: string;
  unifiedVersion?: string;
  changes: string[];
}

export interface ConsistencyItem {
  type: 'terminology' | 'character' | 'style' | 'glossary';
  term: string;
  variants: { index: number; text: string }[];
  recommended: string;
  severity: 'high' | 'medium' | 'low';
}

export interface ConsistencyResult {
  inconsistencies: ConsistencyItem[];
  score: number;
  summary: string;
}

export interface AlternativeResult {
  key: string;
  original: string;
  translation: string;
  alternatives: { style: string; text: string; note: string }[];
  recommended: string;
  characterContext?: string;
}

export interface FullAnalysisResult {
  key: string;
  original: string;
  translation: string;
  literalScore: number;
  isLiteral: boolean;
  sceneType: string;
  character?: string;
  tone: string;
  issues: { type: string; message: string; severity: string }[];
  alternatives: { style: string; text: string; note: string }[];
  recommended?: string;
}

export type AnalysisAction = 'literal-detect' | 'style-unify' | 'consistency-check' | 'alternatives' | 'full-analysis';

// === Panel Props ===
interface AdvancedTranslationPanelProps {
  activeTab: AnalysisAction;
  literalResults: LiteralResult[] | null;
  styleResults: StyleResult[] | null;
  consistencyResult: ConsistencyResult | null;
  alternativeResults: AlternativeResult[] | null;
  fullResults: FullAnalysisResult[] | null;
  analyzing: boolean;
  onApply: (key: string, newTranslation: string) => void;
  onApplyAll: (action: AnalysisAction) => void;
  onClose: () => void;
  onTabChange: (tab: AnalysisAction) => void;
  onSaveToMemory?: (key: string, original: string, translation: string) => void;
  onStop?: () => void;
}

const styleLabels: Record<string, string> = {
  literary: '📚 أدبي', natural: '💬 طبيعي', concise: '✂️ مختصر', dramatic: '🎭 درامي',
};

const sceneIcons: Record<string, React.ReactNode> = {
  combat: <Swords className="w-3 h-3" />, emotional: <Heart className="w-3 h-3" />,
  system: <Settings className="w-3 h-3" />, dialogue: <MessageSquare className="w-3 h-3" />,
  tutorial: <HelpCircle className="w-3 h-3" />,
};

const AdvancedTranslationPanel: React.FC<AdvancedTranslationPanelProps> = ({
  activeTab, literalResults, styleResults, consistencyResult, alternativeResults,
  fullResults, analyzing, onApply, onApplyAll, onClose, onTabChange, onSaveToMemory, onStop,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (k: string) => setExpanded(p => {
    const n = new Set(p);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  return (
    <Card className="mb-4 border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <h3 className="font-display font-bold text-sm">
              تحليل وتحسين متقدم
              {analyzing && <span className="text-muted-foreground animate-pulse mr-2">— جاري التحليل...</span>}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {analyzing && onStop && (
              <Button variant="destructive" size="sm" onClick={onStop} className="h-7 px-2 text-xs gap-1">
                <X className="w-3 h-3" /> إيقاف
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as AnalysisAction)} dir="rtl">
          <TabsList className="w-full grid grid-cols-5 h-8 mb-3">
            <TabsTrigger value="literal-detect" className="text-[10px] px-1 gap-0.5">
              <AlertTriangle className="w-3 h-3" /> حرفية
            </TabsTrigger>
            <TabsTrigger value="style-unify" className="text-[10px] px-1 gap-0.5">
              <Palette className="w-3 h-3" /> أسلوب
            </TabsTrigger>
            <TabsTrigger value="consistency-check" className="text-[10px] px-1 gap-0.5">
              <Shield className="w-3 h-3" /> اتساق
            </TabsTrigger>
            <TabsTrigger value="alternatives" className="text-[10px] px-1 gap-0.5">
              <Layers className="w-3 h-3" /> بدائل
            </TabsTrigger>
            <TabsTrigger value="full-analysis" className="text-[10px] px-1 gap-0.5">
              <Sparkles className="w-3 h-3" /> شامل
            </TabsTrigger>
          </TabsList>

          {/* Literal Detection */}
          <TabsContent value="literal-detect">
            {literalResults && (
              <>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <Badge variant="secondary">{literalResults.length} نص</Badge>
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    {literalResults.filter(r => r.isLiteral).length} ترجمة حرفية
                  </Badge>
                  {literalResults.some(r => r.naturalVersion) && (
                    <Button size="sm" variant="default" className="h-6 text-[10px]" onClick={() => onApplyAll('literal-detect')}>
                      <Check className="w-3 h-3 mr-1" /> تطبيق الإصلاحات ({literalResults.filter(r => r.naturalVersion && r.isLiteral).length})
                    </Button>
                  )}
                </div>
                <ScrollArea className="max-h-[50vh]">
                  <div className="space-y-2">
                    {literalResults.filter(r => r.isLiteral).map(r => (
                      <LiteralCard key={r.key} result={r} expanded={expanded.has(r.key)} onToggle={() => toggle(r.key)} onApply={onApply} onSave={onSaveToMemory} />
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </TabsContent>

          {/* Style Unification */}
          <TabsContent value="style-unify">
            {styleResults && (
              <>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <Badge variant="secondary">{styleResults.length} نص</Badge>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                    {styleResults.filter(r => r.styleIssues.length > 0).length} يحتاج توحيد
                  </Badge>
                  {styleResults.some(r => r.unifiedVersion) && (
                    <Button size="sm" variant="default" className="h-6 text-[10px]" onClick={() => onApplyAll('style-unify')}>
                      <Check className="w-3 h-3 mr-1" /> توحيد الأسلوب ({styleResults.filter(r => r.unifiedVersion).length})
                    </Button>
                  )}
                </div>
                <ScrollArea className="max-h-[50vh]">
                  <div className="space-y-2">
                    {styleResults.filter(r => r.styleIssues.length > 0 || r.unifiedVersion).map(r => (
                      <StyleCard key={r.key} result={r} expanded={expanded.has(r.key)} onToggle={() => toggle(r.key)} onApply={onApply} />
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </TabsContent>

          {/* Consistency Check */}
          <TabsContent value="consistency-check">
            {consistencyResult && (
              <>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <Badge variant="secondary">درجة الاتساق: {consistencyResult.score}/100</Badge>
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    {consistencyResult.inconsistencies.length} تناقض
                  </Badge>
                </div>
                {consistencyResult.summary && (
                  <p className="text-xs text-muted-foreground mb-3 bg-muted/20 p-2 rounded">{consistencyResult.summary}</p>
                )}
                <ScrollArea className="max-h-[50vh]">
                  <div className="space-y-2">
                    {consistencyResult.inconsistencies.map((item, i) => (
                      <ConsistencyCard key={i} item={item} />
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </TabsContent>

          {/* Alternatives */}
          <TabsContent value="alternatives">
            {alternativeResults && (
              <>
                <div className="flex gap-2 mb-3">
                  <Badge variant="secondary">{alternativeResults.length} نص مع بدائل</Badge>
                </div>
                <ScrollArea className="max-h-[50vh]">
                  <div className="space-y-2">
                    {alternativeResults.map(r => (
                      <AlternativesCard key={r.key} result={r} expanded={expanded.has(r.key)} onToggle={() => toggle(r.key)} onApply={onApply} onSave={onSaveToMemory} />
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </TabsContent>

          {/* Full Analysis */}
          <TabsContent value="full-analysis">
            {fullResults && (
              <>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <Badge variant="secondary">{fullResults.length} نص</Badge>
                  <Badge variant="outline" className="border-destructive/40">
                    {fullResults.filter(r => r.isLiteral).length} حرفية
                  </Badge>
                  <Badge variant="outline" className="border-amber-500/40">
                    {fullResults.filter(r => r.issues.length > 0).length} مشاكل
                  </Badge>
                  {fullResults.some(r => r.recommended) && (
                    <Button size="sm" variant="default" className="h-6 text-[10px]" onClick={() => onApplyAll('full-analysis')}>
                      <Check className="w-3 h-3 mr-1" /> تطبيق الأفضل ({fullResults.filter(r => r.recommended).length})
                    </Button>
                  )}
                </div>
                <ScrollArea className="max-h-[50vh]">
                  <div className="space-y-2">
                    {fullResults.map(r => (
                      <FullAnalysisCard key={r.key} result={r} expanded={expanded.has(r.key)} onToggle={() => toggle(r.key)} onApply={onApply} onSave={onSaveToMemory} />
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

// === Sub-components ===

const LiteralCard: React.FC<{ result: LiteralResult; expanded: boolean; onToggle: () => void; onApply: (k: string, t: string) => void; onSave?: (k: string, o: string, t: string) => void }> = ({ result, expanded, onToggle, onApply, onSave }) => (
  <div className={cn("rounded-lg border overflow-hidden", result.isLiteral ? "border-destructive/30 bg-destructive/5" : "border-border/50")}>
    <button onClick={onToggle} className="w-full flex items-center justify-between p-2 text-right hover:bg-muted/30">
      <div className="flex items-center gap-2">
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <Badge variant="outline" className={cn("text-[10px] h-5", result.isLiteral ? "border-destructive/40 text-destructive" : "border-emerald-500/40 text-emerald-400")}>
          {result.isLiteral ? `حرفية ${result.literalScore}%` : '✓ طبيعية'}
        </Badge>
      </div>
      <span className="text-xs text-muted-foreground truncate max-w-[50%] font-mono" dir="ltr">{result.key.split(':').pop()}</span>
    </button>
    {expanded && (
      <div className="px-3 pb-3 space-y-2">
        <div className="text-xs bg-muted/20 rounded p-2" dir="ltr"><span className="text-[10px] text-muted-foreground block mb-0.5">🇬🇧 الأصلي:</span>{result.original}</div>
        <div className="text-xs bg-card/50 border border-border/30 rounded p-2" dir="rtl"><span className="text-[10px] text-muted-foreground block mb-0.5">الحالي:</span>{result.translation}</div>
        {result.issues.length > 0 && (
          <div className="space-y-1">{result.issues.map((iss, i) => <div key={i} className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">⚠️ {iss}</div>)}</div>
        )}
        {result.naturalVersion && (
          <div className="text-xs border border-emerald-500/30 bg-emerald-500/10 rounded p-2 flex items-start justify-between gap-2">
            <div className="flex-1">
              <span className="text-[10px] text-emerald-400 block mb-0.5">💡 الصياغة الطبيعية:</span>
              <div dir="rtl">{result.naturalVersion}</div>
              {result.explanation && <div className="text-[10px] text-muted-foreground mt-1">{result.explanation}</div>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { onApply(result.key, result.naturalVersion!); onSave?.(result.key, result.original, result.naturalVersion!); }}
              className="h-7 px-2 text-xs text-emerald-400 hover:bg-emerald-500/20 shrink-0">
              <Check className="w-3 h-3" /> تطبيق
            </Button>
          </div>
        )}
      </div>
    )}
  </div>
);

const StyleCard: React.FC<{ result: StyleResult; expanded: boolean; onToggle: () => void; onApply: (k: string, t: string) => void }> = ({ result, expanded, onToggle, onApply }) => (
  <div className={cn("rounded-lg border overflow-hidden", result.styleIssues.length > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border/50")}>
    <button onClick={onToggle} className="w-full flex items-center justify-between p-2 text-right hover:bg-muted/30">
      <div className="flex items-center gap-2">
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <Badge variant="outline" className="text-[10px] h-5">النبرة: {result.currentTone}</Badge>
        {result.styleIssues.length > 0 && <Badge variant="outline" className="text-[10px] h-5 border-amber-500/40 text-amber-400">{result.styleIssues.length} مشكلة</Badge>}
      </div>
      <span className="text-xs text-muted-foreground truncate max-w-[50%] font-mono" dir="ltr">{result.key.split(':').pop()}</span>
    </button>
    {expanded && (
      <div className="px-3 pb-3 space-y-2">
        <div className="text-xs bg-muted/20 rounded p-2" dir="ltr"><span className="text-[10px] text-muted-foreground block mb-0.5">🇬🇧:</span>{result.original}</div>
        <div className="text-xs bg-card/50 border rounded p-2" dir="rtl"><span className="text-[10px] text-muted-foreground block mb-0.5">الحالي:</span>{result.translation}</div>
        {result.styleIssues.map((iss, i) => <div key={i} className="text-xs text-amber-400 bg-amber-500/10 rounded px-2 py-1">🎨 {iss}</div>)}
        {result.changes.length > 0 && <div className="text-[10px] text-muted-foreground">التغييرات: {result.changes.join(' • ')}</div>}
        {result.unifiedVersion && (
          <div className="text-xs border border-primary/30 bg-primary/10 rounded p-2 flex items-start justify-between gap-2">
            <div className="flex-1"><span className="text-[10px] text-primary block mb-0.5">✨ بعد التوحيد:</span><div dir="rtl">{result.unifiedVersion}</div></div>
            <Button variant="ghost" size="sm" onClick={() => onApply(result.key, result.unifiedVersion!)} className="h-7 px-2 text-xs text-primary hover:bg-primary/20 shrink-0">
              <Check className="w-3 h-3" /> تطبيق
            </Button>
          </div>
        )}
      </div>
    )}
  </div>
);

const ConsistencyCard: React.FC<{ item: ConsistencyItem }> = ({ item }) => (
  <div className={cn("rounded-lg border p-2.5 text-xs", item.severity === 'high' ? "border-destructive/30 bg-destructive/5" : item.severity === 'medium' ? "border-amber-500/30 bg-amber-500/5" : "border-border/50")}>
    <div className="flex items-center justify-between mb-1.5">
      <Badge variant="outline" className="text-[10px] h-5">{item.type === 'terminology' ? '📖 مصطلح' : item.type === 'character' ? '👤 شخصية' : item.type === 'style' ? '🎨 أسلوب' : '📚 قاموس'}</Badge>
      <span className="font-mono text-muted-foreground" dir="ltr">{item.term}</span>
    </div>
    <div className="space-y-1 mb-1.5">
      {item.variants.map((v, i) => (
        <div key={i} className="bg-muted/20 rounded px-2 py-0.5 flex justify-between">
          <span className="text-muted-foreground">[{v.index}]</span>
          <span dir="rtl">{v.text}</span>
        </div>
      ))}
    </div>
    <div className="border-t border-border/30 pt-1.5 flex items-center gap-1">
      <Check className="w-3 h-3 text-emerald-400" />
      <span className="text-emerald-400">الموصى به:</span>
      <span dir="rtl" className="font-medium">{item.recommended}</span>
    </div>
  </div>
);

const AlternativesCard: React.FC<{ result: AlternativeResult; expanded: boolean; onToggle: () => void; onApply: (k: string, t: string) => void; onSave?: (k: string, o: string, t: string) => void }> = ({ result, expanded, onToggle, onApply, onSave }) => (
  <div className="rounded-lg border border-border/50 overflow-hidden">
    <button onClick={onToggle} className="w-full flex items-center justify-between p-2 text-right hover:bg-muted/30">
      <div className="flex items-center gap-2">
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <Badge variant="outline" className="text-[10px] h-5">{result.alternatives.length} بدائل</Badge>
        {result.characterContext && <Badge variant="outline" className="text-[10px] h-5 border-blue-500/40 text-blue-400"><User className="w-2.5 h-2.5" />{result.characterContext}</Badge>}
      </div>
      <span className="text-xs text-muted-foreground truncate max-w-[50%] font-mono" dir="ltr">{result.key.split(':').pop()}</span>
    </button>
    {expanded && (
      <div className="px-3 pb-3 space-y-2">
        <div className="text-xs bg-muted/20 rounded p-2" dir="ltr"><span className="text-[10px] text-muted-foreground block mb-0.5">🇬🇧:</span>{result.original}</div>
        <div className="text-xs bg-card/50 border rounded p-2" dir="rtl"><span className="text-[10px] text-muted-foreground block mb-0.5">الحالي:</span>{result.translation}</div>
        <div className="space-y-1.5">
          {result.alternatives.map((alt, i) => (
            <div key={i} className={cn("text-xs rounded p-2 border flex items-start justify-between gap-2", alt.style === result.recommended ? "border-emerald-500/40 bg-emerald-500/10" : "border-border/30")}>
              <div className="flex-1">
                <Badge variant="outline" className="text-[9px] h-4 px-1 mb-1">{styleLabels[alt.style] || alt.style}</Badge>
                {alt.style === result.recommended && <Badge className="text-[9px] h-4 px-1 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 mr-1">⭐</Badge>}
                <div dir="rtl">{alt.text}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{alt.note}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { onApply(result.key, alt.text); onSave?.(result.key, result.original, alt.text); }}
                className="h-7 px-2 text-xs text-emerald-400 hover:bg-emerald-500/20 shrink-0">
                <Check className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const FullAnalysisCard: React.FC<{ result: FullAnalysisResult; expanded: boolean; onToggle: () => void; onApply: (k: string, t: string) => void; onSave?: (k: string, o: string, t: string) => void }> = ({ result, expanded, onToggle, onApply, onSave }) => (
  <div className={cn("rounded-lg border overflow-hidden", result.isLiteral ? "border-destructive/30 bg-destructive/5" : result.issues.length > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border/50")}>
    <button onClick={onToggle} className="w-full flex items-center justify-between p-2 text-right hover:bg-muted/30">
      <div className="flex items-center gap-1.5">
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {result.sceneType && sceneIcons[result.sceneType] && <Badge variant="outline" className="text-[10px] h-5 px-1 gap-0.5">{sceneIcons[result.sceneType]}</Badge>}
        {result.character && <Badge variant="outline" className="text-[10px] h-5 px-1 border-blue-500/40 text-blue-400"><User className="w-2.5 h-2.5" />{result.character}</Badge>}
        {result.isLiteral && <Badge variant="outline" className="text-[10px] h-5 border-destructive/40 text-destructive">حرفية {result.literalScore}%</Badge>}
        {result.issues.length > 0 && <Badge variant="outline" className="text-[10px] h-5 border-amber-500/40 text-amber-400"><AlertTriangle className="w-2.5 h-2.5" />{result.issues.length}</Badge>}
        {result.alternatives.length > 0 && <Badge variant="outline" className="text-[10px] h-5 border-emerald-500/40 text-emerald-400"><Lightbulb className="w-2.5 h-2.5" />{result.alternatives.length}</Badge>}
      </div>
      <span className="text-xs text-muted-foreground truncate max-w-[35%] font-mono" dir="ltr">{result.key.split(':').pop()}</span>
    </button>
    {expanded && (
      <div className="px-3 pb-3 space-y-2">
        <div className="text-xs bg-muted/20 rounded p-2" dir="ltr"><span className="text-[10px] text-muted-foreground block mb-0.5">🇬🇧:</span>{result.original}</div>
        <div className="text-xs bg-card/50 border rounded p-2" dir="rtl"><span className="text-[10px] text-muted-foreground block mb-0.5">الحالي:</span>{result.translation}</div>
        {result.issues.map((iss, i) => (
          <div key={i} className={cn("text-xs rounded px-2 py-1 border",
            iss.severity === 'high' ? "border-destructive/40 bg-destructive/10 text-destructive" :
            iss.severity === 'medium' ? "border-amber-500/40 bg-amber-500/10 text-amber-400" :
            "border-blue-500/40 bg-blue-500/10 text-blue-400"
          )}>
            {iss.type === 'literal' && '📝'}{iss.type === 'awkward' && '🔧'}{iss.type === 'inconsistent' && '⚠️'}{iss.type === 'style' && '✨'} {iss.message}
          </div>
        ))}
        {result.alternatives.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground">البدائل:</span>
            {result.alternatives.map((alt, i) => (
              <div key={i} className={cn("text-xs rounded p-2 border flex items-start justify-between gap-2", alt.text === result.recommended ? "border-emerald-500/40 bg-emerald-500/10" : "border-border/30")}>
                <div className="flex-1">
                  <Badge variant="outline" className="text-[9px] h-4 px-1 mb-1">{styleLabels[alt.style] || alt.style}</Badge>
                  {alt.text === result.recommended && <Badge className="text-[9px] h-4 px-1 bg-emerald-500/20 text-emerald-400 mr-1">⭐</Badge>}
                  <div dir="rtl">{alt.text}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{alt.note}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { onApply(result.key, alt.text); onSave?.(result.key, result.original, alt.text); }}
                  className="h-7 px-2 text-xs text-emerald-400 hover:bg-emerald-500/20 shrink-0">
                  <Check className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {result.recommended && !result.alternatives.find(a => a.text === result.recommended) && (
          <div className="text-xs border border-emerald-500/40 bg-emerald-500/10 rounded p-2 flex items-start justify-between gap-2">
            <div className="flex-1"><Badge className="text-[9px] h-4 bg-emerald-500/20 text-emerald-400 mb-1">⭐ الأفضل</Badge><div dir="rtl">{result.recommended}</div></div>
            <Button variant="ghost" size="sm" onClick={() => { onApply(result.key, result.recommended!); onSave?.(result.key, result.original, result.recommended!); }}
              className="h-7 px-2 text-xs text-emerald-400 hover:bg-emerald-500/20 shrink-0"><Check className="w-3 h-3" /></Button>
          </div>
        )}
      </div>
    )}
  </div>
);

export default AdvancedTranslationPanel;
