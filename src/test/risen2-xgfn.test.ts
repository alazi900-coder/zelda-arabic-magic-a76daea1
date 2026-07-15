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

describe("Risen 2 .xgfn parser (real sample: Trajan Pro 7pt numbers font, 13 glyphs)", () => {
  it("parses the confirmed header fields correctly", () => {
    const doc = parseXgfn(loadFixture());
    expect(doc.glyphCount).toBe(13);
    expect(doc.headerPrefix.length).toBe(0xfe);
  });

  it("parses the charmap with the confirmed digit/space mappings", () => {
    const doc = parseXgfn(loadFixture());
    // 12 pairs — the authoritative count comes from the 0xF6 header field,
    // not glyphCount (0xEA); they happen to coincide on this small sample
    // (glyphCount - 1 === 12) but do NOT in general (see Georgia sample test).
    expect(doc.charmap.length).toBe(12);
    const byChar = new Map(doc.charmap.map((r) => [r.charCode, r.glyphIndex]));
    expect(byChar.get(32)).toBe(1); // space
    for (let d = 0; d <= 9; d++) {
      expect(byChar.get(48 + d)).toBe(2 + d); // '0'..'9' -> glyph 2..11
    }
    expect(byChar.get(0x0c)).toBe(0); // fallback pair -> glyph 0
  });

  it("parses charmapPairCount + 1 measurement records with atlas_x as a monotonically increasing sequence for the digits", () => {
    const doc = parseXgfn(loadFixture());
    // 13 records (12 charmap pairs + 1) — coincides with glyphCount on this
    // small sample but not in general (see Georgia sample test).
    expect(doc.measurements.length).toBe(13);
    // glyph indices 2..11 are the digits '0'..'9', in charmap order
    const atlasXs = doc.measurements.slice(2, 12).map((m) => m.fields[0]);
    for (let i = 1; i < atlasXs.length; i++) {
      expect(atlasXs[i]).toBeGreaterThan(atlasXs[i - 1]);
    }
  });

  it("the last measurement record is truncated exactly at the DDS boundary (not a full 36 bytes)", () => {
    const doc = parseXgfn(loadFixture());
    const last = doc.measurements[doc.measurements.length - 1];
    expect(last.rawBytes.length).toBeLessThan(36);
    expect(last.rawBytes.length).toBeGreaterThan(0);
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

    // The original last record (glyph 12, the fallback) is truncated because
    // it used to be last — now that we're appending after it, it must become
    // a full 36-byte record like any non-final record (a real generator has
    // to do exactly this: only the true final record may be short).
    const oldLast = doc.measurements[doc.measurements.length - 1];
    const paddedLast = new Uint8Array(36);
    paddedLast.set(oldLast.rawBytes);
    doc.measurements[doc.measurements.length - 1] = { rawBytes: paddedLast, fields: oldLast.fields };

    // Simulate what Phase 2 will do: append new charmap entries + matching
    // measurement records, bump glyphCount, keep the DDS bytes as-is (a real
    // generator would also grow the atlas, but that's out of scope here —
    // this test only verifies the charmap/measurement/glyphCount bookkeeping).
    const newEntries: { charCode: number; glyphIndex: number }[] = [
      { charCode: 0xfe8e, glyphIndex: doc.glyphCount },     // ARABIC LETTER ALEF FINAL FORM
      { charCode: 0xfeee, glyphIndex: doc.glyphCount + 1 }, // ARABIC LETTER WAW FINAL FORM
      { charCode: 0xfef2, glyphIndex: doc.glyphCount + 2 }, // ARABIC LETTER YEH FINAL FORM
    ];
    doc.charmap.push(...newEntries);
    for (let i = 0; i < newEntries.length; i++) {
      const rawBytes = new Uint8Array(36);
      const dv = new DataView(rawBytes.buffer);
      dv.setInt32(0, 100 + i * 10, true); // fake atlas_x
      doc.measurements.push({ rawBytes, fields: [100 + i * 10] });
    }
    doc.glyphCount += newEntries.length;
    // Patch the header's charmap pair count field (0xF6 — the authoritative
    // field, confirmed across all 77 real fonts.pak entries) to match the
    // new charmap length. Also patch 0xEA for realism even though its true
    // meaning is unresolved (Phase 1 exposes headerPrefix as opaque, so the
    // test patches it directly the same way a real generator would).
    const headerView = new DataView(doc.headerPrefix.buffer, doc.headerPrefix.byteOffset, doc.headerPrefix.byteLength);
    headerView.setUint32(0xea, doc.glyphCount, true);
    headerView.setUint32(0xf6, doc.charmap.length, true);

    const rebuilt = buildXgfn(doc);
    const reparsed = parseXgfn(rebuilt);

    expect(reparsed.glyphCount).toBe(13 + 3);
    expect(reparsed.charmap.length).toBe(originalCharmapLen + 3);
    const byChar = new Map(reparsed.charmap.map((r) => [r.charCode, r.glyphIndex]));
    expect(byChar.get(0xfe8e)).toBe(13);
    expect(byChar.get(0xfeee)).toBe(14);
    expect(byChar.get(0xfef2)).toBe(15);
    // Original mappings still intact
    expect(byChar.get(32)).toBe(1);
    expect(byChar.get(57)).toBe(11);
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
  it("parses a much larger real charmap correctly, proving the 0xF6-based formula generalizes beyond the numbers sample", () => {
    const doc = parseXgfn(loadGeorgiaFixture());
    // glyphCount (0xEA) is 27 here — proof that it is NOT the charmap size
    // (the bug this test guards against: the old glyphCount-1 formula only
    // "worked" on the numbers sample by coincidence).
    expect(doc.glyphCount).toBe(27);
    expect(doc.charmap.length).toBe(276);
    expect(doc.measurements.length).toBe(277);

    const byChar = new Map(doc.charmap.map((r) => [r.charCode, r.glyphIndex]));
    expect(byChar.get(32)).toBe(1); // space
    expect(byChar.get(0x41)).toBe(28); // 'A'
    expect(byChar.get(0x52)).toBe(45); // 'R'
    expect(byChar.get(0x44f)).toBe(238); // CYRILLIC SMALL LETTER YA (я)
    expect(byChar.get(0x20ac)).toBe(123); // EURO SIGN
  });

  it("the last measurement record is truncated exactly at the DDS boundary (not a full 36 bytes)", () => {
    const doc = parseXgfn(loadGeorgiaFixture());
    const last = doc.measurements[doc.measurements.length - 1];
    expect(last.rawBytes.length).toBe(4);
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
