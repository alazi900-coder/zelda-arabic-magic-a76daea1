import React, { useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EditorState } from "@/components/editor/types";
import { INAZUMA_FILE_PREFIX } from "@/lib/inazuma/inazuma-editor-bridge";
import { findMisplacedInazumaBreak, hasBreakMidSentence, repairInazumaTags, validateInazumaTags } from "@/lib/inazuma/inazuma-tags";
import { fromInazumaBreakTokens } from "@/lib/inazuma/inazuma-break-tokens";

interface Props {
  state: EditorState;
  onApplyAll: (fixes: Record<string, string>) => void;
  onFilterByKeys: (keys: string[]) => void;
}

interface Scan {
  fixes: Record<string, string>;
  skipped: string[];
}

/** How many page breaks a line holds, in either spelling. */
const breakCount = (text: string) => (fromInazumaBreakTokens(text).match(/\\f/g) ?? []).length;

/** The words with every break and all spacing taken out -- what a fix must not touch. */
const bare = (text: string) => fromInazumaBreakTokens(text).replace(/\\f/g, " ").replace(/\s+/g, " ").trim();

/**
 * Inazuma's copy of Platinum's pause-restore tool (PlatBreakRestorePanel):
 * one scan over every translated line, for page breaks (▼) that are missing
 * or sit mid-sentence, and one button to put them all back.
 *
 * Every proposal passes the same gates Platinum's does before it is offered:
 * not one word may change, the line must end up with exactly the breaks the
 * English has, and each break must end a sentence. A line the rule cannot
 * place with certainty is left as it is and listed for review instead.
 */
export default function InazumaBreakRestorePanel({ state, onApplyAll, onFilterByKeys }: Props) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [applied, setApplied] = useState(0);

  const damaged = useMemo(() => {
    return state.entries.filter((e) => {
      if (!e.msbtFile.startsWith(INAZUMA_FILE_PREFIX)) return false;
      const t = state.translations[`${e.msbtFile}:${e.index}`];
      if (!t?.trim() || breakCount(e.original) === 0) return false;
      return breakCount(t) < breakCount(e.original) || findMisplacedInazumaBreak(e.original, t) !== null;
    });
  }, [state.entries, state.translations]);

  const run = useCallback(() => {
    const fixes: Record<string, string> = {};
    const skipped: string[] = [];
    for (const e of damaged) {
      const key = `${e.msbtFile}:${e.index}`;
      const current = state.translations[key];
      const got = repairInazumaTags(e.original, current).text;
      if (
        got === current ||
        bare(got) !== bare(current) ||
        breakCount(got) !== breakCount(e.original) ||
        !validateInazumaTags(e.original, got).valid ||
        // The repair falls back to a word count when the sentences do not line
        // up; that guess lands mid-sentence as often as not, and Platinum's
        // tool never applies one unasked. Only a break at a sentence end goes.
        (hasBreakMidSentence(got) && !hasBreakMidSentence(e.original))
      ) {
        skipped.push(key);
        continue;
      }
      fixes[key] = got;
    }
    setScan({ fixes, skipped });
    setApplied(0);
  }, [damaged, state.translations]);

  const apply = useCallback(() => {
    if (!scan) return;
    onApplyAll(scan.fixes);
    setApplied(Object.keys(scan.fixes).length);
    setScan(null);
  }, [scan, onApplyAll]);

  if (damaged.length === 0 && applied === 0) return null;
  const ready = scan ? Object.keys(scan.fixes).length : 0;

  return (
    <Card className="border-amber-500/40">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">▼ إرجاع فواصل الصناديق (إينازوما)</span>
          <Badge variant="destructive">{damaged.length} سطر فاصله ناقص أو في غير مكانه</Badge>
          {applied > 0 && <Badge variant="secondary">أُصلح {applied}</Badge>}
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          فاصل الصندوق ▼ يوقف اللعبة حتى يضغط اللاعب الزر ثم يبدأ صندوقاً جديداً. السطر الذي
          فقده يتكدّس كلامه في صندوق واحد، والذي وُضع فيه وسط جملة يقسم الجملة بين صندوقين.
          يُعاد الفاصل إلى نهاية الجملة المقابلة في الأصل الإنجليزي — ولا يُقترح أيّ إصلاح إلا بعد
          التأكّد أن كلمات الترجمة لم تتغيّر حرفاً وأن عدد الفواصل مطابق للأصل.
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={run}>افحص</Button>
          {scan && ready > 0 && (
            <Button size="sm" variant="default" onClick={apply}>
              طبّق {ready} إصلاحاً
            </Button>
          )}
          {scan && scan.skipped.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => onFilterByKeys(scan.skipped)}>
              اعرض {scan.skipped.length} سطراً يحتاج مراجعتك
            </Button>
          )}
        </div>

        {scan && (
          <p className="text-xs text-muted-foreground">
            {ready > 0
              ? `${ready} سطراً يمكن إرجاع فواصله بثقة.`
              : "لا سطر يمكن إرجاع فواصله تلقائياً."}
            {scan.skipped.length > 0 &&
              ` ${scan.skipped.length} سطراً تعذّرت محاذاة جمله — تُرك كما هو لتراجعه بنفسك.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
