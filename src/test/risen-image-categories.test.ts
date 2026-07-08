import { describe, it, expect } from "vitest";
import { classifyImagePath, buildImageSections } from "@/lib/risen/image-categories";

describe("risen-image-categories", () => {
  it("splits Special_LoadingHint_* out of NoMip into its own virtual section", () => {
    const hint = classifyImagePath("NoMip/Special_LoadingHint_01.ximg");
    expect(hint.id).toBe("loading-hints");
    expect(hint.group).toBe("localization");

    const otherNoMip = classifyImagePath("NoMip/some_texture.ximg");
    expect(otherNoMip.id).not.toBe("loading-hints");
    expect(otherNoMip.group).toBe("other");
  });

  it("classifies GUI/ and achievements/ as localization sections", () => {
    expect(classifyImagePath("GUI/GUI_MainMenueBack.ximg").group).toBe("localization");
    expect(classifyImagePath("achievements/img_01.ximg").group).toBe("localization");
  });

  it("maps known other folders to their Arabic label and keeps unknown folders raw", () => {
    expect(classifyImagePath("Level/rock01.ximg").label).toBe("تكسترات المستويات");
    expect(classifyImagePath("SomeNewFolder/x.ximg").label).toBe("SomeNewFolder");
  });

  it("builds section counts split by group, sorted descending", () => {
    const files = [
      { path: "GUI/a.ximg", offset: 0, size: 1 },
      { path: "GUI/b.ximg", offset: 0, size: 1 },
      { path: "NoMip/Special_LoadingHint_01.ximg", offset: 0, size: 1 },
      { path: "Level/x.ximg", offset: 0, size: 1 },
      { path: "Level/y.ximg", offset: 0, size: 1 },
      { path: "Level/z.ximg", offset: 0, size: 1 },
    ];
    const { localization, other } = buildImageSections(files);
    expect(localization.find((s) => s.id === "gui")?.count).toBe(2);
    expect(localization.find((s) => s.id === "loading-hints")?.count).toBe(1);
    expect(other[0].id).toBe("other-level");
    expect(other[0].count).toBe(3);
  });
});
