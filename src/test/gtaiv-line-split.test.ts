import { describe, expect, it } from "vitest";
import { GTAIV_LINE_BREAK_TOKEN, gtaIvEditorTextToRuntimeText, gtaIvRuntimeTextToEditorText, planGtaIvLineJoin, planGtaIvLineSplit } from "@/lib/gtaiv/gtaiv-line-split";

const gtaEntry = (original: string, index = 0) => ({
  msbtFile: "gtaiv/american.gxt",
  index,
  original,
});

describe("GTA IV line-split planner", () => {
  it("adds ~n~ between balanced Arabic segments and keeps existing runtime tokens", () => {
    const entry = gtaEntry("~r~ Mission text ~z~");
    const plan = planGtaIvLineSplit([entry], { "gtaiv/american.gxt:0": "~r~ هذه ترجمة عربية طويلة للقائمة ~z~" }, 12);
    expect(plan.targetKeys).toEqual(["gtaiv/american.gxt:0"]);
    expect(plan.updates["gtaiv/american.gxt:0"]).toContain(GTAIV_LINE_BREAK_TOKEN);
    expect(plan.updates["gtaiv/american.gxt:0"]).toContain("~r~");
    expect(plan.updates["gtaiv/american.gxt:0"]).toContain("~z~");
  });

  it("does not alter rows whose source already contains ~n~", () => {
    const entry = gtaEntry("First ~n~ second");
    const plan = planGtaIvLineSplit([entry], { "gtaiv/american.gxt:0": "سطر عربي طويل ~n~ وسطر عربي طويل آخر" }, 8);
    expect(plan.targetKeys).toEqual([]);
  });

  it("removes tool-added ~n~ markers only from rows that had none in the source", () => {
    const entry = gtaEntry("Mission text");
    const plan = planGtaIvLineJoin([entry], { "gtaiv/american.gxt:0": "السطر الأول~n~السطر الثاني" });
    expect(plan.targetKeys).toEqual(["gtaiv/american.gxt:0"]);
    expect(plan.updates["gtaiv/american.gxt:0"]).toBe("السطر الأول السطر الثاني");
  });

  it("shows every GTA IV ~n~ as a real editor line and collapses only that display line at build time", () => {
    const raw = "الأول~n~الثاني~N~الثالث";
    const editorText = gtaIvRuntimeTextToEditorText(raw);

    expect(editorText).toBe("الأول~n~\nالثاني~N~\nالثالث");
    expect(gtaIvEditorTextToRuntimeText(editorText)).toBe("الأول~n~الثاني~N~الثالث");
    expect(gtaIvEditorTextToRuntimeText("سطر حر\nثانٍ")).toBe("سطر حر\nثانٍ");
  });
});
