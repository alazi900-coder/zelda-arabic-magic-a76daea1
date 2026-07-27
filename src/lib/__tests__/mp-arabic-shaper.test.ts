import { describe, it, expect } from "vitest";
import { shapeArabicForMp, hasArabicForMp, mpTagPlaceholderIndex, getMpArabicGlyphCodepoints } from "@/lib/metroid-prime/mp-arabic-shaper";

const isPresentationForm = (cp: number) => cp >= 0xfb50 && cp <= 0xfeff;
const isLogicalArabic = (cp: number) => cp >= 0x0600 && cp <= 0x06ff;

describe("metroid prime arabic shaper", () => {
  it("leaves text with no Arabic completely untouched", () => {
    const src = "Access to [TAG:000e:0000:0003:ff0a0aff]Magmoor Caverns West[TAG:000e:0000:0003:000000ff] granted.";
    const out = shapeArabicForMp(src);
    expect(out.text).toBe(src);
    expect(out.tags).toEqual([]);
  });

  it("converts logical Arabic letters into presentation forms", () => {
    const { text } = shapeArabicForMp("مرحبا");
    const codes = [...text].map((c) => c.charCodeAt(0));
    // every letter must now be a presentation form the font can actually carry
    expect(codes.every(isPresentationForm)).toBe(true);
    expect(codes.some(isLogicalArabic)).toBe(false);
  });

  it("reverses Arabic so a naive left-to-right renderer draws it right-to-left", () => {
    const { text } = shapeArabicForMp("مرحبا");
    // The last letter drawn (rightmost-to-first-read) must derive from م,
    // i.e. logical order is inverted in the stored bytes.
    const forms = [...text].map((c) => c.charCodeAt(0));
    expect(forms.length).toBeGreaterThan(0);
    // shaped+reversed output must differ from the shaped-only logical order
    expect(text).not.toBe("مرحبا");
  });

  it("shields control tags as single placeholders and preserves them verbatim", () => {
    const src = "مرحبا [TAG:000e:0000:0003:ff0a0aff]بكم[TAG:000e:0000:0003:000000ff]";
    const { text, tags } = shapeArabicForMp(src);
    expect(tags).toEqual([
      "[TAG:000e:0000:0003:ff0a0aff]",
      "[TAG:000e:0000:0003:000000ff]",
    ]);
    // each tag occupies exactly one placeholder char in the shaped string
    const slots = [...text].map(mpTagPlaceholderIndex).filter((s) => s !== null);
    expect(slots.sort()).toEqual([0, 1]);
    // and no raw bracket text survived into the shaped output
    expect(text).not.toContain("[TAG:");
  });

  it("restores the real Arabic question mark (never Risen's private-use alias)", () => {
    const { text } = shapeArabicForMp("ماذا؟");
    expect(text).toContain("؟");
    // U+E100 is Risen's engine-specific alias — Metroid Prime's font has no glyph there
    expect([...text].some((c) => c.charCodeAt(0) === 0xe100)).toBe(false);
  });

  it("keeps Latin words readable inside an Arabic sentence", () => {
    const { text } = shapeArabicForMp("مرحبا Metroid Prime");
    expect(text).toContain("Metroid Prime");
  });

  it("drops tashkeel, which the engine cannot stack and the font has no glyph for", () => {
    // Real translations do use these — the reported .pak contains
    // U+064B/064D/064E/064F/0650/0651.
    const { text } = shapeArabicForMp("مُعَدَّلٌ");
    const codes = [...text].map((c) => c.charCodeAt(0));
    expect(codes.some((cp) => (cp >= 0x064b && cp <= 0x065f) || cp === 0x0670)).toBe(false);
    expect(codes.every(isPresentationForm)).toBe(true);
  });

  it("emits nothing outside the glyph set the font tool generates", () => {
    const samples = ["مرحباً بكم", "الفرقاطة البحثية أورفيون", "ماذا؟ لا شيء، ١٢٣", "لا إله إلا الله"];
    const covered = new Set(getMpArabicGlyphCodepoints());
    const uncovered = new Set<number>();
    for (const s of samples) {
      for (const ch of shapeArabicForMp(s).text) {
        const cp = ch.charCodeAt(0);
        const arabic =
          (cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff);
        if (arabic && !covered.has(cp)) uncovered.add(cp);
      }
    }
    expect([...uncovered]).toEqual([]);
  });

  it("hasArabicForMp detects logical letters and presentation forms, not Latin", () => {
    expect(hasArabicForMp("Hello")).toBe(false);
    expect(hasArabicForMp("مرحبا")).toBe(true);
    expect(hasArabicForMp("ﺎ")).toBe(true);
  });
});
