import { describe, expect, it } from "vitest";
import { planGtaIvLineSplit } from "@/lib/gtaiv/gtaiv-line-split";

describe("GTA IV long sequential line-split verification", () => {
  it("fills every non-final line through the last word that fits at the selected limit", () => {
    const limit = 30;
    const text = "تتحرك الشخصية عبر شوارع المدينة المزدحمة ثم تتوقف قرب المبنى القديم لتستمع إلى التعليمات الجديدة قبل متابعة المهمة التالية مع أصدقائها في المساء حيث تزداد الأصوات والأنوار حولها تدريجياً";
    const plan = planGtaIvLineSplit(
      [{ msbtFile: "gtaiv/american.gxt", index: 901, original: "Long English source without markers" }],
      { "gtaiv/american.gxt:901": text },
      limit,
    );
    const result = plan.updates["gtaiv/american.gxt:901"];
    const lines = result.split("~n~");

    expect(lines.length).toBeGreaterThan(4);
    expect(result).not.toContain("\n");
    expect(lines.map((line) => line.length)).toEqual([23, 29, 24, 28, 29, 24, 23]);

    for (let index = 0; index < lines.length - 1; index++) {
      const firstWordOfNextLine = lines[index + 1].split(" ")[0];
      expect(lines[index].length).toBeLessThanOrEqual(limit);
      expect(`${lines[index]} ${firstWordOfNextLine}`.length).toBeGreaterThan(limit);
    }
    expect(lines.at(-1)?.length).toBeLessThanOrEqual(limit);
  });
});
