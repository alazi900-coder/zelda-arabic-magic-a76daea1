import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, X, XCircle, ArrowDownUp, Pencil } from "lucide-react";

export interface SentenceOrderResult {
  key: string;
  before: string;
  after: string;
  sentenceCount: number;
  status: 'pending' | 'accepted' | 'rejected';
  customEdit?: string;
}

/**
 * Detect multi-sentence translations where the sentence order may be reversed.
 *
 * We split sentences in a way that works for Arabic punctuation and also for
 * AI outputs that sometimes omit spaces after punctuation (e.g. "جملة.أخرى").
 */
const SENTENCE_SPLIT_REGEX = /(?<=[.。!؟?\u061F…]+)(?:\s+|(?=[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FFA-Za-z]))/u;

function splitIntoSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT_REGEX)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function reverseSentenceOrder(text: string): string {
  const sentences = splitIntoSentences(text);
  if (sentences.length < 2) return text;
  return sentences.reverse().join(' ');
}

export function detectReversedSentences(
  entries: { msbtFile: string; index: number; original: string }[],
  translations: Record<string, string>
): SentenceOrderResult[] {
  const results: SentenceOrderResult[] = [];

  for (const entry of entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    const translation = translations[key];
    if (!translation?.trim()) continue;

    // Only check multi-sentence texts
    const sentences = splitIntoSentences(translation);
    if (sentences.length < 2) continue;

    // Must have Arabic content
    if (!/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(translation)) continue;

    const reversed = reverseSentenceOrder(translation);
    if (reversed === translation) continue;

    results.push({
      key,
      before: translation,
      after: reversed,
      sentenceCount: sentences.length,
      status: 'pending',
    });
  }

  return results;
}

interface SentenceOrderPanelProps {
  results: SentenceOrderResult[];
  onAccept: (key: string, customText?: string) => void;
  onReject: (key: string) => void;
  onAcceptAll: () => void;
  onClose: () => void;
}

const SentenceOrderPanel: React.FC<SentenceOrderPanelProps> = ({
  results, onAccept, onReject, onAcceptAll, onClose,
}) => {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const pending = results.filter(r => r.status === 'pending');
  const accepted = results.filter(r => r.status === 'accepted').length;
  const rejected = results.filter(r => r.status === 'rejected').length;

  if (results.length === 0) return null;

  const startEdit = (item: SentenceOrderResult) => {
    setEditingKey(item.key);
    setEditText(item.before);
  };

  const confirmEdit = (key: string) => {
    onAccept(key, editText);
    setEditingKey(null);
    setEditText('');
  };

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-sm">
            <ArrowDownUp className="w-4 h-4 inline ml-1" />
            فحص ترتيب الجمل — {results.length} نص متعدد الجمل
            {accepted > 0 && <span className="text-secondary mr-2"> ✅ {accepted}</span>}
            {rejected > 0 && <span className="text-destructive mr-2"> ❌ {rejected}</span>}
          </h3>
          <div className="flex gap-2">
            {pending.length > 0 && (
              <Button variant="default" size="sm" onClick={onAcceptAll} className="text-xs font-display">
                <CheckCircle2 className="w-3 h-3" /> عكس الكل ({pending.length})
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          هذه النصوص تحتوي على أكثر من جملة. راجع الترتيب واقبل العكس أو حرّر يدوياً.
        </p>

        <div className="space-y-2 max-h-[500px] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          {results.map((item) => {
            if (item.status !== 'pending') return null;
            const isEditing = editingKey === item.key;
            return (
              <div
                key={item.key}
                className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground font-mono truncate" dir="ltr">
                    {item.key.split(':').slice(1, 3).join(':')}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {item.sentenceCount} جمل
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-destructive shrink-0 mt-1">الحالي:</span>
                  <p className="text-sm font-body text-foreground bg-destructive/5 rounded px-2 py-1 flex-1" dir="rtl" style={{ unicodeBidi: 'plaintext' }}>
                    {item.before}
                  </p>
                </div>

                {!isEditing && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-secondary shrink-0 mt-1">معكوس:</span>
                    <p className="text-sm font-body text-foreground bg-secondary/5 rounded px-2 py-1 flex-1" dir="rtl" style={{ unicodeBidi: 'plaintext' }}>
                      {item.after}
                    </p>
                  </div>
                )}

                {isEditing && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-accent-foreground shrink-0 mt-1">تحرير:</span>
                      <Textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        dir="rtl"
                        className="text-sm font-body flex-1 min-h-[60px]"
                        style={{ unicodeBidi: 'plaintext' }}
                      />
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setEditingKey(null)} className="h-7 px-2 text-xs font-display">
                        إلغاء
                      </Button>
                      <Button variant="default" size="sm" onClick={() => confirmEdit(item.key)} className="h-7 px-2 text-xs font-display">
                        <CheckCircle2 className="w-3 h-3" /> حفظ
                      </Button>
                    </div>
                  </div>
                )}

                {!isEditing && (
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReject(item.key)}
                      className="h-7 px-2 text-xs font-display border-destructive/30 text-destructive hover:text-destructive"
                    >
                      <XCircle className="w-3 h-3" /> الترتيب صحيح
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(item)}
                      className="h-7 px-2 text-xs font-display border-accent/30"
                    >
                      <Pencil className="w-3 h-3" /> تحرير يدوي
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAccept(item.key)}
                      className="h-7 px-2 text-xs font-display border-secondary/30 text-secondary hover:text-secondary"
                    >
                      <ArrowDownUp className="w-3 h-3" /> عكس الترتيب
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {pending.length === 0 && (
          <p className="text-center text-sm text-muted-foreground font-body py-4">
            ✅ تمت مراجعة جميع النتائج — {accepted} معكوسة، {rejected} صحيحة
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default SentenceOrderPanel;
