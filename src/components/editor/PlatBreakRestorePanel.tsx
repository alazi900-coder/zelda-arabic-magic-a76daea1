import React, { useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EditorState } from "@/components/editor/types";
import { restoreBreaks, onlyBreaksChanged, breakSequence } from "@/lib/nds/plat-restore-breaks";
import { PLAT_FILE_PREFIX } from "@/lib/nds/plat-editor-bridge";

interface Props {
  state: EditorState;
  onApplyAll: (fixes: Record<string, string>) => void;
  onFilterByKeys: (keys: string[]) => void;
}

interface Scan {
  fixes: Record<string, string>;
  skipped: string[];
}

/**
 * Puts back the pauses that were lost before the editor held them as `▼`.
 *
 * Every proposal is checked twice before it is offered: the words either side
 * of the pause must be untouched, and the sequence of pauses must be the one
 * the English asks for. A message the rule cannot place confidently is left
 * exactly as it is and listed instead — measured on 293 messages whose Arabic
 * kept its own pauses, what it does propose is right 97.5% of the time, and it
 * has an answer for 90.2% of the 6,981 damaged ones.
 */
export default function PlatBreakRestorePanel({ state, onApplyAll, onFilterByKeys }: Props) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [applied, setApplied] = useState(0);

  const damaged = useMemo(() => {
    return state.entries.filter((e) => {
      if (!e.msbtFile.startsWith(PLAT_FILE_PREFIX)) return false;
      const t = state.translations[`${e.msbtFile}:${e.index}`];
      if (!t?.trim()) return false;
      return breakSequence(t).length < breakSequence(e.original).length;
    });
  }, [state.entries, state.translations]);

  const run = useCallback(() => {
    const fixes: Record<string, string> = {};
    const skipped: string[] = [];
    for (const e of damaged) {
      const key = `${e.msbtFile}:${e.index}`;
      const current = state.translations[key];
      const got = restoreBreaks(e.original, current);
      // Two gates, both cheap and both absolute: not one word may move, and the
      // pauses must come out in the order the English has them.
      if (got === null || !onlyBreaksChanged(current, got) || breakSequence(got) !== breakSequence(e.original)) {
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
          <span className="font-semibold">▼ إرجاع فواصل التوقّف</span>
          <Badge variant="destructive">{damaged.length} رسالة ينقصها فاصل</Badge>
          {applied > 0 && <Badge variant="secondary">أُصلح {applied}</Badge>}
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          فاصل التوقّف (▼ يمسح الصندوق، ▽ يمرّره لأعلى) يوقف اللعبة حتى يضغط اللاعب الزر.
          الرسالة التي فقدته يستمر نصّها في الطباعة داخل صندوق لا يسعه، فلا يظهر ما بعده على
          الشاشة. تُعاد الفواصل بمحاذاة جمل الترجمة بجمل الأصل الإنجليزي — ولا يُقترح أيّ
          إصلاح إلا بعد التأكّد أن كلمات الترجمة لم تتغيّر حرفاً وأن ترتيب الفواصل مطابق للأصل.
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
              اعرض {scan.skipped.length} رسالة تحتاج مراجعتك
            </Button>
          )}
        </div>

        {scan && (
          <p className="text-xs text-muted-foreground">
            {ready > 0
              ? `${ready} رسالة يمكن إرجاع فواصلها بثقة.`
              : "لا رسالة يمكن إرجاع فواصلها تلقائياً."}
            {scan.skipped.length > 0 &&
              ` ${scan.skipped.length} رسالة تعذّرت محاذاة جملها — تُركت كما هي لتراجعها بنفسك.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
