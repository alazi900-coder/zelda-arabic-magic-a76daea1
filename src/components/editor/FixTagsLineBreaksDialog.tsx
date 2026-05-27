import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Textarea } from "@/components/ui/textarea";
import {
  Wrench, FileText, FileCheck2, AlertTriangle, Sparkles,
  Pencil, Check, X, CornerDownLeft, RefreshCw, AlignLeft, Wand2, Loader2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { RestoreReport, RestoreIssue, RestoreIssueReasons } from "@/lib/tag-restore";
import LineSplitFixPanel from "./LineSplitFixPanel";
import type { LineSplitEntryRef } from "@/lib/line-split-quality";

interface FixTagsLineBreaksDialogProps {
  open: boolean;
  report: RestoreReport | null;
  /** يُغلق النافذة دون تطبيق أيّ إصلاح. */
  onClose: () => void;
  /** يطبّق الإصلاح الآليّ فقط (لا يلمس عناصر «للمراجعة»). */
  onApply: () => void;
  /** حفظ تعديل يدويّ لترجمة واحدة من داخل النافذة. */
  onUpdateTranslation?: (key: string, value: string) => void;
  /** إعادة فحص بعد التعديلات اليدويّة. */
  onRescan?: () => void;
  /** إعادة ترتيب الرموز تلقائياً لكلّ ما هو ممكن (نفس العدد، ترتيب/قيم مختلفة). */
  onApplySmartReorder?: () => void;
  /** بيانات لازمة لتبويب «تحسين تقسيم الأسطر». */
  splitEntries?: LineSplitEntryRef[];
  splitTranslations?: Record<string, string>;
  onJumpToEntry?: (key: string) => void;
}

const TAG_REGEX = /[\uFFF9-\uFFFC\uE000-\uE0FF]/g;

/** يحوّل رمزاً (حرفاً واحداً) إلى تسميته `E000` / `FFF9`. */
function tagLabel(ch: string): string {
  return ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
}

/** يستخرج الرموز بترتيب ظهورها مع إزالة المكرّر للعرض السريع. */
function uniqueTags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of text || "") {
    const code = c.charCodeAt(0);
    if ((code >= 0xfff9 && code <= 0xfffc) || (code >= 0xe000 && code <= 0xe0ff)) {
      if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
  }
  return out;
}

/** كلّ الرموز بالترتيب (مع تكرار) — لمقارنة التتابع. */
function tagSequence(text: string): string[] {
  return (text || "").match(TAG_REGEX) || [];
}

/** يُظهر الرموز المخفيّة (PUA و FFF9..FFFC) بشكل قابل للقراءة. */
function renderInvisible(text: string): React.ReactNode {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let buffer = "";
  const flush = (k: string) => {
    if (buffer) {
      parts.push(<span key={`t-${k}-${parts.length}`}>{buffer}</span>);
      buffer = "";
    }
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const code = c.charCodeAt(0);
    if ((code >= 0xfff9 && code <= 0xfffc) || (code >= 0xe000 && code <= 0xe0ff)) {
      flush(`pre-${i}`);
      parts.push(
        <span
          key={`tag-${i}`}
          className="inline-flex items-center bg-amber-300 text-amber-950 dark:bg-amber-500 dark:text-amber-50 rounded px-1.5 mx-0.5 text-[11px] font-mono font-semibold"
          title={`U+${tagLabel(c)}`}
        >
          {`⟨${tagLabel(c)}⟩`}
        </span>,
      );
    } else if (c === "\n") {
      flush(`pre-${i}`);
      parts.push(
        <span key={`nl-${i}`} className="text-sky-500 mx-0.5 font-bold" title="فاصل سطر">↵</span>,
      );
      parts.push(<br key={`br-${i}`} />);
    } else {
      buffer += c;
    }
  }
  flush("end");
  return parts;
}

/** أسطر مقروءة من أسباب المشكلة. */
function describeReasons(r: RestoreIssueReasons): string[] {
  const out: string[] = [];
  if (r.missingTags > 0) out.push(`رموز مفقودة: ${r.missingTags}`);
  if (r.extraTags > 0) out.push(`رموز زائدة: ${r.extraTags}`);
  if (r.changedTagPositions > 0) out.push(`رموز اختلف ترتيبها/قيمتها: ${r.changedTagPositions}`);
  if (r.misplacedTags > 0) out.push(`رموز في مكان خاطئ: ${r.misplacedTags}`);
  if (r.missingLineBreaksAuto > 0) out.push(`فواصل أسطر ناقصة: ${r.missingLineBreaksAuto}`);
  if (r.missingLineBreaksPartial > 0) out.push(`فواصل أسطر ناقصة (تقسيم جزئي): ${r.missingLineBreaksPartial}`);
  if (r.needsNormalize) out.push("يحتوي <br> / \\n / CR يجب تحويلها");
  return out;
}

/** شريحة تظهر رمزاً واحداً كزرّ قابل للإدراج. */
const TagChip: React.FC<{
  ch: string;
  onInsert?: (s: string) => void;
  highlight?: "missing" | "extra" | "ok";
}> = ({ ch, onInsert, highlight = "ok" }) => {
  const colors =
    highlight === "missing"
      ? "border-rose-400 bg-rose-100 text-rose-900 dark:bg-rose-900/60 dark:text-rose-100 dark:border-rose-500"
      : highlight === "extra"
      ? "border-orange-400 bg-orange-100 text-orange-900 dark:bg-orange-900/60 dark:text-orange-100 dark:border-orange-500"
      : "border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100 dark:border-amber-500";
  const clickable = !!onInsert;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => onInsert?.(ch)}
      className={`inline-flex items-center font-mono text-[11px] font-semibold rounded px-1.5 py-0.5 border ${colors} ${
        clickable ? "hover:brightness-110 cursor-pointer" : "cursor-default"
      }`}
      title={clickable ? `إدراج ⟨${tagLabel(ch)}⟩ في الترجمة` : `⟨${tagLabel(ch)}⟩`}
    >
      ⟨{tagLabel(ch)}⟩
    </button>
  );
};

interface InlineEditorProps {
  initialValue: string;
  original: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

const InlineEditor: React.FC<InlineEditorProps> = ({ initialValue, original, onSave, onCancel }) => {
  const [value, setValue] = useState(initialValue);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  const insertAtCursor = useCallback((s: string) => {
    const ta = taRef.current;
    if (!ta) {
      setValue(v => v + s);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = value.slice(0, start) + s + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      const pos = start + s.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }, [value]);

  const originalTags = useMemo(() => uniqueTags(original), [original]);

  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground ml-1">إدراج سريع:</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => insertAtCursor("\n")}
          className="h-7 gap-1 text-xs"
        >
          <CornerDownLeft className="h-3 w-3" />
          فاصل سطر
        </Button>
        {originalTags.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">لا توجد رموز في الأصل</span>
        ) : (
          originalTags.map((ch) => (
            <TagChip key={ch} ch={ch} onInsert={insertAtCursor} />
          ))
        )}
      </div>

      <Textarea
        ref={taRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={Math.max(3, Math.min(10, value.split("\n").length + 1))}
        dir="rtl"
        className="text-base leading-relaxed font-sans bg-background"
        placeholder="عدّل الترجمة هنا…"
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="gap-1.5"
        >
          <X className="h-3.5 w-3.5" />
          إلغاء
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(value)}
          disabled={value === initialValue}
          className="gap-1.5"
        >
          <Check className="h-3.5 w-3.5" />
          حفظ
        </Button>
      </div>
    </div>
  );
};

type AiSuggestion = { text: string; safe: boolean; reason?: string; grafted?: boolean };

interface IssueCardProps {
  issue: RestoreIssue;
  index: number;
  editable: boolean;
  isResolved: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (value: string) => void;
  // AI smart-fix
  aiBusy?: boolean;
  aiSuggestion?: AiSuggestion | null;
  onRequestAiFix?: () => void;
  onAcceptAiFix?: () => void;
  onRejectAiFix?: () => void;
}

const IssueCard: React.FC<IssueCardProps> = ({
  issue, index, editable, isResolved, isEditing, onStartEdit, onCancelEdit, onSaveEdit,
  aiBusy, aiSuggestion, onRequestAiFix, onAcceptAiFix, onRejectAiFix,
}) => {
  const reasonLines = describeReasons(issue.reasons);
  const showAfter = issue.kind === "auto" && !isResolved;

  const origUnique = useMemo(() => uniqueTags(issue.original), [issue.original]);
  const transUnique = useMemo(() => uniqueTags(issue.before), [issue.before]);
  const origSeq = useMemo(() => tagSequence(issue.original), [issue.original]);
  const transSeq = useMemo(() => tagSequence(issue.before), [issue.before]);

  const missing = useMemo(
    () => origUnique.filter(t => !transUnique.includes(t)),
    [origUnique, transUnique],
  );
  const extra = useMemo(
    () => transUnique.filter(t => !origUnique.includes(t)),
    [origUnique, transUnique],
  );

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
            #{index + 1}
          </Badge>
          {isResolved && (
            <Badge className="text-[10px] bg-emerald-600 text-white border-emerald-700">
              <Check className="h-3 w-3 mr-0.5" />
              تمّ الإصلاح
            </Badge>
          )}
          <span
            className="text-sm font-semibold text-foreground truncate min-w-0 flex-1"
            title={issue.label}
            dir="auto"
          >
            {issue.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground break-all">
          <FileText className="h-3 w-3 shrink-0" />
          {issue.msbtFile}
        </div>
        {reasonLines.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {reasonLines.map((r, i) => (
              <Badge
                key={i}
                variant="outline"
                className={
                  issue.kind === "auto"
                    ? "border-emerald-500/60 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-200 text-[10.5px] font-medium"
                    : "border-amber-500/60 text-amber-800 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-200 text-[10.5px] font-medium"
                }
              >
                {r}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {(origUnique.length > 0 || transUnique.length > 0) && (
        <div className="rounded border border-border/60 bg-muted/40 p-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">رموز الأصل ({origSeq.length}):</span>
            {origUnique.map((t) => (
              <TagChip key={`o-${t}`} ch={t} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">رموز الترجمة ({transSeq.length}):</span>
            {transUnique.length === 0 ? (
              <span className="text-muted-foreground italic">— لا شيء</span>
            ) : (
              transUnique.map((t) => (
                <TagChip
                  key={`t-${t}`}
                  ch={t}
                  highlight={extra.includes(t) ? "extra" : "ok"}
                />
              ))
            )}
          </div>
          {missing.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-rose-600 dark:text-rose-300 font-semibold">مفقودة:</span>
              {missing.map((t) => (
                <TagChip key={`m-${t}`} ch={t} highlight="missing" />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded border border-border bg-muted/50 p-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
          <FileText className="h-3 w-3" />
          الأصل
        </div>
        <div
          className="text-[15px] leading-relaxed whitespace-pre-wrap break-words text-foreground"
          dir="auto"
        >
          {renderInvisible(issue.original)}
        </div>
      </div>

      {isEditing ? (
        <InlineEditor
          initialValue={issue.before}
          original={issue.original}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <div
          className={`rounded border p-2 ${
            isResolved
              ? "border-emerald-500/60 bg-emerald-100 text-emerald-950 dark:bg-emerald-900/70 dark:text-emerald-50 dark:border-emerald-400/60"
              : "border-rose-500/60 bg-rose-100 text-rose-950 dark:bg-rose-900/70 dark:text-rose-50 dark:border-rose-400/60"
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <div
              className={`flex items-center gap-1.5 text-[11px] font-semibold ${
                isResolved
                  ? "text-emerald-700 dark:text-emerald-200"
                  : "text-rose-700 dark:text-rose-200"
              }`}
            >
              {isResolved ? (
                <>
                  <Check className="h-3 w-3" />
                  الترجمة بعد الإصلاح اليدويّ
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3" />
                  الترجمة الحاليّة
                </>
              )}
            </div>
            {editable && !isResolved && (
              <div className="flex flex-wrap items-center gap-1.5">
                {onRequestAiFix && !aiSuggestion && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onRequestAiFix}
                    disabled={aiBusy}
                    className="h-7 gap-1 text-xs border-violet-400/70 text-violet-700 hover:bg-violet-100 dark:text-violet-200 dark:hover:bg-violet-900/40"
                    title="اطلب من الذكاء الاصطناعي إعادة بناء الرموز وفواصل الأسطر دون تغيير المعنى"
                  >
                    {aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    إصلاح بالذكاء الاصطناعي
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onStartEdit}
                  className="h-7 gap-1 text-xs"
                >
                  <Pencil className="h-3 w-3" />
                  تعديل
                </Button>
              </div>
            )}
          </div>
          <div
            className="text-[15px] leading-relaxed whitespace-pre-wrap break-words"
            dir="rtl"
          >
            {renderInvisible(issue.before)}
          </div>
        </div>
      )}

      {aiSuggestion && !isResolved && (
        <div className={`rounded border p-2 ${
          aiSuggestion.safe
            ? "border-violet-500/60 bg-violet-50 dark:bg-violet-950/40 dark:border-violet-400/60"
            : "border-orange-500/60 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-400/60"
        }`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold">
              <Wand2 className="h-3 w-3" />
              اقتراح الذكاء الاصطناعي
              {aiSuggestion.safe ? (
                <Badge className="bg-violet-600 text-white border-violet-700 text-[10px] h-4 px-1.5">آمن</Badge>
              ) : (
                <Badge className="bg-orange-600 text-white border-orange-700 text-[10px] h-4 px-1.5">يحتاج مراجعة</Badge>
              )}
              {aiSuggestion.grafted && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-sky-400 text-sky-700 dark:text-sky-200">رموز مزروعة آلياً</Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button type="button" size="sm" variant="ghost" onClick={onRejectAiFix} className="h-7 gap-1 text-xs">
                <X className="h-3 w-3" /> رفض
              </Button>
              <Button type="button" size="sm" onClick={onAcceptAiFix} className="h-7 gap-1 text-xs">
                <Check className="h-3 w-3" /> قبول
              </Button>
            </div>
          </div>
          {aiSuggestion.reason && (
            <div className={`text-[11px] mb-1 ${aiSuggestion.safe ? "text-sky-700 dark:text-sky-200" : "text-orange-700 dark:text-orange-200"}`}>
              {aiSuggestion.safe ? "ℹ️" : "⚠️"} {aiSuggestion.reason}
            </div>
          )}
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words" dir="rtl">
            {renderInvisible(aiSuggestion.text)}
          </div>
        </div>
      )}



      {showAfter && (
        <div className="rounded border border-emerald-500/60 bg-emerald-100 text-emerald-950 dark:bg-emerald-900/70 dark:text-emerald-50 dark:border-emerald-400/60 p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-100 mb-1">
            <FileCheck2 className="h-3 w-3" />
            بعد الإصلاح الآليّ
          </div>
          <div
            className="text-[15px] leading-relaxed whitespace-pre-wrap break-words"
            dir="rtl"
          >
            {renderInvisible(issue.after)}
          </div>
        </div>
      )}
    </div>
  );
};

export const FixTagsLineBreaksDialog: React.FC<FixTagsLineBreaksDialogProps> = ({
  open,
  report,
  onClose,
  onApply,
  onUpdateTranslation,
  onRescan,
  onApplySmartReorder,
  splitEntries,
  splitTranslations,
  onJumpToEntry,
}) => {
  const [tab, setTab] = useState<"auto" | "review" | "split">("auto");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());

  // ── حالة الإصلاح الذكي بالـ AI ────────────────────────────────────────────
  const [aiEngine, setAiEngine] = useState<string>(() => {
    try { return localStorage.getItem("xc1_smartfix_engine") || "lovable:gemini-3-flash-preview"; } catch { return "lovable:gemini-3-flash-preview"; }
  });
  useEffect(() => { try { localStorage.setItem("xc1_smartfix_engine", aiEngine); } catch { /* ignore */ } }, [aiEngine]);
  const [aiBusyKey, setAiBusyKey] = useState<string | null>(null);
  const [aiBulkBusy, setAiBulkBusy] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, { text: string; safe: boolean; reason?: string; grafted?: boolean }>>({});

  const totalIssues = (report?.autoFixable || 0) + (report?.needsReview || 0);
  const affectedFiles = useMemo(
    () => (report ? Object.keys(report.byFile).length : 0),
    [report],
  );

  useEffect(() => {
    if (!report) return;
    setEditingKey(null);
    setResolvedKeys(new Set());
    setAiSuggestions({});
    if (report.autoFixable === 0 && report.needsReview > 0) setTab("review");
    else setTab("auto");
  }, [report]);

  const callSmartFix = useCallback(async (issues: RestoreIssue[]) => {
    if (!issues.length) return;
    const [engine, model] = aiEngine.split(":") as ["lovable" | "deepseek", string];
    const deepseekKey = (() => {
      try { return localStorage.getItem("userDeepSeekKey") || ""; } catch { return ""; }
    })();
    try {
      const { data, error } = await supabase.functions.invoke("smart-tag-fix", {
        body: {
          engine,
          aiModel: model,
          providerApiKey: engine === "deepseek" ? (deepseekKey || undefined) : undefined,
          entries: issues.map(i => ({ key: i.key, original: i.original, translation: i.before })),
        },
      });
      if (error) throw new Error(error.message || "تعذّر الاتصال بالخدمة");
      if (data?.error) throw new Error(data.error);
      const results = (data?.results || {}) as Record<string, { text: string; safe: boolean; reason?: string; grafted?: boolean }>;
      const count = Object.keys(results).length;
      if (!count) {
        toast({ title: "لم يُرجع الذكاء الاصطناعي أيّ اقتراح", variant: "destructive" });
        return;
      }
      setAiSuggestions(prev => ({ ...prev, ...results }));
      toast({ title: `وصل ${count} اقتراح من الذكاء الاصطناعي`, description: "راجع وافقُ أو ارفض كلّ اقتراح" });
    } catch (e) {
      toast({ title: "فشل الإصلاح بالذكاء الاصطناعي", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }, [aiEngine]);

  const handleRequestAiFix = useCallback(async (issue: RestoreIssue) => {
    setAiBusyKey(issue.key);
    try { await callSmartFix([issue]); } finally { setAiBusyKey(null); }
  }, [callSmartFix]);

  const handleAcceptAiFix = useCallback((key: string) => {
    const sug = aiSuggestions[key];
    if (!sug || !onUpdateTranslation) return;
    onUpdateTranslation(key, sug.text);
    setResolvedKeys(prev => { const n = new Set(prev); n.add(key); return n; });
    setAiSuggestions(prev => { const next = { ...prev }; delete next[key]; return next; });
  }, [aiSuggestions, onUpdateTranslation]);

  const handleRejectAiFix = useCallback((key: string) => {
    setAiSuggestions(prev => { const next = { ...prev }; delete next[key]; return next; });
  }, []);

  const handleBulkAiFix = useCallback(async () => {
    if (!report) return;
    const pending = report.reviewExamples.filter(i => !resolvedKeys.has(i.key) && !aiSuggestions[i.key]);
    if (!pending.length) {
      toast({ title: "لا توجد عناصر للإصلاح", description: "كلّ العناصر إمّا تمّ حلّها أو لها اقتراح" });
      return;
    }
    setAiBulkBusy(true);
    try {
      const CHUNK = 5;
      for (let i = 0; i < pending.length; i += CHUNK) {
        await callSmartFix(pending.slice(i, i + CHUNK));
      }
    } finally {
      setAiBulkBusy(false);
    }
  }, [report, resolvedKeys, aiSuggestions, callSmartFix]);

  const handleSaveEdit = useCallback((key: string, value: string) => {
    onUpdateTranslation?.(key, value);
    setResolvedKeys(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setEditingKey(null);
  }, [onUpdateTranslation]);

  const resolvedReviewCount = useMemo(() => {
    if (!report) return 0;
    return report.reviewExamples.filter(i => resolvedKeys.has(i.key)).length;
  }, [report, resolvedKeys]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="w-[100vw] sm:max-w-3xl lg:max-w-5xl max-h-[100vh] sm:max-h-[92vh] h-[100vh] sm:h-auto flex flex-col p-3 sm:p-6 gap-3"
        dir="rtl"
        aria-describedby="fix-tags-dialog-desc"
      >
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Wrench className="h-4 w-4 text-primary" />
            إصلاح الرموز التقنية وفواصل السطور
          </DialogTitle>
          <DialogDescription id="fix-tags-dialog-desc" className="text-[11px] sm:text-xs">
            فحص محلّي بدون ذكاء اصطناعي. عدِّل ما في «للمراجعة» مباشرةً من هنا، ثم طبّق الإصلاح الآليّ على البقيّة.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center shrink-0">
          <div className="rounded-md border bg-muted/40 p-2 sm:p-3">
            <div className="text-[10px] sm:text-[11px] text-muted-foreground">تمّ فحصها</div>
            <div className="text-xl sm:text-2xl font-bold tabular-nums">{report?.scanned ?? 0}</div>
          </div>
          <div className="rounded-md border bg-emerald-100 dark:bg-emerald-900/50 p-2 sm:p-3">
            <div className="text-[10px] sm:text-[11px] text-emerald-800 dark:text-emerald-200">إصلاح آليّ</div>
            <div className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-100">
              {report?.autoFixable ?? 0}
            </div>
          </div>
          <div className="rounded-md border bg-amber-100 dark:bg-amber-900/50 p-2 sm:p-3">
            <div className="text-[10px] sm:text-[11px] text-amber-800 dark:text-amber-200">للمراجعة</div>
            <div className="text-xl sm:text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-100">
              {report?.needsReview ?? 0}
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 p-2 sm:p-3">
            <div className="text-[10px] sm:text-[11px] text-muted-foreground">ملفّات متأثّرة</div>
            <div className="text-xl sm:text-2xl font-bold tabular-nums">{affectedFiles}</div>
          </div>
        </div>

        {report && totalIssues > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-md border bg-muted/30 p-2 text-center shrink-0">
            <div className="text-[10px] sm:text-[11px] text-muted-foreground">مفقودة <strong className="text-foreground tabular-nums">{report.issueTotals.missingTags}</strong></div>
            <div className="text-[10px] sm:text-[11px] text-muted-foreground">زائدة/فاسدة <strong className="text-foreground tabular-nums">{report.issueTotals.extraTags + report.issueTotals.changedTagPositions}</strong></div>
            <div className="text-[10px] sm:text-[11px] text-muted-foreground">مكان خاطئ <strong className="text-foreground tabular-nums">{report.issueTotals.misplacedTags}</strong></div>
            <div className="text-[10px] sm:text-[11px] text-muted-foreground">فواصل أسطر <strong className="text-foreground tabular-nums">{report.issueTotals.missingLineBreaksAuto + report.issueTotals.missingLineBreaksPartial}</strong></div>
          </div>
        )}

        {totalIssues === 0 && !splitEntries ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center space-y-2">
              <Sparkles className="h-8 w-8 mx-auto text-emerald-500" />
              <div className="text-base font-semibold">كلّ الترجمات سليمة</div>
              <div className="text-sm text-muted-foreground">
                لا توجد رموز مفقودة/زائدة/فاسدة/مزاحة ولا فواصل أسطر ناقصة.
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div className={`grid ${splitEntries ? "grid-cols-3" : "grid-cols-2"} gap-1.5 rounded-md bg-muted p-1 shrink-0 sticky top-0 z-10`}>
              <button
                type="button"
                onClick={() => setTab("auto")}
                className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 text-xs sm:text-sm font-medium transition-colors ${
                  tab === "auto"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileCheck2 className="h-3.5 w-3.5" />
                <span className="hidden xs:inline sm:inline">إصلاح آليّ</span>
                <span className="xs:hidden sm:hidden">آليّ</span>
                <Badge variant="secondary" className="ml-0.5 h-4 px-1.5 text-[10px]">
                  {report?.autoFixable ?? 0}
                </Badge>
              </button>
              <button
                type="button"
                onClick={() => setTab("review")}
                className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 text-xs sm:text-sm font-medium transition-colors ${
                  tab === "review"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">للمراجعة</span>
                <span className="sm:hidden">مراجعة</span>
                <Badge variant="secondary" className="ml-0.5 h-4 px-1.5 text-[10px]">
                  {report?.needsReview ?? 0}
                </Badge>
              </button>
              {splitEntries && (
                <button
                  type="button"
                  onClick={() => setTab("split")}
                  className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 text-xs sm:text-sm font-medium transition-colors ${
                    tab === "split"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <AlignLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">تقسيم الأسطر</span>
                  <span className="sm:hidden">تقسيم</span>
                </button>
              )}
            </div>

            {tab === "auto" ? (
              <div className="flex-1 min-h-0 flex flex-col">
                {!report || report.autoExamples.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    لا توجد ترجمات قابلة للإصلاح الآليّ.
                  </div>
                ) : (
                  <>
                    <div className="text-[11px] sm:text-xs text-muted-foreground mb-1.5 leading-relaxed">
                      عند الضغط على «طبّق الإصلاح الآليّ» سيُعاد بناء الرموز من الأصل وتُصلح فواصل الأسطر في {report.autoFixable} ترجمة. يمكنك التراجع لكلّ ترجمة على حدة.
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
                      <div className="space-y-2.5 pb-2">
                        {report.autoExamples.map((issue, i) => (
                          <IssueCard
                            key={issue.key}
                            issue={issue}
                            index={i}
                            editable={!!onUpdateTranslation}
                            isResolved={resolvedKeys.has(issue.key)}
                            isEditing={editingKey === issue.key}
                            onStartEdit={() => setEditingKey(issue.key)}
                            onCancelEdit={() => setEditingKey(null)}
                            onSaveEdit={(v) => handleSaveEdit(issue.key, v)}
                          />
                        ))}
                        {report.autoFixable > report.autoExamples.length && (
                          <div className="text-center text-[11px] text-muted-foreground py-2">
                            + {report.autoFixable - report.autoExamples.length} ترجمة أخرى ستُعالَج بنفس الطريقة (غير معروضة هنا).
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : tab === "review" ? (
              <div className="flex-1 min-h-0 flex flex-col">
                {!report || report.reviewExamples.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    لا توجد ترجمات تحتاج مراجعة يدويّة.
                  </div>
                ) : (
                  <>
                    {onApplySmartReorder && report.smartReorderable > 0 && (
                      <div className="rounded-md border border-sky-500/60 bg-sky-100 text-sky-950 dark:bg-sky-900/70 dark:text-sky-50 dark:border-sky-400/60 p-2 mb-1.5 flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="text-[11px] sm:text-xs leading-relaxed flex-1">
                          يوجد <strong className="tabular-nums">{report.smartReorderable}</strong> ترجمة فيها رموز بنفس عدد الأصل لكنّ ترتيبها أو قيمها مختلفة. يمكن إصلاحها كلّها تلقائياً الآن.
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={onApplySmartReorder}
                          className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white shrink-0"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          إصلاح ذكيّ للرموز ({report.smartReorderable})
                        </Button>
                      </div>
                    )}

                    {onUpdateTranslation && (
                      <div className="rounded-md border border-violet-400/50 bg-violet-50 dark:bg-violet-950/30 p-2 mb-1.5 flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Wand2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                          <span className="text-[11px] sm:text-xs font-semibold text-violet-800 dark:text-violet-100">إصلاح ذكي بالـ AI</span>
                        </div>
                        <Select value={aiEngine} onValueChange={setAiEngine}>
                          <SelectTrigger className="h-8 text-xs sm:flex-1 min-w-0 bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lovable:gemini-3-flash-preview" className="text-xs">⚡ Gemini 3 Flash (سريع — مجاني)</SelectItem>
                            <SelectItem value="lovable:gemini-2.5-pro" className="text-xs">🧠 Gemini 2.5 Pro</SelectItem>
                            <SelectItem value="lovable:gpt-5-mini" className="text-xs">✨ GPT-5 Mini</SelectItem>
                            <SelectItem value="lovable:gpt-5" className="text-xs">✨ GPT-5</SelectItem>
                            <SelectItem value="deepseek:deepseek-v4-flash" className="text-xs">🐋 DeepSeek V4 Flash</SelectItem>
                            <SelectItem value="deepseek:deepseek-v4-pro" className="text-xs">🐋 DeepSeek V4 Pro (الأقوى)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleBulkAiFix}
                          disabled={aiBulkBusy}
                          className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                        >
                          {aiBulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                          إصلاح الكلّ بالـ AI
                        </Button>
                      </div>
                    )}

                    <div className="text-[11px] sm:text-xs text-muted-foreground mb-1.5 leading-relaxed">
                      هذه الترجمات بقيت للمراجعة فقط إذا لم يمكن تطبيق إصلاح آمن. اضغط «تعديل» أو «إصلاح بالـ AI» لكلّ ترجمة.
                      {resolvedReviewCount > 0 && (
                        <span className="text-emerald-700 dark:text-emerald-300 font-semibold mr-1">
                          أصلحت {resolvedReviewCount} حتى الآن.
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
                      <div className="space-y-2.5 pb-2">
                        {report.reviewExamples.map((issue, i) => (
                          <IssueCard
                            key={issue.key}
                            issue={issue}
                            index={i}
                            editable={!!onUpdateTranslation}
                            isResolved={resolvedKeys.has(issue.key)}
                            isEditing={editingKey === issue.key}
                            onStartEdit={() => setEditingKey(issue.key)}
                            onCancelEdit={() => setEditingKey(null)}
                            onSaveEdit={(v) => handleSaveEdit(issue.key, v)}
                            aiBusy={aiBusyKey === issue.key}
                            aiSuggestion={aiSuggestions[issue.key] || null}
                            onRequestAiFix={() => handleRequestAiFix(issue)}
                            onAcceptAiFix={() => handleAcceptAiFix(issue.key)}
                            onRejectAiFix={() => handleRejectAiFix(issue.key)}
                          />
                        ))}
                        {report.needsReview > report.reviewExamples.length && (
                          <div className="text-center text-[11px] text-muted-foreground py-2">
                            + {report.needsReview - report.reviewExamples.length} ترجمة أخرى تحتاج مراجعة (غير معروضة هنا).
                            {onRescan && (
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                onClick={onRescan}
                                className="h-auto p-0 mr-1 text-[11px]"
                              >
                                إعادة فحص لتحديث القائمة
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              splitEntries && onUpdateTranslation ? (
                <LineSplitFixPanel
                  key={splitEntries.length}
                  entries={splitEntries}
                  translations={splitTranslations || {}}
                  onUpdateTranslation={onUpdateTranslation}
                  onJumpToEntry={onJumpToEntry}
                />
              ) : (
                <div className="text-center text-sm text-muted-foreground py-8">
                  لوحة تحسين تقسيم الأسطر غير متاحة في هذا السياق.
                </div>
              )
            )}
          </div>
        )}

        <DialogFooter className="flex-row justify-end gap-2 shrink-0">
          {onRescan && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRescan}
              className="gap-1.5"
              title="إعادة فحص بعد التعديلات اليدويّة"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              إعادة فحص
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            إغلاق
          </Button>
          <Button
            size="sm"
            onClick={onApply}
            disabled={!report || report.autoFixable === 0}
            className="gap-1.5"
          >
            <Wrench className="h-3.5 w-3.5" />
            طبّق ({report?.autoFixable ?? 0})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FixTagsLineBreaksDialog;
