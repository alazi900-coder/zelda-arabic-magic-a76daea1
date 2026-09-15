import { describe, it, expect } from "vitest";
import { maskPlatTags, unmaskPlatTags, diffPlatTags } from "@/lib/nds/plat-tag-mask";

describe("pause markers behind a placeholder", () => {
  it("hides a page break from the model and puts it back", () => {
    const { text, tags } = maskPlatTags("مرحباً {STRVAR_1 3, 0, 0}!▼\nالصفحة التالية.");
    expect(text).not.toContain("▼");
    expect(tags).toContain("▼");
    expect(unmaskPlatTags(text, tags)).toBe("مرحباً {STRVAR_1 3, 0, 0}!▼\nالصفحة التالية.");
  });

  it("reports a pause the model dropped", () => {
    expect(diffPlatTags("A.▼\nB.", "أ.\nب.").missing).toEqual(["▼"]);
  });

  it("says nothing when the pause came back", () => {
    expect(diffPlatTags("A.▼\nB.", "أ.▼\nب.").missing).toEqual([]);
  });

  it("tells the two pause kinds apart", () => {
    expect(diffPlatTags("A▽B", "أ▼ب").missing).toEqual(["▽"]);
  });
});
