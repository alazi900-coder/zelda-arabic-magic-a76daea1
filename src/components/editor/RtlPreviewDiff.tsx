/**
 * Before/After preview for RLM (U+200F) tag isolation.
 *
 * - "raw" tab shows the literal text with U+200F replaced by a visible 🔸
 *   marker so the user can see WHERE the wrapping was applied.
 * - "rtl" tab renders both strings inside `dir="rtl"` boxes so the user can
 *   visually compare how Arabic words flow around LTR-shaped technical tags
 *   (this matches how Xenoblade's BiDi-resolved layout works in-game).
 *
 * Pure presentational — no data mutations. Used inside FixReport and the
 * residual-RTL list.
 */
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface RtlPreviewDiffProps {
  before: string;
  after: string;
  className?: string;
}

const RLM = "\u200F";
const RLM_MARKER = "🔸";

/** Replace every U+200F with a visible marker so users can see where RLM sits. */
function visualizeRlm(text: string): string {
  return text.replace(/\u200F/g, RLM_MARKER);
}

/** Strip RLM (used in the RTL render so the marker doesn't pollute layout). */
function stripRlmForRender(text: string): string {
  return text.replace(/\u200F/g, "");
}

export function RtlPreviewDiff({ before, after, className }: RtlPreviewDiffProps) {
  const [tab, setTab] = useState<"raw" | "rtl">("raw");

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
          <PreviewBox label="قبل (بدون عزل)" tone="warning">
            <span className="text-[12px] leading-6 whitespace-pre-wrap" dir="rtl" lang="ar">
              {stripRlmForRender(before) || <em className="text-muted-foreground">— فارغ —</em>}
            </span>
          </PreviewBox>
          <PreviewBox label="بعد (مع RLM)" tone="success">
            <span className="text-[12px] leading-6 whitespace-pre-wrap" dir="rtl" lang="ar">
              {after || <em className="text-muted-foreground">— فارغ —</em>}
            </span>
          </PreviewBox>
          <p className="text-[9px] text-muted-foreground">
            لاحظ كيف يثبّت RLM موضع الوسوم التقنية ضمن سياق RTL مشابه لما يعرضه محرك اللعبة.
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
