import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Sparkles, AlertTriangle, Wrench } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ExtractedEntry } from "./types";
import { getEdgeFunctionUrl, getSupabaseHeaders } from "@/lib/supabase-edge";

interface CompareEnginesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ExtractedEntry | null;
  onSelect: (key: string, translation: string) => void;
  glossary: string;
  userGeminiKey: string;
  userDeepSeekKey?: string;
  userGroqKey?: string;
  userOpenRouterKey?: string;
  myMemoryEmail: string;
  aiModel?: string;
}

interface EngineConfig {
  id: string;
  label: string;
  emoji: string;
  provider: string;
  model?: string;
  description: string;
  requiresKey?: 'gemini' | 'deepseek' | 'groq' | 'openrouter';
}

const ALL_ENGINES: EngineConfig[] = [
  { id: 'gemini-flash', label: 'Gemini 2.5 Flash', emoji: '⚡', provider: 'gemini', model: 'gemini-2.5-flash', description: 'سريع ومتوازن' },
  { id: 'gemini-pro', label: 'Gemini 2.5 Pro', emoji: '🎯', provider: 'gemini', model: 'gemini-2.5-pro', description: 'الأدق للمصطلحات' },
  { id: 'gemini-3.1', label: 'Gemini 3.1 Pro', emoji: '🆕', provider: 'gemini', model: 'gemini-3.1-pro-preview', description: 'أحدث نموذج Google' },
  { id: 'gpt-5', label: 'GPT-5', emoji: '🧠', provider: 'gemini', model: 'gpt-5', description: 'استدلال متقدم OpenAI' },
  { id: 'deepseek', label: 'DeepSeek Chat', emoji: '🐋', provider: 'deepseek', description: 'ممتاز للعربية', requiresKey: 'deepseek' },
  { id: 'groq', label: 'Groq Llama 3.3', emoji: '⚡', provider: 'groq', description: 'سريع جداً (مجاني)', requiresKey: 'groq' },
  { id: 'glm', label: 'GLM 4.6 (Z.AI)', emoji: '🆕', provider: 'openrouter', model: 'z-ai/glm-4.6:free', description: 'مجاني عبر OpenRouter', requiresKey: 'openrouter' },
  { id: 'mymemory', label: 'MyMemory', emoji: '🆓', provider: 'mymemory', description: 'ذاكرة ترجمة مجانية' },
  { id: 'google', label: 'Google Translate', emoji: '🌐', provider: 'google', description: 'ترجمة Google المباشرة' },
];

const TECH_TAG_RENDER_REGEX = /([\uFFF9-\uFFFC]|[\uE000-\uE0FF]+|\d+\s*\[[A-Z]{2,10}\]|\[[A-Z]{2,10}\]\s*\d+|\[\s*\/?\s*\w+\s*:[^\]]*?\s*\]|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\})/g;

function extractTags(text: string): string[] {
  const r = new RegExp(TECH_TAG_RENDER_REGEX.source, 'g');
  return Array.from(text.matchAll(r)).map(m => m[0]);
}

function checkTagIntegrity(originalText: string, translatedText: string): { ok: boolean; missing: string[]; extra: string[] } {
  const origTags = extractTags(originalText);
  const transTags = extractTags(translatedText);
  const origCount = new Map<string, number>();
  const transCount = new Map<string, number>();
  origTags.forEach(t => origCount.set(t, (origCount.get(t) || 0) + 1));
  transTags.forEach(t => transCount.set(t, (transCount.get(t) || 0) + 1));
  const missing: string[] = [];
  const extra: string[] = [];
  origCount.forEach((count, tag) => {
    const tc = transCount.get(tag) || 0;
    for (let i = 0; i < count - tc; i++) missing.push(tag);
  });
  transCount.forEach((count, tag) => {
    const oc = origCount.get(tag) || 0;
    for (let i = 0; i < count - oc; i++) extra.push(tag);
  });
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

function autoFixTags(originalText: string, translatedText: string): string {
  const origTags = extractTags(originalText);
  const transTags = extractTags(translatedText);
  const origCount = new Map<string, number>();
  origTags.forEach(t => origCount.set(t, (origCount.get(t) || 0) + 1));
  const usedCount = new Map<string, number>();
  for (const tt of transTags) {
    const oc = origCount.get(tt) || 0;
    const uc = usedCount.get(tt) || 0;
    if (uc < oc) usedCount.set(tt, uc + 1);
  }
  const missingTags: string[] = [];
  origCount.forEach((count, tag) => {
    const have = usedCount.get(tag) || 0;
    for (let i = 0; i < count - have; i++) missingTags.push(tag);
  });
  let rebuilt = translatedText;
  const extraCount = new Map<string, number>();
  const extrasToRemove = new Map<string, number>();
  for (const tt of transTags) {
    const oc = origCount.get(tt) || 0;
    const ec = extraCount.get(tt) || 0;
    extraCount.set(tt, ec + 1);
    if (ec + 1 > oc) {
      extrasToRemove.set(tt, (extrasToRemove.get(tt) || 0) + 1);
    }
  }
  if (extrasToRemove.size > 0) {
    const allMatches: { tag: string; start: number; end: number }[] = [];
    const rx = new RegExp(TECH_TAG_RENDER_REGEX.source, 'g');
    let mx: RegExpExecArray | null;
    while ((mx = rx.exec(rebuilt)) !== null) {
      allMatches.push({ tag: mx[0], start: mx.index, end: mx.index + mx[0].length });
    }
    for (let i = allMatches.length - 1; i >= 0; i--) {
      const am = allMatches[i];
      const rem = extrasToRemove.get(am.tag) || 0;
      if (rem > 0) {
        rebuilt = rebuilt.substring(0, am.start) + rebuilt.substring(am.end);
        extrasToRemove.set(am.tag, rem - 1);
      }
    }
  }
  if (missingTags.length > 0) {
    rebuilt = rebuilt.trimEnd() + ' ' + missingTags.join(' ');
  }
  return rebuilt.replace(/\s{2,}/g, ' ').trim();
}

function renderTranslationWithProtectedTags(text: string) {
  const parts = text.split(TECH_TAG_RENDER_REGEX).filter(Boolean);
  return parts.map((part, idx) => {
    if (TECH_TAG_RENDER_REGEX.test(part)) {
      TECH_TAG_RENDER_REGEX.lastIndex = 0;
      return (
        <span key={`tag-${idx}`} dir="ltr" className="inline-flex items-center px-1 py-0.5 mx-0.5 rounded font-mono text-xs bg-primary/15 text-primary border border-primary/25 whitespace-pre-wrap break-all">
          {part}
        </span>
      );
    }
    TECH_TAG_RENDER_REGEX.lastIndex = 0;
    return (
      <span key={`txt-${idx}`} dir="auto" style={{ unicodeBidi: "plaintext" }}>
        {part}
      </span>
    );
  });
}

const CompareEnginesDialog: React.FC<CompareEnginesDialogProps> = ({
  open, onOpenChange, entry, onSelect, glossary, userGeminiKey, userDeepSeekKey, userGroqKey, userOpenRouterKey, myMemoryEmail,
}) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, string | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingEngines, setLoadingEngines] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const getProviderKey = (engine: EngineConfig): string | undefined => {
    if (engine.requiresKey === 'deepseek') return userDeepSeekKey || undefined;
    if (engine.requiresKey === 'groq') return userGroqKey || undefined;
    if (engine.requiresKey === 'openrouter') return userOpenRouterKey || undefined;
    return undefined;
  };

  const handleCompare = async () => {
    if (!entry) return;
    setLoading(true);
    setError("");
    setResults({});
    setErrors({});

    // Filter engines: skip those that require missing keys
    const enginesToRun = ALL_ENGINES.filter(e => {
      if (e.requiresKey === 'deepseek') return !!userDeepSeekKey;
      if (e.requiresKey === 'groq') return !!userGroqKey;
      if (e.requiresKey === 'openrouter') return !!userOpenRouterKey;
      return true;
    });

    // Mark skipped engines with error message
    const skipped: Record<string, string> = {};
    for (const e of ALL_ENGINES) {
      if (!enginesToRun.includes(e)) {
        skipped[e.id] = `يحتاج مفتاح ${e.requiresKey?.toUpperCase()} — أضفه في إعدادات المحرك`;
      }
    }
    setErrors(skipped);
    setLoadingEngines(new Set(enginesToRun.map(e => e.id)));

    const key = `${entry.msbtFile}:${entry.index}`;
    const fetchEngine = async (engine: EngineConfig) => {
      try {
        const providerKey = getProviderKey(engine);
        const response = await fetch(getEdgeFunctionUrl("translate-entries"), {
          method: 'POST',
          headers: getSupabaseHeaders(),
          body: JSON.stringify({
            entries: [{ key, original: entry.original }],
            glossary,
            provider: engine.provider,
            userApiKey: engine.provider === 'gemini' ? (userGeminiKey || undefined) : undefined,
            providerApiKey: providerKey,
            myMemoryEmail: engine.provider === 'mymemory' ? (myMemoryEmail || undefined) : undefined,
            aiModel: engine.model || undefined,
          }),
        });
        if (!response.ok) {
          let errMsg = `خطأ ${response.status}`;
          try { const j = await response.json(); if (j.error) errMsg = j.error; } catch {}
          return { id: engine.id, result: null, error: errMsg };
        }
        const data = await response.json();
        return { id: engine.id, result: data.translations?.[key] || null, error: undefined };
      } catch (e) {
        return { id: engine.id, result: null, error: e instanceof Error ? e.message : 'فشل الاتصال' };
      }
    };

    try {
      const promises = enginesToRun.map(engine =>
        fetchEngine(engine).then(({ id, result, error: engErr }) => {
          setResults(prev => ({ ...prev, [id]: result }));
          if (engErr) setErrors(prev => ({ ...prev, [id]: engErr }));
          setLoadingEngines(prev => { const next = new Set(prev); next.delete(id); return next; });
        })
      );
      await Promise.all(promises);
    } catch {
      setError("حدث خطأ أثناء المقارنة");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (open && entry) handleCompare();
    if (!open) { setResults({}); setErrors({}); setError(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.msbtFile, entry?.index]);

  const key = entry ? `${entry.msbtFile}:${entry.index}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">🔍 مقارنة جميع المحركات</DialogTitle>
          <DialogDescription className="text-xs">
            مقارنة ترجمة نفس النص عبر <span className="font-bold text-primary">{ALL_ENGINES.length}</span> محركات مختلفة — اختر الأفضل
          </DialogDescription>
        </DialogHeader>

        {entry && (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            {/* Original text */}
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">النص الأصلي:</p>
              <p className="text-sm font-body">{entry.original}</p>
            </div>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            {/* Results grid - scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: '55vh' }}>
              {ALL_ENGINES.map((engine) => {
                const result = results[engine.id];
                const isEngineLoading = loadingEngines.has(engine.id);
                const integrity = result && entry ? checkTagIntegrity(entry.original, result) : null;
                const hasProblem = integrity && !integrity.ok;

                return (
                  <div
                    key={engine.id}
                    className={`p-3 rounded-lg border transition-colors group ${
                      hasProblem ? 'border-destructive/50 bg-destructive/5'
                      : result ? 'border-border hover:border-primary/40'
                      : 'border-border/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-display font-bold">
                          {engine.emoji} {engine.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{engine.description}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {isEngineLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                        {hasProblem && (
                          <span className="text-xs text-destructive flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> وسوم مكسورة
                          </span>
                        )}
                        {result && !hasProblem && !isEngineLoading && (
                          <span className="text-xs text-primary flex items-center gap-1">
                            <Check className="w-3 h-3" /> سليم
                          </span>
                        )}
                        {result && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => { onSelect(key, result); onOpenChange(false); }}
                          >
                            <Check className="w-3 h-3 ml-1" /> اختيار
                          </Button>
                        )}
                      </div>
                    </div>

                    {isEngineLoading && !result ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">جاري الترجمة...</span>
                      </div>
                    ) : result ? (
                      <>
                        <p className="text-sm font-body whitespace-pre-wrap break-words" dir="rtl">
                          {renderTranslationWithProtectedTags(result)}
                        </p>
                        {hasProblem && (
                          <Alert variant="destructive" className="mt-2 py-2 px-3">
                            <AlertDescription className="text-xs">
                              {integrity!.missing.length > 0 && (
                                <span dir="ltr" className="block">⚠ مفقودة: <code className="font-mono bg-destructive/10 px-1 rounded">{integrity!.missing.join(' ، ')}</code></span>
                              )}
                              {integrity!.extra.length > 0 && (
                                <span dir="ltr" className="block">⚠ زائدة: <code className="font-mono bg-destructive/10 px-1 rounded">{integrity!.extra.join(' ، ')}</code></span>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2 h-7 text-xs border-destructive/30 hover:bg-destructive/10"
                                onClick={() => {
                                  const fixed = autoFixTags(entry!.original, result);
                                  setResults(prev => ({ ...prev, [engine.id]: fixed }));
                                }}
                              >
                                <Wrench className="w-3 h-3 ml-1" /> إصلاح الوسوم تلقائياً
                              </Button>
                            </AlertDescription>
                          </Alert>
                        )}
                      </>
                    ) : !isEngineLoading ? (
                      <p className="text-xs text-muted-foreground italic">
                        {errors[engine.id] || 'فشل في الترجمة أو لا توجد نتيجة'}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {!loading && (
              <Button variant="outline" size="sm" onClick={handleCompare} className="w-full font-display">
                <Sparkles className="w-4 h-4" /> إعادة المقارنة
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CompareEnginesDialog;
