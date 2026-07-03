import { describe, it, expect } from "vitest";
import { parseRisenP00Full, buildRisenP00, applyTranslations, makeKey } from "@/lib/risen-p00";
import { extractEntriesFromP00 } from "@/lib/risen-extractor";

/**
 * Synthetic strings.p00-shaped file builder, matching the confirmed real binary
 * layout byte-for-byte (verified against an actual 19MB Risen 1 strings.p00 —
 * see risen-p00.ts docblock):
 *   - 48-byte main header: version(u32) + "G3V0" + unk1(i64) + unk2(i64)
 *     + dataAddress(i64)=0x30 + offsetToFileInfo(i64) + totalSize(i64)
 *   - N TAB0 tables back-to-back starting at 0x30
 *   - 32-byte reserved trailer (copied verbatim, content irrelevant)
 *   - FileInfoHdr: count(u32) + per-table entries (name, offset, timestamps, sizes)
 */
const enc = (s: string): Uint8Array => {
  const buf = new Uint8Array(s.length * 2);
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < s.length; i++) dv.setUint16(i * 2, s.charCodeAt(i), true);
  return buf;
};

interface FieldSpec { name: string; values: string[] }

const buildTab0 = (fields: FieldSpec[]): Uint8Array => {
  const parts: Uint8Array[] = [];
  parts.push(new Uint8Array([0x54, 0x41, 0x42, 0x30])); // "TAB0"
  const header = new Uint8Array(16);
  new DataView(header.buffer).setUint16(0, 1, true); // version major
  new DataView(header.buffer).setUint16(2, 1, true); // version minor
  new DataView(header.buffer).setBigInt64(4, 0n, true); // timestamp
  new DataView(header.buffer).setUint32(12, fields.length, true);
  parts.push(header);
  for (const field of fields) {
    const fh = new Uint8Array(5);
    fh[0] = 1; // flag
    new DataView(fh.buffer).setUint16(1, 1, true); // unk
    new DataView(fh.buffer).setUint16(3, field.name.length, true); // name_len
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

/** Wrap TAB0 table byte blocks + real names into a full strings.p00-shaped file. */
function wrapAsFile(tables: Uint8Array[], names: string[]): ArrayBuffer {
  const HEADER_SIZE = 48;
  const reservedTrailer = new Uint8Array(32);

  const tableOffsets: number[] = [];
  let cursor = HEADER_SIZE;
  for (const t of tables) {
    tableOffsets.push(cursor);
    cursor += t.length;
  }
  const dataEnd = cursor;
  const fileInfoOffset = dataEnd + reservedTrailer.length;

  const entryBytesList = names.map((name, i) => {
    const nameBytes = new TextEncoder().encode(name);
    const size = 2 + 2 + 4 + nameBytes.length + 1 + 8 + 24 + 4 + 4 + 4 + 4 + 4;
    const buf = new Uint8Array(size);
    const dv = new DataView(buf.buffer);
    let p = 0;
    dv.setUint16(p, 32, true); p += 2; // marker1
    dv.setUint16(p, 2, true); p += 2; // marker2
    dv.setUint32(p, nameBytes.length, true); p += 4;
    buf.set(nameBytes, p); p += nameBytes.length;
    buf[p] = 0; p += 1; // pad
    dv.setBigInt64(p, BigInt(tableOffsets[i]), true); p += 8; // offset
    dv.setBigInt64(p, 0n, true); p += 8; // timestamp1
    dv.setBigInt64(p, 0n, true); p += 8; // timestamp2
    dv.setBigInt64(p, 0n, true); p += 8; // timestamp3
    dv.setUint32(p, 131104, true); p += 4; // marker2_field
    dv.setUint32(p, 0, true); p += 4; // zero1
    dv.setUint32(p, 0, true); p += 4; // zero2
    dv.setUint32(p, tables[i].length, true); p += 4; // size1
    dv.setUint32(p, tables[i].length, true); p += 4; // size2
    return buf;
  });

  let fileInfoSize = 4;
  for (const e of entryBytesList) fileInfoSize += e.length;
  const totalSize = fileInfoOffset + fileInfoSize;

  const out = new Uint8Array(totalSize);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 1, true); // headerVersion
  out.set(new TextEncoder().encode("G3V0"), 4);
  outView.setBigInt64(0x08, 0n, true);
  outView.setBigInt64(0x10, 0n, true);
  outView.setBigInt64(0x18, 0x30n, true); // dataAddress
  outView.setBigInt64(0x20, BigInt(fileInfoOffset - 0x20), true);
  outView.setBigInt64(0x28, BigInt(totalSize), true);

  for (let i = 0; i < tables.length; i++) out.set(tables[i], tableOffsets[i]);
  out.set(reservedTrailer, dataEnd);

  let p = fileInfoOffset;
  outView.setUint32(p, entryBytesList.length, true); p += 4;
  for (const e of entryBytesList) { out.set(e, p); p += e.length; }

  return out.buffer;
}

function buildSynthetic(): ArrayBuffer {
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
  return wrapAsFile([table1, table2], ["quests.tab", "infos.tab"]);
}

describe("Risen full-fidelity parser", () => {
  it("parses table structure exactly, with real names from FileInfoHdr", () => {
    const buffer = buildSynthetic();
    const doc = parseRisenP00Full(buffer);
    expect(doc.tables.length).toBe(2);
    expect(doc.tables[0].name).toBe("quests.tab");
    expect(doc.tables[1].name).toBe("infos.tab");
    expect(doc.tables[0].fields.length).toBe(3);
    expect(doc.tables[0].fields[1].name).toBe("English_Text");
    expect(doc.tables[0].fields[1].values).toEqual(["Hello world", "Second quest"]);
    expect(doc.tables[1].fields[2].name).toBe("Owner");
  });
});

describe("Risen full-fidelity rebuild roundtrip", () => {
  it("rebuild without changes reproduces the file byte-for-byte", () => {
    const buffer = buildSynthetic();
    const doc = parseRisenP00Full(buffer);
    const rebuilt = buildRisenP00(doc);
    expect(new Uint8Array(rebuilt)).toEqual(new Uint8Array(buffer));
  });

  it("rebuild with Arabic overwrite changes size and preserves other rows", () => {
    const buffer = buildSynthetic();
    const doc = parseRisenP00Full(buffer);
    const translations = new Map<string, string>();
    translations.set(makeKey("quests.tab", "English_Text", 0), "مرحبا بالعالم");
    translations.set(makeKey("infos.tab", "English_Text", 0), "سطر حوار");

    applyTranslations(doc, translations);
    const rebuilt = buildRisenP00(doc);
    expect(rebuilt.byteLength).not.toBe(buffer.byteLength);

    const reparsed = parseRisenP00Full(rebuilt);
    expect(reparsed.tables[0].fields[1].values[0]).toBe("مرحبا بالعالم");
    // untouched row preserved
    expect(reparsed.tables[0].fields[1].values[1]).toBe("Second quest");
    expect(reparsed.tables[1].fields[1].values[0]).toBe("سطر حوار");
    // context field preserved
    expect(reparsed.tables[1].fields[2].values[0]).toBe("Vince");
  });

  it("recomputes table offsets and FileInfoHdr sizes deterministically when tables shift", () => {
    const buffer = buildSynthetic();
    const doc = parseRisenP00Full(buffer);
    const oldT2Offset = doc.tables[1].originalOffset;

    const translations = new Map<string, string>();
    // Grow first row by 10 chars → table 1 grows, table 2's offset must shift.
    translations.set(makeKey("quests.tab", "English_Text", 0), "Hello world" + "!".repeat(10));
    applyTranslations(doc, translations);

    const rebuilt = buildRisenP00(doc);
    const reparsed = parseRisenP00Full(rebuilt);
    const newT2Offset = reparsed.tables[1].originalOffset;

    expect(newT2Offset).not.toBe(oldT2Offset);
    // Deterministic rebuild: no stale offset bytes anywhere — reparsing must
    // recover the exact new offset (there is no heuristic search-and-replace
    // step at all, so there is nothing to leave stale).
    expect(reparsed.fileInfoEntries.length).toBe(2);
    expect(reparsed.tables[1].name).toBe("infos.tab");
  });
});

describe("Risen per-row source-language fallback", () => {
  it("falls back to German_Text for a row whose English_Text is empty, without dropping the row", () => {
    const table = buildTab0([
      { name: "ID", values: ["Q1", "Q2"] },
      { name: "English_Text", values: ["Hello world", ""] },
      { name: "German_Text", values: ["Hallo Welt", "Nur auf Deutsch"] },
    ]);
    const buffer = wrapAsFile([table], ["quests.tab"]);

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
    const buffer = wrapAsFile([table], ["quests.tab"]);

    const result = extractEntriesFromP00(buffer);
    expect(result.entries.length).toBe(0);
  });

  it("resolves fallback correctly with a German_StageDir field between language columns (matches real file layout)", () => {
    const table = buildTab0([
      { name: "ID", values: ["I1", "I2"] },
      { name: "German_Text", values: ["Hallo", "Nur Deutsch"] },
      { name: "German_StageDir", values: ["(lacht)", ""] },
      { name: "English_Text", values: ["Hello", ""] },
      { name: "Owner", values: ["Vince", "Vince"] },
    ]);
    const buffer = wrapAsFile([table], ["infos.tab"]);

    const result = extractEntriesFromP00(buffer);
    expect(result.entries.length).toBe(2);
    expect(result.entries[0].original).toBe("Hello");
    expect(result.entries[1].original).toBe("Nur Deutsch");
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
    const buffer = wrapAsFile([table], ["quests.tab"]);

    expect(() => parseRisenP00Full(buffer)).not.toThrow();
    const doc = parseRisenP00Full(buffer);
    // Only the real table should be recognized — the coincidental match must be rejected.
    expect(doc.tables.length).toBe(1);
    expect(doc.tables[0].fields[1].values[0]).toContain(fakeMagic);
  });
});
