import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseXgfn, buildXgfn } from "@/lib/risen2-xgfn";
import { appendArabicGlyphsToXgfn, replaceGlyphsInXgfn, measureFontCellMetrics, type RenderedArabicGlyph } from "@/lib/risen2-arabic-font-gen";
import { remapCharmapPair } from "@/lib/risen2-xgfn-edit";
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

describe("measureFontCellMetrics (real fixtures)", () => {
  it("numbers font: every non-empty original box shares one uniform cell height, and the baseline sits inside it", () => {
    const doc = parseXgfn(loadFixture());
    const { cellHeight, baseline } = measureFontCellMetrics(doc);
    for (const m of doc.measurements) {
      const [x0, y0, x1, y1] = m.fields;
      if (x1 > x0 && y1 > y0) expect(y1 - y0).toBe(cellHeight);
    }
    expect(baseline).toBeGreaterThan(cellHeight / 2); // baseline is in the lower half
    expect(baseline).toBeLessThanOrEqual(cellHeight);
  });

  it("Georgia_16: cell height is exactly 27 (measured directly on the original font — all 275 non-empty boxes)", () => {
    const buf = readFileSync(join(__dirname, "fixtures", "risen2-georgia-font-sample.xgfn"));
    const bytes = new Uint8Array(buf.length);
    bytes.set(buf);
    const doc = parseXgfn(bytes.buffer);
    const { cellHeight, baseline } = measureFontCellMetrics(doc);
    expect(cellHeight).toBe(27);
    expect(baseline).toBeGreaterThan(13);
    expect(baseline).toBeLessThanOrEqual(27);
  });
});

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

    // 0x1C is opaque to this module's own parser (parseXgfn never reads it),
    // so the assertions above would pass even if it were stale — check the
    // RAW rebuilt bytes directly against the confirmed formula, since that's
    // what the real game engine actually depends on.
    const rebuiltView = new DataView(rebuilt);
    expect(rebuiltView.getUint32(0x1c, true)).toBe(rebuilt.byteLength - 0x66);
  });

  it("patches 0x1C to (new total size - 0x66) after appending glyphs — confirmed exactly on two real fonts of different sizes; stale here caused a real in-game STATUS_NO_MEMORY crash", () => {
    const doc = parseXgfn(loadFixture());
    const merged = appendArabicGlyphsToXgfn(doc, [makeGlyph(0xfe8e, 5, 7, 6), makeGlyph(0x0660, 3, 5, 4)]);

    const rebuilt = buildXgfn(merged);
    const totalSize = rebuilt.byteLength;

    const headerView = new DataView(merged.headerPrefix.buffer, merged.headerPrefix.byteOffset, merged.headerPrefix.byteLength);
    expect(headerView.getUint32(0x1c, true)).toBe(totalSize - 0x66);

    // Sanity: the merged document actually grew, so the assertion above
    // isn't trivially true just because the field was left equal to the
    // original (unchanged) size.
    const originalTotalSize = loadFixture().byteLength;
    expect(totalSize).toBeGreaterThan(originalTotalSize);
  });

  it("updates the trailing u32 to the NEW DDS byte length — equal on 112/112 real fonts; left stale it hid ALL glyphs in-game (Arabic and Latin)", () => {
    const doc = parseXgfn(loadFixture());
    const originalDdsLen = doc.ddsBytes.length;
    const merged = appendArabicGlyphsToXgfn(doc, [makeGlyph(0xfe8e, 5, 7, 6), makeGlyph(0x0660, 3, 5, 4)]);

    const trailingView = new DataView(merged.trailingBytes.buffer, merged.trailingBytes.byteOffset, merged.trailingBytes.byteLength);
    expect(trailingView.getUint32(0, true)).toBe(merged.ddsBytes.length);
    // Non-trivial: the atlas really grew, so a stale copy of the original
    // value would fail this assertion.
    expect(merged.ddsBytes.length).toBeGreaterThan(originalDdsLen);
  });

  it("packs neighbouring glyphs with a 1px gap (like the Chinese mod) — no touching cells", () => {
    const doc = parseXgfn(loadFixture());
    const merged = appendArabicGlyphsToXgfn(doc, [makeGlyph(0xfe8e, 5, 7, 6), makeGlyph(0xfeee, 4, 7, 5), makeGlyph(0x0660, 3, 5, 4)]);
    const base = doc.measurements.length;
    const [a, b, c] = [base, base + 1, base + 2].map((i) => merged.measurements[i].fields);
    // same shelf row: each next box starts 1px after the previous box ends
    expect(b[0]).toBe(a[2] + 1);
    expect(c[0]).toBe(b[2] + 1);
  });

  it("sets fields[5..8] of every ADDED glyph record to zero, matching the working Chinese mod's added records exactly", () => {
    const doc = parseXgfn(loadFixture());
    const baseCount = doc.measurements.length;
    const merged = appendArabicGlyphsToXgfn(doc, [makeGlyph(0xfe8e, 5, 7, 6), makeGlyph(0x0660, 3, 5, 4)]);
    for (let i = baseCount; i < merged.measurements.length; i++) {
      const f = merged.measurements[i].fields;
      expect(f.slice(5)).toEqual([0, 0, 0, 0]);
    }
  });
});

describe("replaceGlyphsInXgfn (instant single-letter replace + undo)", () => {
  it("repoints an EXISTING character's charmap pair to the new glyph, without adding a new pair", () => {
    const doc = parseXgfn(loadFixture());
    const spacePairBefore = doc.charmap.find((p) => p.charCode === 0x20)!;
    const { doc: replaced, previousGlyphIndex, report } = replaceGlyphsInXgfn(doc, [makeGlyph(0x20, 4, 4, 6)]);

    expect(report.errorCount).toBe(0);
    expect(replaced.charmap.length).toBe(doc.charmap.length); // no new pair added
    const spacePairAfter = replaced.charmap.find((p) => p.charCode === 0x20)!;
    expect(spacePairAfter.glyphIndex).not.toBe(spacePairBefore.glyphIndex);
    expect(spacePairAfter.glyphIndex).toBeGreaterThanOrEqual(doc.recordCount); // points at a newly-appended record
    expect(previousGlyphIndex.get(0x20)).toBe(spacePairBefore.glyphIndex);
  });

  it("adds a new pair (like append) for a codepoint that had none before, and omits it from previousGlyphIndex", () => {
    const doc = parseXgfn(loadFixture());
    const { doc: replaced, previousGlyphIndex, report } = replaceGlyphsInXgfn(doc, [makeGlyph(0xfe8e, 4, 4, 6)]);

    expect(report.errorCount).toBe(0);
    expect(replaced.charmap.length).toBe(doc.charmap.length + 1);
    expect(replaced.charmap.some((p) => p.charCode === 0xfe8e)).toBe(true);
    expect(previousGlyphIndex.has(0xfe8e)).toBe(false);
  });

  it("leaves the OLD record's bytes fully intact (orphaned, not deleted) after replacing", () => {
    const doc = parseXgfn(loadFixture());
    const oldGlyphIndex = doc.charmap.find((p) => p.charCode === 0x35)!.glyphIndex; // '5'
    const oldFieldsBefore = [...doc.measurements[oldGlyphIndex].fields];
    const { doc: replaced } = replaceGlyphsInXgfn(doc, [makeGlyph(0x35, 4, 4, 6)]);
    expect(replaced.measurements[oldGlyphIndex].fields).toEqual(oldFieldsBefore);
  });

  it("undo via remapCharmapPair restores the exact original mapping and audits clean", () => {
    const doc = parseXgfn(loadFixture());
    const nine = doc.charmap.find((p) => p.charCode === 0x39)!;
    const { doc: replaced, previousGlyphIndex } = replaceGlyphsInXgfn(doc, [makeGlyph(0x39, 5, 5, 7)]);
    expect(replaced.charmap.find((p) => p.charCode === 0x39)!.glyphIndex).not.toBe(nine.glyphIndex);

    const { doc: reverted, report } = remapCharmapPair(replaced, 0x39, previousGlyphIndex.get(0x39)!);
    expect(report.errorCount).toBe(0);
    expect(reverted.charmap.find((p) => p.charCode === 0x39)!.glyphIndex).toBe(nine.glyphIndex);
    expect(reverted.measurements[nine.glyphIndex].fields).toEqual(doc.measurements[nine.glyphIndex].fields);
  });

  it("replacing multiple presentation forms of one letter at once repoints all of them", () => {
    const doc = parseXgfn(loadFixture());
    const merged = appendArabicGlyphsToXgfn(doc, [makeGlyph(0xfeca, 4, 4, 5), makeGlyph(0xfecb, 4, 4, 5), makeGlyph(0xfecc, 4, 4, 5)]);
    const { doc: replaced, previousGlyphIndex, report } = replaceGlyphsInXgfn(merged, [
      makeGlyph(0xfeca, 5, 5, 6), makeGlyph(0xfecb, 5, 5, 6), makeGlyph(0xfecc, 5, 5, 6),
    ]);
    expect(report.errorCount).toBe(0);
    expect(replaced.charmap.length).toBe(merged.charmap.length); // all 3 already existed — no new pairs
    for (const cp of [0xfeca, 0xfecb, 0xfecc]) {
      expect(previousGlyphIndex.has(cp)).toBe(true);
      expect(replaced.charmap.find((p) => p.charCode === cp)!.glyphIndex).not.toBe(previousGlyphIndex.get(cp));
    }
  });
});
