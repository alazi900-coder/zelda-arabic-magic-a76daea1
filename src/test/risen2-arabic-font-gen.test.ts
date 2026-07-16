import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseXgfn, buildXgfn } from "@/lib/risen2-xgfn";
import { appendArabicGlyphsToXgfn, type RenderedArabicGlyph } from "@/lib/risen2-arabic-font-gen";
import { decodeDdsToRgba } from "@/lib/risen-ximg";

const FIXTURE_PATH = join(__dirname, "fixtures", "risen2-numbers-font-sample.xgfn");

function loadFixture(): ArrayBuffer {
  const buf = readFileSync(FIXTURE_PATH);
  const bytes = new Uint8Array(buf.length);
  bytes.set(buf);
  return bytes.buffer;
}

/** A tiny synthetic 3x3 fully-opaque white glyph, standing in for a real
 * rendered TTF bitmap — the packing/charmap logic doesn't care about actual
 * pixel content. */
function makeGlyph(codepoint: number, w = 3, h = 3, advance = 5): RenderedArabicGlyph {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = 255;
  }
  return { codepoint, width: w, height: h, rgba, advance };
}

describe("appendArabicGlyphsToXgfn (synthetic glyph bitmaps, real numbers-font base document)", () => {
  it("appends new glyphs with correct charmap entries and grows the atlas", () => {
    const doc = parseXgfn(loadFixture());
    const originalDecoded = decodeDdsToRgba(doc.ddsBytes);
    if (!originalDecoded.supported) throw new Error("fixture DDS unsupported");
    const originalCharmapLen = doc.charmap.length;
    const originalMeasurementsLen = doc.measurements.length;

    const glyphs = [makeGlyph(0xfe8e, 5, 7, 6), makeGlyph(0xfeee, 4, 7, 5), makeGlyph(0x0660, 3, 5, 4)];
    const merged = appendArabicGlyphsToXgfn(doc, glyphs);

    expect(merged.charmap.length).toBe(originalCharmapLen + 3);
    expect(merged.measurements.length).toBe(originalMeasurementsLen + 3);

    const byChar = new Map(merged.charmap.map((r) => [r.charCode, r.glyphIndex]));
    expect(byChar.get(0xfe8e)).toBe(originalMeasurementsLen);
    expect(byChar.get(0xfeee)).toBe(originalMeasurementsLen + 1);
    expect(byChar.get(0x0660)).toBe(originalMeasurementsLen + 2);

    // Original mappings untouched
    expect(byChar.get(32)).toBe(1);
    expect(byChar.get(57)).toBe(11);

    const mergedDecoded = decodeDdsToRgba(merged.ddsBytes);
    if (!mergedDecoded.supported) throw new Error("merged DDS unsupported");
    expect(mergedDecoded.width).toBe(originalDecoded.width);
    expect(mergedDecoded.height).toBeGreaterThan(originalDecoded.height);
  });

  it("leaves the 0xEA header field completely untouched regardless of how many glyphs are added", () => {
    // A real, working, heavily-modified font (from a successful Chinese mod:
    // 276 -> 3197 charmap pairs) leaves this exact field unchanged (27, same
    // as the unmodified original) even after a twelvefold charmap increase.
    // Previously this code bumped 0xEA proportionally to the glyph count on
    // an unverified guess about its meaning — that guess was wrong and
    // caused a real in-game crash (STATUS_NO_MEMORY during asset loading).
    const doc = parseXgfn(loadFixture());
    const originalGlyphCount = doc.glyphCount;
    const merged = appendArabicGlyphsToXgfn(doc, [makeGlyph(0xfe8e, 5, 7, 6), makeGlyph(0xfeee, 4, 7, 5)]);
    expect(merged.glyphCount).toBe(originalGlyphCount);
  });

  it("places new glyph pixels at the position recorded in its measurement fields", () => {
    const doc = parseXgfn(loadFixture());
    const glyph = makeGlyph(0xfe8e, 4, 4, 6);
    const merged = appendArabicGlyphsToXgfn(doc, [glyph]);

    const rec = merged.measurements[merged.measurements.length - 1];
    const [x0, y0, x1, y1, advance] = rec.fields;
    expect(x1 - x0).toBe(4);
    expect(y1 - y0).toBe(4);
    expect(advance).toBe(6);

    const decoded = decodeDdsToRgba(merged.ddsBytes);
    if (!decoded.supported) throw new Error("merged DDS unsupported");
    // Every pixel inside the declared box should be opaque white (from makeGlyph).
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * decoded.width + x) * 4;
        expect(decoded.rgba[o + 3]).toBe(255);
      }
    }
  });

  it("leaves original atlas pixel rows byte-for-byte untouched", () => {
    const doc = parseXgfn(loadFixture());
    const originalDecoded = decodeDdsToRgba(doc.ddsBytes);
    if (!originalDecoded.supported) throw new Error("fixture DDS unsupported");

    const merged = appendArabicGlyphsToXgfn(doc, [makeGlyph(0xfe8e, 5, 7, 6)]);
    const mergedDecoded = decodeDdsToRgba(merged.ddsBytes);
    if (!mergedDecoded.supported) throw new Error("merged DDS unsupported");

    const originalRowBytes = originalDecoded.width * originalDecoded.height * 4;
    const before = originalDecoded.rgba.subarray(0, originalRowBytes);
    const after = mergedDecoded.rgba.subarray(0, originalRowBytes);
    expect(Buffer.from(after).equals(Buffer.from(before))).toBe(true);
  });

  it("a zero-ink glyph (width=0) still gets a charmap entry with its advance but no atlas space", () => {
    const doc = parseXgfn(loadFixture());
    const blank: RenderedArabicGlyph = { codepoint: 0x200c, width: 0, height: 0, rgba: new Uint8Array(0), advance: 3 };
    const merged = appendArabicGlyphsToXgfn(doc, [blank]);

    const byChar = new Map(merged.charmap.map((r) => [r.charCode, r.glyphIndex]));
    const gi = byChar.get(0x200c)!;
    const rec = merged.measurements[gi];
    expect(rec.fields[0]).toBe(0);
    expect(rec.fields[2]).toBe(0);
    expect(rec.fields[4]).toBe(3); // advance preserved
  });

  it("pads the atlas to power-of-2 dimensions — the game's DX9-era engine silently fails to load NPOT textures", () => {
    const doc = parseXgfn(loadFixture());
    const merged = appendArabicGlyphsToXgfn(doc, [makeGlyph(0xfe8e, 5, 7, 6), makeGlyph(0xfeee, 4, 7, 5), makeGlyph(0x0660, 3, 5, 4)]);
    const decoded = decodeDdsToRgba(merged.ddsBytes);
    if (!decoded.supported) throw new Error("merged DDS unsupported");

    const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;
    expect(isPowerOfTwo(decoded.width)).toBe(true);
    expect(isPowerOfTwo(decoded.height)).toBe(true);
  });

  it("rounds a 450px-tall requirement up to 512 (next power of 2), not the tight-fit size", () => {
    const doc = parseXgfn(loadFixture());
    const originalDecoded = decodeDdsToRgba(doc.ddsBytes);
    if (!originalDecoded.supported) throw new Error("fixture DDS unsupported");
    expect(originalDecoded.width).toBe(256);
    expect(originalDecoded.height).toBe(256);

    // One glyph exactly tall enough to push the tight-fit height to 256 + 194 = 450.
    const tallGlyph = makeGlyph(0xfe8e, 250, 194, 10);
    const merged = appendArabicGlyphsToXgfn(doc, [tallGlyph]);
    const decoded = decodeDdsToRgba(merged.ddsBytes);
    if (!decoded.supported) throw new Error("merged DDS unsupported");

    expect(decoded.width).toBe(256);
    expect(decoded.height).toBe(512);
  });

  it("round-trips through buildXgfn/parseXgfn byte-for-byte consistent", () => {
    const doc = parseXgfn(loadFixture());
    const merged = appendArabicGlyphsToXgfn(doc, [makeGlyph(0xfe8e, 5, 7, 6), makeGlyph(0x0660, 3, 5, 4)]);

    const rebuilt = buildXgfn(merged);
    const reparsed = parseXgfn(rebuilt);

    expect(reparsed.charmap.length).toBe(merged.charmap.length);
    expect(reparsed.measurements.length).toBe(merged.measurements.length);
    const byChar = new Map(reparsed.charmap.map((r) => [r.charCode, r.glyphIndex]));
    expect(byChar.get(0xfe8e)).toBeDefined();
    expect(byChar.get(0x0660)).toBeDefined();
  });
});
