import { describe, it, expect } from "vitest";
import { parseBdatFile } from "@/lib/bdat-parser";
import { patchBdatFile } from "@/lib/bdat-writer";

function buildLegacyWithOpaqueTail(): { fileData: Uint8Array; hiddenTailOffset: number; hiddenTailBytes: Uint8Array } {
  const encoder = new TextEncoder();
  const tableNameBytes = encoder.encode("Script_ms\0");
  const colNameBytes = encoder.encode("caption\0");
  const visibleBytes = encoder.encode("Hello\0");
  const hiddenTailBytes = encoder.encode("TAIL_KEEP\0SECRET_CMD\0");

  const headerSize = 64;
  const colInfoOffset = headerSize;
  const colNodeOffset = colInfoOffset + 4;
  const nameTableOffset = colNodeOffset + 6;
  const hashTableOffset = nameTableOffset + tableNameBytes.length + colNameBytes.length;
  const rowDataOffset = hashTableOffset + 16;
  const rowLength = 4;
  const stringTableOffset = rowDataOffset + rowLength;
  const hiddenTailOffset = stringTableOffset + visibleBytes.length;
  const stringTableLength = visibleBytes.length + hiddenTailBytes.length;
  const tableSize = stringTableOffset + stringTableLength;

  const tableData = new Uint8Array(tableSize);
  const view = new DataView(tableData.buffer);

  tableData.set([0x42, 0x44, 0x41, 0x54], 0);
  view.setUint16(0x06, nameTableOffset, true);
  view.setUint16(0x08, rowLength, true);
  view.setUint16(0x0A, hashTableOffset, true);
  view.setUint16(0x0C, 4, true);
  view.setUint16(0x0E, rowDataOffset, true);
  view.setUint16(0x10, 1, true);
  view.setUint16(0x18, stringTableOffset, true);
  view.setUint32(0x18, stringTableOffset, true);
  view.setUint32(0x1C, stringTableLength, true);
  view.setUint16(0x20, colNodeOffset, true);
  view.setUint16(0x22, 1, true);

  tableData[colInfoOffset] = 1;
  tableData[colInfoOffset + 1] = 7;
  view.setUint16(colInfoOffset + 2, 0, true);

  view.setUint16(colNodeOffset, colInfoOffset, true);
  view.setUint16(colNodeOffset + 2, 0, true);
  view.setUint16(colNodeOffset + 4, nameTableOffset + tableNameBytes.length, true);

  tableData.set(tableNameBytes, nameTableOffset);
  tableData.set(colNameBytes, nameTableOffset + tableNameBytes.length);
  view.setUint32(rowDataOffset, stringTableOffset, true);
  tableData.set(visibleBytes, stringTableOffset);
  tableData.set(hiddenTailBytes, hiddenTailOffset);

  const fileData = new Uint8Array(8 + tableData.length);
  const fileView = new DataView(fileData.buffer);
  fileView.setUint32(0, 1, true);
  fileView.setUint32(4, 8, true);
  fileData.set(tableData, 8);

  return { fileData, hiddenTailOffset, hiddenTailBytes };
}

describe("Legacy BDAT keeps opaque tail data", () => {
  it("preserves unreferenced legacy string bytes while appending translated text", () => {
    const { fileData, hiddenTailOffset, hiddenTailBytes } = buildLegacyWithOpaqueTail();
    const parsed = parseBdatFile(fileData);

    const translations = new Map<string, string>();
    translations.set("Script_ms:0:caption", "مرحبا بالعالم");

    const result = patchBdatFile(parsed, translations);
    expect(result.patchedCount).toBe(1);
    expect(result.overflowErrors).toHaveLength(0);

    const tableOffset = new DataView(result.result.buffer).getUint32(4, true);
    const patchedTable = result.result.slice(tableOffset);
    expect(Array.from(
      patchedTable.slice(hiddenTailOffset, hiddenTailOffset + hiddenTailBytes.length)
    )).toEqual(Array.from(hiddenTailBytes));

    const reparsed = parseBdatFile(result.result);
    expect(reparsed.tables[0].rows[0].values["caption"]).toBe("مرحبا بالعالم");
    expect(reparsed.tables[0]._raw.stringTableLength).toBeGreaterThan(parsed.tables[0]._raw.stringTableLength);
  });
});