import { describe, it, expect } from "vitest";
import { mergeByIndex } from "../../supabase/functions/_shared/merge-issues.ts";

/**
 * الدمج يراكم الأسباب ويُبقي نصّاً مقترحاً واحداً. قبل هذا الإصلاح كان يختار
 * الأطول، فتظهر بطاقة سببها يَعِد بإصلاح لا يفعله نصّها — وهو ما رآه المستخدم
 * في `platinum/npc_trainer_messages:477`: «يجب استخدام بوكيمون وليس البوبمون»
 * فوق نصّ ما زال يقول البوبمون.
 */
describe("mergeByIndex", () => {
  const fixesWord = {
    index: 477,
    issue: "ترجمة Pokémon إلى البوبمون",
    detail: "يجب استخدام بوكيمون وليس البوبمون.",
    suggested: "اسمع، الناس والبوكيمون، كلنا\nجزء من الطبيعة الأم.",
    category: "wrong",
    severity: "high",
  };
  const rewordsOnly = {
    index: 477,
    issue: "صياغة أفضل",
    detail: "تحسين الأسلوب.",
    suggested: "اسمعوا يا ناس، أنتم والبوبمون، كلّنا\nجزء من الطبيعة الأم.",
    category: "style",
    severity: "low",
  };

  it("يُبقي كلّ نصّ مقترح في بطاقته بدل إلصاق سبب بنصّ لا يحقّقه", () => {
    const merged = mergeByIndex([fixesWord, rewordsOnly]);
    expect(merged).toHaveLength(2);
    for (const card of merged) {
      const text = (card as { suggested: string }).suggested;
      const why = (card as { issue: string }).issue;
      if (why.includes("البوبمون")) expect(text).toContain("بوكيمون");
    }
    // بطاقة الإصلاح لم تُبتلع
    expect(merged.some((c) => (c as { suggested: string }).suggested.includes("والبوكيمون"))).toBe(true);
  });

  it("يدمج سببين في بطاقة واحدة حين يكون النصّ المقترح نفسه", () => {
    const second = { ...fixesWord, issue: "تشكيل زائد", detail: "أزل التشكيل.", category: "style", severity: "low" };
    const merged = mergeByIndex([fixesWord, second]);
    expect(merged).toHaveLength(1);
    expect(merged[0].issue).toBe("ترجمة Pokémon إلى البوبمون • تشكيل زائد");
    expect(merged[0].detail).toBe("يجب استخدام بوكيمون وليس البوبمون.\nأزل التشكيل.");
    expect(merged[0].category).toBe("wrong");   // أخطر فئة
    expect(merged[0].severity).toBe("high");    // أعلى خطورة
  });

  it("يتجاهل السجلّات بلا index ويُبقي ترتيب النصوص المختلفة", () => {
    const merged = mergeByIndex([{ suggested: "بلا فهرس" } as never, fixesWord, rewordsOnly]);
    expect(merged).toHaveLength(2);
    expect(merged[0].issue).toBe("ترجمة Pokémon إلى البوبمون");
  });
});
