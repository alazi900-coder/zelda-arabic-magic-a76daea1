import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseXgfn } from "@/lib/risen2-xgfn";
import { auditXgfnDocument, verifyDocumentSafe, formatAuditReportText } from "@/lib/risen2-xgfn-audit";
import { updateGlyphFields, deleteCharmapPair, addCharmapAlias, remapCharmapPair } from "@/lib/risen2-xgfn-edit";
import { appendArabicGlyphsToXgfn, type RenderedArabicGlyph } from "@/lib/risen2-arabic-font-gen";

function loadFixture(name: string): ArrayBuffer {
  const buf = readFileSync(join(__dirname, "fixtures", name));
  const bytes = new Uint8Array(buf.length);
  bytes.set(buf);
  return bytes.buffer;
}

function makeGlyph(codepoint: number, w = 5, h = 7, advance = 6): RenderedArabicGlyph {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = 255;
  }
  return { codepoint, width: w, height: h, rgba, advance };
}

describe("auditXgfnDocument (real fixtures)", () => {
  it("audits the original numbers font with zero errors", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const report = auditXgfnDocument(doc, { fontLabel: "numbers" });
    expect(report.errorCount).toBe(0);
    expect(report.glyphs.length).toBe(12);
    // Digits must have real ink found inside their boxes
    const digitRows = report.glyphs.filter((g) => g.charCode >= 48 && g.charCode <= 57);
    expect(digitRows.length).toBe(10);
    for (const row of digitRows) expect(row.inkBounds).not.toBeNull();
  });

  it("audits the original Georgia font with zero errors", () => {
    const doc = parseXgfn(loadFixture("risen2-georgia-font-sample.xgfn"));
    const report = auditXgfnDocument(doc, { fontLabel: "georgia" });
    expect(report.errorCount).toBe(0);
    expect(report.glyphs.length).toBe(276);
  });

  it("audits an Arabic-merged document with zero errors, and flags nothing against the original", () => {
    const original = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const merged = appendArabicGlyphsToXgfn(original, [makeGlyph(0xfe8e), makeGlyph(0x0660)]);
    const report = auditXgfnDocument(merged, { original });
    expect(report.errorCount).toBe(0);
    const arabicRow = report.glyphs.find((g) => g.charCode === 0xfe8e)!;
    expect(arabicRow.inkBounds).not.toBeNull(); // synthetic ink really landed in the atlas
  });

  it("detects a deliberately corrupted pair-count field", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const view = new DataView(doc.headerPrefix.buffer, doc.headerPrefix.byteOffset, doc.headerPrefix.byteLength);
    view.setUint32(0xf6, 99, true);
    const report = auditXgfnDocument(doc);
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.headerIssues.some((i) => i.message.includes("0xF6"))).toBe(true);
  });

  it("detects a stale 0x1C payload-size field", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const view = new DataView(doc.headerPrefix.buffer, doc.headerPrefix.byteOffset, doc.headerPrefix.byteLength);
    view.setUint32(0x1c, 12345, true);
    const report = auditXgfnDocument(doc);
    expect(report.headerIssues.some((i) => i.severity === "error" && i.message.includes("0x1C"))).toBe(true);
  });

  it("detects a glyph index pointing past the record table", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    doc.charmap[1] = { ...doc.charmap[1], glyphIndex: 500 };
    const report = auditXgfnDocument(doc);
    const row = report.glyphs[1];
    expect(row.issues.some((i) => i.severity === "error" && i.message.includes("خارج جدول"))).toBe(true);
  });

  it("detects a box that leaves the atlas bounds", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const rec = doc.measurements[2];
    const raw = rec.rawBytes.slice();
    new DataView(raw.buffer).setInt32(8, 9999, true); // x1 = 9999
    doc.measurements[2] = { rawBytes: raw, fields: (() => { const f = [...rec.fields]; f[2] = 9999; return f; })() };
    const report = auditXgfnDocument(doc);
    const row = report.glyphs.find((g) => g.glyphIndex === 2)!;
    expect(row.issues.some((i) => i.severity === "error" && i.message.includes("خارج حدود الأطلس"))).toBe(true);
  });

  it("detects modification of the untouchable 0xEA field vs the original", () => {
    const original = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const view = new DataView(doc.headerPrefix.buffer, doc.headerPrefix.byteOffset, doc.headerPrefix.byteLength);
    view.setUint32(0xea, 999, true);
    const report = auditXgfnDocument(doc, { original });
    expect(report.headerIssues.some((i) => i.severity === "error" && i.message.includes("0xEA"))).toBe(true);
  });

  it("produces a text report containing every character row", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const report = auditXgfnDocument(doc, { fontLabel: "numbers" });
    const text = formatAuditReportText(report);
    expect(text).toContain("تقرير فحص الخط");
    for (let d = 0; d <= 9; d++) expect(text).toContain(`${d} (U+003${d})`);
  });
});

describe("safe edit operations (verify-or-reject gate)", () => {
  it("updateGlyphFields applies a valid edit and returns a clean report", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const fields = [...doc.measurements[2].fields];
    fields[4] = fields[4] + 1; // widen advance by 1
    const { doc: edited, report } = updateGlyphFields(doc, 2, fields);
    expect(report.errorCount).toBe(0);
    expect(edited.measurements[2].fields[4]).toBe(fields[4]);
    // caller's doc untouched
    expect(doc.measurements[2].fields[4]).toBe(fields[4] - 1);
  });

  it("updateGlyphFields REJECTS an edit that pushes the box outside the atlas, leaving the input untouched", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const before = doc.measurements[2].fields[2];
    const fields = [...doc.measurements[2].fields];
    fields[2] = 99999; // x1 far outside the atlas
    expect(() => updateGlyphFields(doc, 2, fields)).toThrow();
    expect(doc.measurements[2].fields[2]).toBe(before);
  });

  it("deleteCharmapPair removes only the pair and keeps the record table intact", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const { doc: edited, report } = deleteCharmapPair(doc, 0x39); // '9'
    expect(report.errorCount).toBe(0);
    expect(edited.charmap.some((p) => p.charCode === 0x39)).toBe(false);
    expect(edited.measurements.length).toBe(doc.measurements.length);
    // header pair count + 0x1C were repatched
    const view = new DataView(edited.headerPrefix.buffer, edited.headerPrefix.byteOffset, edited.headerPrefix.byteLength);
    expect(view.getUint32(0xf6, true)).toBe(edited.charmap.length);
  });

  it("addCharmapAlias links a new character to an existing glyph (smart reuse, no atlas change)", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    // Map Arabic-Indic digit ٥ (0x0665) to the same glyph as '5'
    const five = doc.charmap.find((p) => p.charCode === 0x35)!;
    const { doc: edited, report } = addCharmapAlias(doc, 0x0665, five.glyphIndex);
    expect(report.errorCount).toBe(0);
    const byChar = new Map(edited.charmap.map((p) => [p.charCode, p.glyphIndex]));
    expect(byChar.get(0x0665)).toBe(five.glyphIndex);
    // atlas content byte-identical (the returned doc is re-parsed, so
    // compare content, not object identity)
    expect(edited.ddsBytes.length).toBe(doc.ddsBytes.length);
    expect(Buffer.from(edited.ddsBytes).equals(Buffer.from(doc.ddsBytes))).toBe(true);
  });

  it("addCharmapAlias refuses to shadow an existing mapping", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    expect(() => addCharmapAlias(doc, 0x35, 1)).toThrow();
  });

  it("remapCharmapPair re-points an existing character at a different glyph", () => {
    const doc = parseXgfn(loadFixture("risen2-numbers-font-sample.xgfn"));
    const zero = doc.charmap.find((p) => p.charCode === 0x30)!;
    const nine = doc.charmap.find((p) => p.charCode === 0x39)!;
    const { doc: edited, report } = remapCharmapPair(doc, 0x30, nine.glyphIndex);
    expect(report.errorCount).toBe(0);
    const byChar = new Map(edited.charmap.map((p) => [p.charCode, p.glyphIndex]));
    expect(byChar.get(0x30)).toBe(nine.glyphIndex);
    expect(zero.glyphIndex).not.toBe(nine.glyphIndex); // input untouched
  });

  it("verifyDocumentSafe round-trips a healthy document unchanged", () => {
    const doc = parseXgfn(loadFixture("risen2-georgia-font-sample.xgfn"));
    const { report } = verifyDocumentSafe(doc);
    expect(report.errorCount).toBe(0);
  });
});
