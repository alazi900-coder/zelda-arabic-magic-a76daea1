import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Brain, Copy, Check, Pencil, RefreshCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getEdgeFunctionUrl, getSupabaseHeaders } from "@/lib/supabase-edge";
import type { ExtractedEntry } from "./types";

interface Suggestion {
  translation: string;
  style: "formal" | "natural" | "creative";
  styleLabel: string;
  reason: string;
  confidence: number;
}

interface ContextSuggestPanelProps {
  open: boolean;
  onClose: () => void;
  entry: ExtractedEntry | null;
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  glossary?: string;
  onApplyTranslation: (key: string, text: string) => void;
}

// In-memory cache keyed by `${msbtFile}:${index}` so re-opens skip the AI call.
const suggestionCache = new Map<string, { suggestions: Suggestion[]; contextNote: string }>();

const STYLE_STYLES: Record<Suggestion["style"], { emoji: string; cls: string }> = {
  formal: { emoji: "📜", cls: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  natural: { emoji: "💬", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  creative: { emoji: "✨", cls: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
};

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

const ContextSuggestPanel: React.FC<ContextSuggestPanelProps> = ({
  open, onClose, entry, entries, translations, glossary, onApplyTranslation,
}) => {
  const key = entry ? `${entry.msbtFile}:${entry.index}` : "";
  const currentTranslation = entry ? translations[key] || "" : "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [contextNote, setContextNote] = useState<string>("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Load from cache on open.
  useEffect(() => {
    if (!open || !entry) return;
    const cached = suggestionCache.get(key);
    if (cached) {
      setSuggestions(cached.suggestions);
      setContextNote(cached.contextNote);
      setError(null);
    } else {
      setSuggestions([]);
      setContextNote("");
      setError(null);
    }
    setEditingIdx(null);
  }, [open, entry, key]);

  const contextWindow = useMemo(() => {
    if (!entry) return [];
    const fileEntries = entries
      .filter((e) => e.msbtFile === entry.msbtFile)
      .sort((a, b) => a.index - b.index);
    const idx = fileEntries.findIndex((e) => e.index === entry.index);
    if (idx < 0) return [];
    const start = Math.max(0, idx - 3);
    const end = Math.min(fileEntries.length, idx + 4);
    return fileEntries.slice(start, end)
      .filter((e) => e.index !== entry.index)
      .map((e) => ({
        original: e.original,
        translation: translations[`${e.msbtFile}:${e.index}`] || "",
      }));
  }, [entry, entries, translations]);

  const glossarySnippet = useMemo(() => {
    if (!glossary?.trim()) return "";
    return glossary.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).slice(0, 40).join("\n");
  }, [glossary]);

  const generate = async () => {
    if (!entry) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getEdgeFunctionUrl("context-suggest"), {
        method: "POST",
        headers: getSupabaseHeaders(),
        body: JSON.stringify({
          target: { original: entry.original, translation: currentTranslation },
          context: contextWindow,
          glossary: glossarySnippet,
          file: entry.msbtFile.split(":")[1] || entry.msbtFile,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const sg: Suggestion[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
      const note: string = data?.contextNote || "";
      setSuggestions(sg);
      setContextNote(note);
      suggestionCache.set(key, { suggestions: sg, contextNote: note });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const applyText = (text: string) => {
    if (!entry) return;
    onApplyTranslation(key, text);
    toast({ title: "✅ تم التطبيق", description: "تم تحديث الترجمة" });
    onClose();
  };

  const copyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1200);
    } catch {
      toast({ title: "تعذّر النسخ", variant: "destructive" });
    }
  };

  if (!entry) return null;
  const maxBytes = entry.maxBytes || 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            💡 اقتراحات سياقية بالذكاء الاصطناعي
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 border-b pb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">الأصل</p>
            <p dir="ltr" className="text-sm font-mono bg-muted/40 rounded p-2 whitespace-pre-wrap break-words">
              {entry.original}
            </p>
          </div>
          {currentTranslation && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">الترجمة الحالية</p>
                {maxBytes > 0 && (
                  <Badge variant="outline" className={`text-[10px] ${
                    utf8Bytes(currentTranslation) > maxBytes
                      ? "bg-destructive/15 text-destructive border-destructive/40"
                      : ""
                  }`}>
                    {utf8Bytes(currentTranslation)}/{maxBytes} B
                  </Badge>
                )}
              </div>
              <p dir="rtl" className="text-sm bg-muted/40 rounded p-2 whitespace-pre-wrap break-words">
                {currentTranslation}
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto -mx-2 px-2 py-3 space-y-3">
          {!suggestions.length && !loading && !error && (
            <div className="text-center py-10 space-y-3">
              <Brain className="w-12 h-12 mx-auto text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">اضغط لتوليد 3 اقتراحات بأساليب مختلفة</p>
              <Button onClick={generate}>
                توليد اقتراحات
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">يتم تحليل السياق...</p>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && suggestions.length > 0 && (
            <>
              {contextNote && (
                <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-foreground/90">
                  📌 {contextNote}
                </div>
              )}
              {suggestions.map((s, idx) => {
                const styleMeta = STYLE_STYLES[s.style] || STYLE_STYLES.natural;
                const bytes = utf8Bytes(s.translation);
                const overflow = maxBytes > 0 && bytes > maxBytes;
                const isEditing = editingIdx === idx;
                return (
                  <div key={idx} className="rounded-lg border bg-card/60 p-3 space-y-2">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <Badge variant="outline" className={styleMeta.cls}>
                        {styleMeta.emoji} {s.styleLabel || s.style}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {Math.round((s.confidence || 0) * 100)}% ثقة
                      </Badge>
                      {maxBytes > 0 && (
                        <Badge variant="outline" className={`text-[10px] ${
                          overflow ? "bg-destructive/15 text-destructive border-destructive/40" : ""
                        }`}>
                          {bytes}/{maxBytes} B
                        </Badge>
                      )}
                    </div>

                    {isEditing ? (
                      <Textarea
                        dir="rtl"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={3}
                        className="text-sm"
                      />
                    ) : (
                      <p dir="rtl" className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {s.translation}
                      </p>
                    )}

                    {s.reason && !isEditing && (
                      <p className="text-xs text-muted-foreground">💡 {s.reason}</p>
                    )}

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {isEditing ? (
                        <>
                          <Button size="sm" onClick={() => { applyText(editValue); setEditingIdx(null); }}>
                            حفظ وتطبيق
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingIdx(null)}>
                            إلغاء
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => applyText(s.translation)}>
                            ✅ تطبيق
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditValue(s.translation); setEditingIdx(idx);
                          }}>
                            <Pencil className="w-3.5 h-3.5 ml-1" /> تعديل
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => copyText(s.translation, idx)}>
                            {copiedIdx === idx
                              ? <Check className="w-3.5 h-3.5 ml-1 text-emerald-500" />
                              : <Copy className="w-3.5 h-3.5 ml-1" />}
                            نسخ
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="pt-2">
                <Button size="sm" variant="outline" onClick={() => { suggestionCache.delete(key); generate(); }} disabled={loading}>
                  <RefreshCcw className="w-3.5 h-3.5 ml-1" /> إعادة التوليد
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button size="sm" variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContextSuggestPanel;
