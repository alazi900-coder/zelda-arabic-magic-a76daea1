import { describe, expect, it } from "vitest";
import { buildFe12TextFile, parseFe12TextFile } from "./fe12-textfile";

/** Builds a text-file-shaped fixture by hand (independent of buildFe12TextFile),
 * so parsing is verified against bytes this test constructed itself, not
 * against the module under test's own output. */
function makeFixture(records: { text: string; key: string }[]): Uint8Array {
  const HEADER_BASE = 0x20;
  const textChunks = records.map((r) => `${r.text}\0`);
  const textOffsets: number[] = [];
  let cursor = 0;
  for (const chunk of textChunks) {
    textOffsets.push(cursor);
    cursor += chunk.length;
  }
  const textBlob = textChunks.join("");
  const padding = (4 - (textBlob.length % 4)) % 4;

  const keyChunks = records.map((r) => `${r.key}\0`);
  const keyOffsets: number[] = [];
  let keyCursor = 0;
  for (const chunk of keyChunks) {
    keyOffsets.push(keyCursor);
    keyCursor += chunk.length;
  }
  const keyBlob = keyChunks.join("");

  const tableRelOffset = textBlob.length + padding;
  const table = new Uint8Array(records.length * 8);
  const tableView = new DataView(table.buffer);
  records.forEach((_, i) => {
    tableView.setUint32(i * 8, textOffsets[i], true);
    tableView.setUint32(i * 8 + 4, keyOffsets[i], true);
  });

  const totalSize = HEADER_BASE + tableRelOffset + table.length + keyBlob.length;
  const out = new Uint8Array(totalSize);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, totalSize, true);
  outView.setUint32(4, tableRelOffset, true);
  outView.setUint32(8, 0, true);
  outView.setUint32(12, records.length, true);

  let pos = HEADER_BASE;
  for (let i = 0; i < textBlob.length; i++) out[pos + i] = textBlob.charCodeAt(i);
  pos += textBlob.length + padding;
  out.set(table, pos);
  pos += table.length;
  for (let i = 0; i < keyBlob.length; i++) out[pos + i] = keyBlob.charCodeAt(i);

  return out;
}

describe("fe12-textfile", () => {
  it("parses a hand-built fixture correctly", () => {
    const fixture = makeFixture([
      { text: "Kingdom of Grust", key: "MMH_GRUST" },
      { text: "Sirius", key: "MMH_SIRIUS" },
      { text: "Current status - Ch 2", key: "MMH_CH2" },
    ]);
    const parsed = parseFe12TextFile(fixture);
    expect(parsed.records).toHaveLength(3);
    expect(parsed.records[0].text).toBe("Kingdom of Grust");
    expect(parsed.records[0].key).toBe("MMH_GRUST");
    expect(parsed.records[1].text).toBe("Sirius");
    expect(parsed.records[2].key).toBe("MMH_CH2");
  });

  it("round-trips a no-op rebuild to byte-identical output", () => {
    const fixture = makeFixture([
      { text: "Mercenary", key: "MJID_MERCENARY" },
      { text: "Professional sellswords. Balanced in all attributes.", key: "MJHT_MERCENARY" },
      { text: "Male", key: "MSEX_M" },
      { text: "Female", key: "MSEX_F" },
    ]);
    const parsed = parseFe12TextFile(fixture);
    const rebuilt = buildFe12TextFile(parsed);
    expect(Array.from(rebuilt)).toEqual(Array.from(fixture));
  });

  it("substitutes a longer replacement and keeps every key intact", () => {
    const fixture = makeFixture([
      { text: "Mercenary", key: "MJID_MERCENARY" },
      { text: "Male", key: "MSEX_M" },
    ]);
    const parsed = parseFe12TextFile(fixture);
    const rebuilt = buildFe12TextFile(parsed, new Map([[0, "This translation is much longer than the original word"]]));
    const reparsed = parseFe12TextFile(rebuilt);
    expect(reparsed.records[0].text).toBe("This translation is much longer than the original word");
    expect(reparsed.records[0].key).toBe("MJID_MERCENARY");
    expect(reparsed.records[1].text).toBe("Male");
    expect(reparsed.records[1].key).toBe("MSEX_M");
  });

  it("substitutes a shorter replacement correctly", () => {
    const fixture = makeFixture([
      { text: "Current status - Ch 2", key: "MMH_CH2" },
      { text: "Julian and Lena", key: "MMH_JL" },
    ]);
    const parsed = parseFe12TextFile(fixture);
    const rebuilt = buildFe12TextFile(parsed, new Map([[0, "Ch2"]]));
    const reparsed = parseFe12TextFile(rebuilt);
    expect(reparsed.records[0].text).toBe("Ch2");
    expect(reparsed.records[1].text).toBe("Julian and Lena");
  });

  it("keeps records that share one original text offset pointing at the same (translated) text", () => {
    const fixture = makeFixture([
      { text: "shared", key: "K1" },
      { text: "shared", key: "K2" },
    ]);
    // Force both records to point at the same textOffset, as the real format does for duplicate strings.
    const view = new DataView(fixture.buffer);
    const tableRelOffset = view.getUint32(4, true);
    const tableAbs = 0x20 + tableRelOffset;
    const sharedOffset = view.getUint32(tableAbs, true);
    view.setUint32(tableAbs + 8, sharedOffset, true);

    const parsed = parseFe12TextFile(fixture);
    expect(parsed.records[0].textOffset).toBe(parsed.records[1].textOffset);
    const rebuilt = buildFe12TextFile(parsed, new Map([[0, "translated"]]));
    const reparsed = parseFe12TextFile(rebuilt);
    expect(reparsed.records[0].text).toBe("translated");
    expect(reparsed.records[1].text).toBe("translated");
  });

  it("throws when totalSize does not match the actual buffer length", () => {
    const fixture = makeFixture([{ text: "x", key: "K" }]);
    const corrupted = fixture.slice(0, fixture.length - 1);
    expect(() => parseFe12TextFile(corrupted)).toThrow();
  });
});
