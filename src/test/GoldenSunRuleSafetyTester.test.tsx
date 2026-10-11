import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GoldenSunRuleSafetyTester } from "@/components/editor/GoldenSunRuleSafetyTester";
import { goldenSunAllTechnicalTagsUnchanged } from "../../supabase/functions/_shared/goldensun-cerebras";

describe("Golden Sun II AI QA — full technical protection", () => {
  const src = "Felix\\x03[name] hello {hero:id}<b>%s</b>\nGo";
  const valid = "فيليكس\\x03[name] مرحبا {hero:id}<b>%s</b>\nانطلق";

  it("allows Arabic logical Unicode and same tokens / hard breaks", () => {
    expect(goldenSunAllTechnicalTagsUnchanged(src, valid)).toBe(true);
    expect(goldenSunAllTechnicalTagsUnchanged("Hey\\x03", "مرحبا\\x03")).toBe(true);
  });

  it("rejects changed or added markup and placeholders", () => {
    expect(goldenSunAllTechnicalTagsUnchanged(src, valid.replace("[name]", ""))).toBe(false);
    expect(goldenSunAllTechnicalTagsUnchanged(src, valid.replace("{hero:id}", "{hero:another}"))).toBe(false);
    expect(goldenSunAllTechnicalTagsUnchanged(src, valid.replace("</b>", "</i>"))).toBe(false);
    expect(goldenSunAllTechnicalTagsUnchanged(src, valid + "<color=blue>")).toBe(false);
    expect(goldenSunAllTechnicalTagsUnchanged(src, valid.replace("%s", "%d"))).toBe(false);
  });

  it("rejects reordered line separators relative to control bytes", () => {
    const a = "One\nTwo\\x03Three";
    expect(goldenSunAllTechnicalTagsUnchanged(a, "واحد\nاثنان\\x03ثلاثة")).toBe(true);
    expect(goldenSunAllTechnicalTagsUnchanged(a, "واحد\\x03اثنان\nثلاثة")).toBe(false);
    expect(goldenSunAllTechnicalTagsUnchanged(a, "واحد\\x03ثلاثة")).toBe(false);
  });

  it("rejects invisible bidi marks and presentation glyphs while allowing ordinary Arabic", () => {
    expect(goldenSunAllTechnicalTagsUnchanged("Ready?", "هل أنت مستعد؟")).toBe(true);
    for (const mark of ["\u200F", "\u061C", "\u202E", "\u2067", "\uFE8D", "\uFB50"]) {
      expect(goldenSunAllTechnicalTagsUnchanged("Ready?", "هل أنت" + mark + " مستعد؟")).toBe(false);
    }
  });

  it("offers a usable local validation UI without calling AI", () => {
    render(<GoldenSunRuleSafetyTester />);
    fireEvent.click(screen.getByText("اختبار محلي لسلامة وسوم Golden Sun II"));
    fireEvent.click(screen.getByRole("button", { name: "فحص سلامة الوسوم" }));
    expect(screen.getByTestId("goldensun-test-result")).toHaveTextContent("سليمة");
    fireEvent.change(screen.getByTestId("goldensun-test-arabic"), {
      target: { value: "فيليكس هل أنت مستعد؟" },
    });
    fireEvent.click(screen.getByRole("button", { name: "فحص سلامة الوسوم" }));
    expect(screen.getByTestId("goldensun-test-result")).toHaveTextContent("مرفوض");
    fireEvent.change(screen.getByTestId("goldensun-test-arabic"), {
      target: { value: "فيليكس\\x03هل أنت مستعد؟" },
    });
    fireEvent.click(screen.getByRole("button", { name: "فحص سلامة الوسوم" }));
    expect(screen.getByTestId("goldensun-test-result")).toHaveTextContent("سليمة");
  });
});
