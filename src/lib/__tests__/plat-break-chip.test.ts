import { describe, it, expect } from "vitest";
import { editorTagPattern } from "@/lib/editor-tag-pattern";
describe("break tokens as protected chips", () => {
  it("highlights ▼ and ▽ in Platinum", () => {
    expect("A▼\nB▽C".split(editorTagPattern("platinum/x")).filter(p => p === "▼" || p === "▽")).toEqual(["▼", "▽"]);
  });
  it("leaves ▼ alone in other games", () => {
    expect(editorTagPattern("bf/x.msbt").test("▼")).toBe(false);
  });
});
