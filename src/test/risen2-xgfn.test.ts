import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseXgfn, buildXgfn } from "@/lib/risen2-xgfn";

const FIXTURE_PATH = join(__dirname, "fixtures", "risen2-numbers-font-sample.xgfn");

function loadFixture(): ArrayBuffer {
  const buf = readFileSync(FIXTURE_PATH);
  const bytes = new Uint8Array(buf.length);
  bytes.set(buf);
  return bytes.buffer;
}

describe("Risen 2 .xgfn parser (real sample: Trajan Pro 7pt numbers font)", () => {
  it("parses the confirmed header fields correctly", () => {
    const doc = parseXgfn(loadFixture());
    expect(doc.glyphCount).toBe(13); // raw 0xEA value — meaning unresolved, preserved verbatim
    expect(doc.headerPrefix.length).toBe(0xfa);
  });

  it("parses the charmap with the confirmed digit/space mappings", () => {
    const doc = parseXgfn(loadFixture());
    // 12 pairs (the 0xF6 field). The FIRST pair is the (0x1F -> glyph 0)
    // notdef-box mapping — an earlier revision misread it as a header field
    // at 0xFA and consequently misread the recordCount field as a final pair.
    expect(doc.charmap.length).toBe(12);
    expect(doc.charmap[0].charCode).toBe(0x1f);
    expect(doc.charmap[0].glyphIndex).toBe(0);
    const byChar = new Map(doc.charmap.map((r) => [r.charCode, r.glyphIndex]));
    expect(byChar.get(32)).toBe(1); // space
    for (let d = 0; d <= 9; d++) {
      expect(byChar.get(48 + d)).toBe(2 + d); // '0'..'9' -> glyph 2..11
    }
  });

  it("parses recordCount full measurement records with atlas_x as a monotonically increasing sequence for the digits", () => {
    const doc = parseXgfn(loadFixture());
    // recordCount (12) is an independent field, NOT derived from the pair
    // count — confirmed exactly on all 112 real fonts sampled (77 original +
    // 35 from a working Chinese mod), where it always equals the highest
    // glyphIndex + 1.
    expect(doc.recordCount).toBe(12);
    expect(doc.measurements.length).toBe(12);
    const maxGlyph = Math.max(...doc.charmap.map((r) => r.glyphIndex));
    expect(doc.recordCount).toBe(maxGlyph + 1);
    // glyph indices 2..11 are the digits '0'..'9', in charmap order
    const atlasXs = doc.measurements.slice(2, 12).map((m) => m.fields[0]);
    for (let i = 1; i < atlasXs.length; i++) {
      expect(atlasXs[i]).toBeGreaterThan(atlasXs[i - 1]);
    }
  });

  it("every measurement record is a full 36 bytes, followed by a 4-byte trailing field before DDS", () => {
    const doc = parseXgfn(loadFixture());
    for (const m of doc.measurements) expect(m.rawBytes.length).toBe(36);
    expect(doc.trailingBytes.length).toBe(4);
  });

  it("parses a real 256x256 uncompressed BGRA32 DDS atlas", () => {
    const doc = parseXgfn(loadFixture());
    const view = new DataView(doc.ddsBytes.buffer, doc.ddsBytes.byteOffset, doc.ddsBytes.byteLength);
    const magic = new TextDecoder("ascii").decode(doc.ddsBytes.subarray(0, 4));
    expect(magic).toBe("DDS ");
    const height = view.getUint32(12, true);
    const width = view.getUint32(16, true);
    const bitcount = view.getUint32(88, true);
    expect(width).toBe(256);
    expect(height).toBe(256);
    expect(bitcount).toBe(32);
    // header(128) + width*height*4 raw BGRA32 pixels
    expect(doc.ddsBytes.length).toBe(128 + 256 * 256 * 4);
  });

  it("round-trips byte-for-byte with no modifications", () => {
    const original = loadFixture();
    const doc = parseXgfn(original);
    const rebuilt = buildXgfn(doc);
    const a = new Uint8Array(original);
    const b = new Uint8Array(rebuilt);
    expect(b.length).toBe(a.length);
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
  });

  it("charmap edits round-trip correctly: adding 3 synthetic Arabic glyph entries parses back at the right positions", () => {
    const doc = parseXgfn(loadFixture());
    const originalCharmapLen = doc.charmap.length;
    const originalRecordCount = doc.recordCount;

    // Simulate what the generator does: append new charmap entries + matching
    // measurement records, bump recordCount and the 0xF6 pair count, keep the
    // DDS bytes as-is (a real generator also grows the atlas — out of scope
    // here; this test only verifies the charmap/record bookkeeping).
    const newEntries: { charCode: number; glyphIndex: number }[] = [
      { charCode: 0xfe8e, glyphIndex: originalRecordCount },     // ARABIC LETTER ALEF FINAL FORM
      { charCode: 0xfeee, glyphIndex: originalRecordCount + 1 }, // ARABIC LETTER WAW FINAL FORM
      { charCode: 0xfef2, glyphIndex: originalRecordCount + 2 }, // ARABIC LETTER YEH FINAL FORM
    ];
    doc.charmap.push(...newEntries);
    for (let i = 0; i < newEntries.length; i++) {
      const rawBytes = new Uint8Array(36);
      const dv = new DataView(rawBytes.buffer);
      dv.setInt32(0, 100 + i * 10, true); // fake atlas_x
      const fields: number[] = [];
      for (let k = 0; k < 9; k++) fields.push(dv.getInt32(k * 4, true));
      doc.measurements.push({ rawBytes, fields });
    }
    doc.recordCount += newEntries.length;
    const headerView = new DataView(doc.headerPrefix.buffer, doc.headerPrefix.byteOffset, doc.headerPrefix.byteLength);
    headerView.setUint32(0xf6, doc.charmap.length, true);

    const rebuilt = buildXgfn(doc);
    const reparsed = parseXgfn(rebuilt);

    expect(reparsed.charmap.length).toBe(originalCharmapLen + 3);
    expect(reparsed.recordCount).toBe(originalRecordCount + 3);
    const byChar = new Map(reparsed.charmap.map((r) => [r.charCode, r.glyphIndex]));
    expect(byChar.get(0xfe8e)).toBe(originalRecordCount);
    expect(byChar.get(0xfeee)).toBe(originalRecordCount + 1);
    expect(byChar.get(0xfef2)).toBe(originalRecordCount + 2);
    // Original mappings still intact
    expect(byChar.get(32)).toBe(1);
    expect(byChar.get(57)).toBe(11);
    expect(byChar.get(0x1f)).toBe(0);
  });
});

const GEORGIA_FIXTURE_PATH = join(__dirname, "fixtures", "risen2-georgia-font-sample.xgfn");

function loadGeorgiaFixture(): ArrayBuffer {
  const buf = readFileSync(GEORGIA_FIXTURE_PATH);
  const bytes = new Uint8Array(buf.length);
  bytes.set(buf);
  return bytes.buffer;
}

describe("Risen 2 .xgfn parser (real sample: Georgia 16pt bold-oblique, 276 charmap pairs)", () => {
  it("parses a much larger real charmap correctly, proving the structure generalizes beyond the numbers sample", () => {
    const doc = parseXgfn(loadGeorgiaFixture());
    expect(doc.glyphCount).toBe(27); // raw 0xEA — NOT a pair/record count
    expect(doc.charmap.length).toBe(276);
    expect(doc.recordCount).toBe(276);
    expect(doc.measurements.length).toBe(276);
    const maxGlyph = Math.max(...doc.charmap.map((r) => r.glyphIndex));
    expect(doc.recordCount).toBe(maxGlyph + 1);

    expect(doc.charmap[0].charCode).toBe(0x1f);
    expect(doc.charmap[0].glyphIndex).toBe(0);
    const byChar = new Map(doc.charmap.map((r) => [r.charCode, r.glyphIndex]));
    expect(byChar.get(32)).toBe(1); // space
    expect(byChar.get(0x41)).toBe(28); // 'A'
    expect(byChar.get(0x52)).toBe(45); // 'R'
    expect(byChar.get(0x44f)).toBe(238); // CYRILLIC SMALL LETTER YA (я)
    expect(byChar.get(0x20ac)).toBe(123); // EURO SIGN
  });

  it("every measurement record is full-size with a 4-byte trailing field before DDS", () => {
    const doc = parseXgfn(loadGeorgiaFixture());
    for (const m of doc.measurements) expect(m.rawBytes.length).toBe(36);
    expect(doc.trailingBytes.length).toBe(4);
  });

  it("round-trips byte-for-byte with no modifications", () => {
    const original = loadGeorgiaFixture();
    const doc = parseXgfn(original);
    const rebuilt = buildXgfn(doc);
    const a = new Uint8Array(original);
    const b = new Uint8Array(rebuilt);
    expect(b.length).toBe(a.length);
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
  });
});
