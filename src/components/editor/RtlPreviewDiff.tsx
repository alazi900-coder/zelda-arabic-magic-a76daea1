/**
 * Before/After preview for RLM (U+200F) tag isolation.
 *
 * - "raw" tab shows the literal text with U+200F replaced by a visible 🔸
 *   marker so the user can see WHERE the wrapping was applied.
 * - "rtl" tab renders both strings inside `dir="rtl"` boxes so the user can
 *   visually compare how Arabic words flow around LTR-shaped technical tags
 *   (this matches how Xenoblade's BiDi-resolved layout works in-game).
 *   Technical tags are highlighted so the reorder effect of RLM is obvious,
 *   and a toggle lets the user disable RLM in the "after" box to demo what
 *   happens in-game without isolation (with an explicit warning).
 *
 * Pure presentational — no data mutations. Used inside FixReport and the
 * residual-RTL list.
 */
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface RtlPreviewDiffProps {
  before: string;
  after: string;
  className?: string;
}

const RLM = "\u200F";
const RLM_MARKER = "🔸";

/** Same broad token regex used by xc3-build-tag-guard for highlighting. */
const TAG_HIGHLIGHT_REGEX = /\d+\s*\\?\[\s*\w+\s*:[^\]]*?\\?\]|\\?\[\s*\w+\s*:[^\]]*?\\?\]\s*\d+|\\?\[\s*\/?\s*\w+\s*:[^\]]*?\\?\]|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]|\{\s*\w+\s*:[^}]*\}|\{\s*\w+\s*\}|\$\d+/g;

/** Replace every U+200F with a visible marker so users can see where RLM sits. */
function visualizeRlm(text: string): string {
  return text.replace(/\u200F/g, RLM_MARKER);
}

/** Strip RLM (used in the demo-without-RLM render). */
function stripRlm(text: string): string {
  return text.replace(/\u200F/g, "");
}

/**
 * Split text into tag / non-tag fragments and render tags as colored chips.
 * RLM characters are stripped before splitting so the regex matches cleanly;
 * the chip rendering itself is what makes the reorder effect visible — the
 * surrounding `dir="rtl"` flow positions each chip according to BiDi rules.
 */
function renderWithTagHighlights(text: string, keepRlm: boolean): React.ReactNode {
  const source = keepRlm ? text : stripRlm(text);
  if (!source) return <em className="text-muted-foreground">— فارغ —</em>;

  const parts: React.ReactNode[] = [];
  const re = new RegExp(TAG_HIGHLIGHT_REGEX.source, TAG_HIGHLIGHT_REGEX.flags);
  let cursor = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(source)) !== null) {
    if (m.index > cursor) {
      parts.push(<span key={key++}>{source.slice(cursor, m.index)}</span>);
    }
    parts.push(
      <span
        key={key++}
        className="inline-block px-1 mx-0.5 rounded bg-primary/20 text-primary border border-primary/40 font-mono text-[10px] align-baseline"
        dir="ltr"
      >
        {m[0].replace(/\u200F/g, "")}
      </span>
    );
    cursor = m.index + m[0].length;
  }
  if (cursor < source.length) {
    parts.push(<span key={key++}>{source.slice(cursor)}</span>);
  }
  return <>{parts}</>;
}

export function RtlPreviewDiff({ before, after, className }: RtlPreviewDiffProps) {
  const [tab, setTab] = useState<"raw" | "rtl">("raw");
  /** When false, the "after" RTL preview strips RLM to demo in-game word reorder. */
  const [rlmEnabled, setRlmEnabled] = useState(true);

  const beforeRlm = (before.match(/\u200F/g) || []).length;
  const afterRlm = (after.match(/\u200F/g) || []).length;
  const added = Math.max(0, afterRlm - beforeRlm);

  return (
    <div className={`space-y-2 ${className ?? ""}`} dir="rtl">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "raw" | "rtl")}>
        <TabsList className="h-7 w-full grid grid-cols-2">
          <TabsTrigger value="raw" className="text-[10px] h-6">
            🔍 نص خام {added > 0 && <span className="ms-1 text-secondary">(+{added} RLM)</span>}
          </TabsTrigger>
          <TabsTrigger value="rtl" className="text-[10px] h-6">🎮 محاكاة العرض</TabsTrigger>
        </TabsList>

        <TabsContent value="raw" className="mt-1.5 space-y-1.5">
          <PreviewBox label="قبل" tone="warning">
            <span className="font-mono text-[11px] whitespace-pre-wrap break-all" dir="ltr">
              {visualizeRlm(before) || <em className="text-muted-foreground">— فارغ —</em>}
            </span>
          </PreviewBox>
          <PreviewBox label="بعد" tone="success">
            <span className="font-mono text-[11px] whitespace-pre-wrap break-all" dir="ltr">
              {visualizeRlm(after) || <em className="text-muted-foreground">— فارغ —</em>}
            </span>
          </PreviewBox>
          <p className="text-[9px] text-muted-foreground">
            🔸 = علامة RLM (U+200F) — غير مرئية داخل اللعبة لكنها تثبّت اتجاه الوسوم.
          </p>
        </TabsContent>

        <TabsContent value="rtl" className="mt-1.5 space-y-1.5">
          {/* RLM toggle for demo */}
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
            <div className="flex-1">
              <Label htmlFor="rlm-toggle" className="text-[10px] font-bold cursor-pointer">
                تفعيل عزل RLM في المعاينة
              </Label>
              <p className="text-[9px] text-muted-foreground">
                {rlmEnabled
                  ? "الوسوم معزولة — الترتيب يطابق ما تقصده."
                  : "⚠️ بدون RLM — هكذا تخلط اللعبة ترتيب الكلمات حول الوسوم."}
              </p>
            </div>
            <Switch
              id="rlm-toggle"
              checked={rlmEnabled}
              onCheckedChange={setRlmEnabled}
            />
          </div>

          {!rlmEnabled && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-1.5">
              <p className="text-[10px] text-amber-300 leading-tight">
                ⚠️ <b>تحذير:</b> إيقاف RLM للعرض التجريبي فقط. داخل Xenoblade سيُعيد المحرك
                ترتيب الكلمات حول الوسوم التقنية ([XENO]/[System]/{`{var}`}/$N) — كلمة قد تنتقل
                لسطر آخر أو يقفز جزء الجملة لمكان غير متوقع. لا توقف RLM في الترجمة الفعلية.
              </p>
            </div>
          )}

          <PreviewBox label="قبل (بدون عزل — كما تظهر باللعبة)" tone="warning">
            <span className="text-[12px] leading-7 whitespace-pre-wrap" dir="rtl" lang="ar">
              {renderWithTagHighlights(before, false)}
            </span>
          </PreviewBox>
          <PreviewBox
            label={rlmEnabled ? "بعد (مع RLM — ترتيب صحيح)" : "بعد (RLM موقوف — مكسور)"}
            tone={rlmEnabled ? "success" : "warning"}
          >
            <span className="text-[12px] leading-7 whitespace-pre-wrap" dir="rtl" lang="ar">
              {renderWithTagHighlights(after, rlmEnabled)}
            </span>
          </PreviewBox>
          <p className="text-[9px] text-muted-foreground">
            الوسوم التقنية مظللة بالأزرق. لاحظ كيف يتغير موضعها بين «قبل» و«بعد» —
            هذا الفرق هو بالضبط ما يراه اللاعب داخل اللعبة.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PreviewBox({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "warning" | "success";
  children: React.ReactNode;
}) {
  const toneClasses =
    tone === "success"
      ? "border-secondary/40 bg-secondary/5"
      : "border-amber-500/40 bg-amber-500/5";
  const labelClasses = tone === "success" ? "text-secondary" : "text-amber-400";
  return (
    <div className={`rounded-md border p-1.5 ${toneClasses}`}>
      <p className={`text-[9px] font-bold mb-0.5 ${labelClasses}`}>{label}</p>
      {children}
    </div>
  );
}
