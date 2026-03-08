import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Sparkles, AlertTriangle, Wrench } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ExtractedEntry } from "./types";

interface CompareResult {
  gemini?: string;
  mymemory?: string;
  google?: string;
}

interface CompareEnginesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ExtractedEntry | null;
  onSelect: (key: string, translation: string) => void;
  glossary: string;
  userGeminiKey: string;
  myMemoryEmail: string;
  aiModel?: string;
}

const ENGINE_LABELS: Record<string, { label: string; emoji: string }> = {
  gemini: { label: "Gemini AI", emoji: "🤖" },
  mymemory: { label: "MyMemory", emoji: "🆓" },
  google: { label: "Google Translate", emoji: "🌐" },
};

const TECH_TAG_RENDER_REGEX = /([\uFFF9-\uFFFC]|[\uE000-\uE0FF]+|\d+\s*\[[A-Z]{2,10}\]|\[[A-Z]{2,10}\]\s*\d+|\[\s*\w+\s*:[^\]]*?\s*\]|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\})/g;

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

/** Auto-fix broken tags: remove extras, append missing ones at the end */
function autoFixTags(originalText: string, translatedText: string): string {
  const origTags = extractTags(originalText);
  const transTags = extractTags(translatedText);

  const origCount = new Map<string, number>();
  origTags.forEach(t => origCount.set(t, (origCount.get(t) || 0) + 1));

  // Keep valid tags already in translation (up to original count)
  const usedCount = new Map<string, number>();
  for (const tt of transTags) {
    const oc = origCount.get(tt) || 0;
    const uc = usedCount.get(tt) || 0;
    if (uc < oc) usedCount.set(tt, uc + 1);
  }

  // Find missing tags
  const missingTags: string[] = [];
  origCount.forEach((count, tag) => {
    const have = usedCount.get(tag) || 0;
    for (let i = 0; i < count - have; i++) missingTags.push(tag);
  });

  // Find & remove extra tags (last occurrences first)
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

  // Append missing tags
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
  open, onOpenChange, entry, onSelect, glossary, userGeminiKey, myMemoryEmail,
}) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CompareResult>({});
  const [error, setError] = useState("");

  const handleCompare = async () => {
    if (!entry) return;
    setLoading(true);
    setError("");
    setResults({});

    const key = `${entry.msbtFile}:${entry.index}`;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const fetchProvider = async (provider: string) => {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/translate-entries`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entries: [{ key, original: entry.original }],
            glossary,
            provider,
            userApiKey: provider === 'gemini' ? (userGeminiKey || undefined) : undefined,
            myMemoryEmail: provider === 'mymemory' ? (myMemoryEmail || undefined) : undefined,
          }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        const raw = data.translations?.[key] || null;
        if (!raw) return null;
        return raw;
      } catch {
        return null;
      }
    };

    try {
      const [gemini, mymemory, google] = await Promise.all([
        fetchProvider('gemini'),
        fetchProvider('mymemory'),
        fetchProvider('google'),
      ]);
      setResults({ gemini, mymemory, google });
    } catch (err) {
      setError("حدث خطأ أثناء المقارنة");
    } finally {
      setLoading(false);
    }
  };

  // Auto-compare when dialog opens with a new entry
  React.useEffect(() => {
    if (open && entry) {
      handleCompare();
    }
    if (!open) {
      setResults({});
      setError("");
    }
  }, [open, entry?.msbtFile, entry?.index]);

  const key = entry ? `${entry.msbtFile}:${entry.index}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">🔍 مقارنة المحركات</DialogTitle>
          <DialogDescription className="text-xs">
            مقارنة ترجمة نفس النص بين المحركات الثلاثة — اختر الأفضل
          </DialogDescription>
        </DialogHeader>

        {entry && (
          <div className="space-y-4">
            {/* Original text */}
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">النص الأصلي:</p>
              <p className="text-sm font-body">{entry.original}</p>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">جاري ترجمة النص بالمحركات الثلاثة...</span>
              </div>
            )}

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            {!loading && Object.keys(results).length > 0 && (
              <div className="space-y-3">
                {(["gemini", "mymemory", "google"] as const).map((engine) => {
                  const result = results[engine];
                  const info = ENGINE_LABELS[engine];
                  const integrity = result && entry ? checkTagIntegrity(entry.original, result) : null;
                  const hasProblem = integrity && !integrity.ok;
                  return (
                    <div
                      key={engine}
                      className={`p-3 rounded-lg border transition-colors group ${hasProblem ? 'border-destructive/50 bg-destructive/5' : 'border-border hover:border-primary/40'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-display font-bold">
                          {info.emoji} {info.label}
                        </span>
                        <div className="flex items-center gap-1">
                          {hasProblem && (
                            <span className="text-xs text-destructive flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> وسوم مكسورة
                            </span>
                          )}
                          {result && !hasProblem && (
                            <span className="text-xs text-primary flex items-center gap-1">
                              <Check className="w-3 h-3" /> وسوم سليمة
                            </span>
                          )}
                          {result && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                onSelect(key, result);
                                onOpenChange(false);
                              }}
                            >
                              <Check className="w-3 h-3 ml-1" /> اختيار
                            </Button>
                          )}
                        </div>
                      </div>
                      {result ? (
                        <>
                          <p className="text-sm font-body whitespace-pre-wrap break-words">
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
                                    setResults(prev => ({ ...prev, [engine]: fixed }));
                                  }}
                                >
                                  <Wrench className="w-3 h-3 ml-1" /> إصلاح الوسوم تلقائياً
                                </Button>
                              </AlertDescription>
                            </Alert>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">فشل في الترجمة أو لا توجد نتيجة</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

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

