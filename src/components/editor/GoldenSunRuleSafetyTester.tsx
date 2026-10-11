import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { goldenSunAllTechnicalTagsUnchanged } from "../../../supabase/functions/_shared/goldensun-cerebras";
import { validateGoldenSun2Translation } from "@/lib/goldensun/goldensun2-editor-bridge";

/**
 * Fast deterministic sanity check for GBA tokens before running paid AI review.
 * This is NOT an AI call and cannot judge naturalness or actual pixel fitting.
 */
export function GoldenSunRuleSafetyTester() {
  const [original, setOriginal] = useState("Felix\\x03Are you ready?");
  const [arabic, setArabic] = useState("فيليكس\\x03هل أنت مستعد؟");
  const [result, setResult] = useState<boolean | null>(null);
  const check = () => {
    setResult(Boolean(original.trim() && arabic.trim()) &&
      validateGoldenSun2Translation(original, arabic).valid &&
      goldenSunAllTechnicalTagsUnchanged(original, arabic));
  };

  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-semibold">اختبار محلي لسلامة وسوم Golden Sun II</summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          اختبر سلامة أكواد التحكم والمتغيرات وفواصل الأسطر وعلامات الاتجاه قبل إرسال دفعات إلى AI.
          الفحص محلي ومجاني؛ لا يقيّم صحة المعنى أو جودة العربية أو عرض الحروف بالبكسل.
        </p>
        <Label htmlFor="goldensun-test-original">النص الإنجليزي الأصلي</Label>
        <Textarea id="goldensun-test-original" data-testid="goldensun-test-original" dir="ltr"
          value={original} onChange={event => { setOriginal(event.target.value); setResult(null); }}
          className="min-h-[64px] font-mono text-xs" />
        <Label htmlFor="goldensun-test-arabic">الترجمة العربية المقترحة</Label>
        <Textarea id="goldensun-test-arabic" data-testid="goldensun-test-arabic" dir="auto"
          value={arabic} onChange={event => { setArabic(event.target.value); setResult(null); }}
          className="min-h-[64px] text-xs" />
        <Button type="button" size="sm" variant="outline" onClick={check}>فحص سلامة الوسوم</Button>
        <p aria-live="polite" data-testid="goldensun-test-result"
          className={result === null ? "text-xs text-muted-foreground" :
            result ? "text-xs text-green-600" : "text-xs text-destructive"}>
          {result === null ? "أدخل النصين ثم اضغط فحص سلامة الوسوم." :
            result ? "الرموز وفواصل الأسطر سليمة من ناحية البنية." :
            "مرفوض: يوجد رمز ناقص أو مضاف أو متغير الترتيب، أو علامة Unicode غير آمنة."}
        </p>
      </div>
    </details>
  );
}
