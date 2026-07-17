import { describe, it, expect } from "vitest";
import { FREE_ARABIC_FONTS } from "@/lib/risen2-free-fonts";

describe("FREE_ARABIC_FONTS catalog", () => {
  it("has unique ids and names", () => {
    const ids = FREE_ARABIC_FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = FREE_ARABIC_FONTS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every entry points at the official google/fonts repo over HTTPS on a CORS-enabled CDN", () => {
    for (const f of FREE_ARABIC_FONTS) {
      expect(f.url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/gh\/google\/fonts@main\/ofl\/.+\.ttf$/);
    }
  });

  it("lists the 12 curated fonts", () => {
    expect(FREE_ARABIC_FONTS).toHaveLength(12);
  });
});
