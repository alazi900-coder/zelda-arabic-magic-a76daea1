import { describe, it, expect } from "vitest";
import { parseP00, findAllTab0Offsets } from "@/lib/risen-tab0-parser";
import { rebuildP00, makeKey } from "@/lib/risen-tab0-writer";
import { extractEntriesFromP00 } from "@/lib/risen-extractor";

const enc = (s: string): Uint8Array => {
  const buf = new Uint8Array(s.length * 2);
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < s.length; i++) dv.setUint16(i * 2, s.charCodeAt(i), true);
  return buf;
};

const buildTab0 = (fields: { name: string; values: string[] }[]): Uint8Array => {
  const parts: Uint8Array[] = [];
  parts.push(new Uint8Array([0x54, 0x41, 0x42, 0x30])); // TAB0
  const header = new Uint8Array(16);
  new DataView(header.buffer).setUint16(0, 1, true);
  new DataView(header.buffer).setUint16(2, 1, true);
  new DataView(header.buffer).setBigInt64(4, 0n, true);
  new DataView(header.buffer).setUint32(12, fields.length, true);
  parts.push(header);
  for (const field of fields) {
    const fh = new Uint8Array(5);
    fh[0] = 1;
    new DataView(fh.buffer).setUint16(1, 1, true);
    new DataView(fh.buffer).setUint16(3, field.name.length, true);
    parts.push(fh);
    parts.push(enc(field.name));
    const rc = new Uint8Array(4);
    new DataView(rc.buffer).setUint32(0, field.values.length, true);
    parts.push(rc);
    for (const v of field.values) {
      const sl = new Uint8Array(2);
      new DataView(sl.buffer).setUint16(0, v.length, true);
      parts.push(sl);
      parts.push(enc(v));
    }
  }
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** Wrap one or more pre-built TAB0 table byte blocks into a minimal strings.p00-shaped file. */
function wrapAsFile(tables: Uint8Array[]): ArrayBuffer {
  const preHeader = new Uint8Array(16);
  const trailer = new Uint8Array(32);
  const offsets: number[] = [];
  let cursor = preHeader.length;
  for (const t of tables) {
    offsets.push(cursor);
    cursor += t.length;
  }
  const trailerOff = cursor;
  const totalSize = trailerOff + trailer.length;
  new DataView(preHeader.buffer).setUint32(4, totalSize, true);

  const out = new Uint8Array(totalSize);
  out.set(preHeader, 0);
  for (let i = 0; i < tables.length; i++) out.set(tables[i], offsets[i]);
  out.set(trailer, trailerOff);
  return out.buffer;
}

/**
 * Build a synthetic strings.p00-like buffer with:
 *   - 16-byte pre-header (arbitrary bytes, but includes total_size at offset 4)
 *   - 2 TAB0 tables back-to-back
 *   - 32-byte trailer that includes each table's offset (mimics FileInfoHdr)
 */
function buildSynthetic(): { buffer: ArrayBuffer; totalSizeOffset: number } {
  const table1 = buildTab0([
    { name: "ID", values: ["Q1", "Q2"] },
    { name: "English_Text", values: ["Hello world", "Second quest"] },
    { name: "German_Text", values: ["Hallo Welt", "Zweite Quest"] },
  ]);
  const table2 = buildTab0([
    { name: "ID", values: ["I1"] },
    { name: "English_Text", values: ["Dialog line"] },
    { name: "Owner", values: ["Vince"] },
  ]);

  const preHeader = new Uint8Array(16);
  const trailer = new Uint8Array(32);

  const preLen = preHeader.length;
  const t1Off = preLen;
  const t2Off = t1Off + table1.length;
  const trailerOff = t2Off + table2.length;
  const totalSize = trailerOff + trailer.length;

  // Encode total_size at preHeader offset 4 (u32 LE)
  new DataView(preHeader.buffer).setUint32(4, totalSize, true);
  // Encode table offsets in trailer to test offset remap
  new DataView(trailer.buffer).setUint32(0, t1Off, true);
  new DataView(trailer.buffer).setUint32(4, t2Off, true);
  new DataView(trailer.buffer).setUint32(8, totalSize, true);

  const out = new Uint8Array(totalSize);
  out.set(preHeader, 0);
  out.set(table1, t1Off);
  out.set(table2, t2Off);
  out.set(trailer, trailerOff);

  return { buffer: out.buffer, totalSizeOffset: 4 };
}

describe("Risen TAB0 parser", () => {
  it("finds all TAB0 signatures in a synthetic buffer", () => {
    const { buffer } = buildSynthetic();
    const offsets = findAllTab0Offsets(buffer);
    expect(offsets.length).toBe(2);
  });

  it("parses table structure exactly", () => {
    const { buffer } = buildSynthetic();
    const parsed = parseP00(buffer);
    expect(parsed.tables.length).toBe(2);
    expect(parsed.tables[0].fields.length).toBe(3);
    expect(parsed.tables[0].fields[1].name).toBe("English_Text");
    expect(parsed.tables[0].fields[1].values).toEqual(["Hello world", "Second quest"]);
    expect(parsed.tables[1].fields[2].name).toBe("Owner");
  });

  it("has zero gap between tables (adjacent)", () => {
    const { buffer } = buildSynthetic();
    const parsed = parseP00(buffer);
    expect(parsed.tables[0].endOffset).toBe(parsed.tables[1].offset);
  });
});

describe("Risen TAB0 rebuild roundtrip", () => {
  it("rebuild without changes preserves total size", () => {
    const { buffer } = buildSynthetic();
    const result = rebuildP00(buffer, new Map());
    expect(result.newSize).toBe(result.originalSize);
    // reparse must succeed
    const reparsed = parseP00(result.buffer);
    expect(reparsed.tables.length).toBe(2);
    expect(reparsed.tables[0].fields[1].values[0]).toBe("Hello world");
  });

  it("rebuild with Arabic overwrite changes size and preserves other rows", () => {
    const { buffer } = buildSynthetic();
    const parsed = parseP00(buffer);
    const t1 = parsed.tables[0].name; // will be named per guessTableName with 2 tables → falls back
    const t2 = parsed.tables[1].name;
    const translations = new Map<string, string>();
    translations.set(makeKey(t1, "English_Text", 0), "مرحبا بالعالم"); // 12 chars vs 11 chars
    translations.set(makeKey(t2, "English_Text", 0), "سطر حوار"); // 8 chars vs 11 chars

    const result = rebuildP00(buffer, translations);
    // sizeDelta should be non-zero
    expect(result.sizeDelta).not.toBe(0);

    const reparsed = parseP00(result.buffer);
    expect(reparsed.tables[0].fields[1].values[0]).toBe("مرحبا بالعالم");
    // untouched row preserved
    expect(reparsed.tables[0].fields[1].values[1]).toBe("Second quest");
    expect(reparsed.tables[1].fields[1].values[0]).toBe("سطر حوار");
    // context field preserved
    expect(reparsed.tables[1].fields[2].values[0]).toBe("Vince");
  });

  it("patches trailer offset references when tables shift", () => {
    const { buffer } = buildSynthetic();
    const parsed = parseP00(buffer);
    const t1 = parsed.tables[0].name;
    const oldT2Offset = parsed.tables[1].offset;

    const translations = new Map<string, string>();
    // Grow first row by 10 chars → all subsequent table offsets shift by 20 bytes
    translations.set(makeKey(t1, "English_Text", 0), "Hello world" + "!".repeat(10));

    const result = rebuildP00(buffer, translations);
    expect(result.offsetRemap.length).toBeGreaterThan(0);

    // Verify the trailer's old t2 offset was patched to new one
    const reparsed = parseP00(result.buffer);
    const newT2Offset = reparsed.tables[1].offset;
    expect(newT2Offset).not.toBe(oldT2Offset);
    // The old value should no longer appear as a u32 in the trailer
    const outView = new DataView(result.buffer);
    const trailerStart = reparsed.trailerOffset;
    let foundOld = false;
    for (let i = trailerStart; i <= result.newSize - 4; i++) {
      if (outView.getUint32(i, true) === oldT2Offset) { foundOld = true; break; }
    }
    expect(foundOld).toBe(false);
    // And the new offset should appear at the same slot
    expect(outView.getUint32(trailerStart + 4, true)).toBe(newT2Offset);
  });
});

describe("Risen per-row source-language fallback", () => {
  it("falls back to German_Text for a row whose English_Text is empty, without dropping the row", () => {
    const table = buildTab0([
      { name: "ID", values: ["Q1", "Q2"] },
      { name: "English_Text", values: ["Hello world", ""] },
      { name: "German_Text", values: ["Hallo Welt", "Nur auf Deutsch"] },
    ]);
    const buffer = wrapAsFile([table]);

    const result = extractEntriesFromP00(buffer);
    expect(result.entries.length).toBe(2);
    expect(result.entries[0].original).toBe("Hello world");
    // Row 2 has no English text — must fall back to German instead of being dropped.
    expect(result.entries[1].original).toBe("Nur auf Deutsch");
  });

  it("drops a row only when every language variant is empty", () => {
    const table = buildTab0([
      { name: "ID", values: ["Q1"] },
      { name: "English_Text", values: [""] },
      { name: "German_Text", values: [""] },
    ]);
    const buffer = wrapAsFile([table]);

    const result = extractEntriesFromP00(buffer);
    expect(result.entries.length).toBe(0);
  });
});

describe("Risen TAB0 false-positive signature rejection", () => {
  it("rejects a coincidental TAB0 byte sequence inside string data without throwing or misidentifying it as a table", () => {
    // Two UTF-16 code units whose LE bytes are exactly 0x54 0x41 0x42 0x30 ("TAB0"),
    // embedded in the middle of ordinary string content (not at a real table boundary).
    const fakeMagic = String.fromCharCode(0x4154, 0x3042);
    const table = buildTab0([
      { name: "ID", values: ["Q1"] },
      { name: "English_Text", values: ["Before " + fakeMagic + " and some trailing padding text"] },
    ]);
    const buffer = wrapAsFile([table]);

    // Sanity check: the raw byte scan does find the coincidental match (plus the real header).
    const rawOffsets = findAllTab0Offsets(buffer);
    expect(rawOffsets.length).toBeGreaterThan(1);

    expect(() => parseP00(buffer)).not.toThrow();
    const parsed = parseP00(buffer);
    // Only the real table should be recognized — the coincidental match must be rejected.
    expect(parsed.tables.length).toBe(1);
    expect(parsed.tables[0].fields[1].values[0]).toContain(fakeMagic);
  });
});
