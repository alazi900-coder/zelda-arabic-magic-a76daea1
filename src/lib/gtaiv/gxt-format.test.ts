import { describe, expect, it } from "vitest";
import { inspectGtaIvGxt, inspectGtaIvOxt } from "./gxt-format";

function makeGxt(): ArrayBuffer {
  const bytes = new Uint8Array(72);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 4, true);
  view.setUint16(2, 16, true);
  bytes.set([0x54, 0x41, 0x42, 0x4c], 4); // TABL
  view.setUint32(8, 12, true);
  bytes.set([0x4d, 0x41, 0x49, 0x4e], 12); // MAIN
  view.setUint32(20, 24, true);
  bytes.set([0x54, 0x4b, 0x45, 0x59], 24); // TKEY
  view.setUint32(28, 8, true);
  view.setUint32(32, 0, true);
  view.setUint32(36, 0x12345678, true);
  bytes.set([0x54, 0x44, 0x41, 0x54], 40); // TDAT
  view.setUint32(44, 6, true);
  bytes.set([0x48, 0x00, 0x69, 0x00, 0x00, 0x00], 48);
  return bytes.buffer;
}

describe("GTA IV GXT/OXT structural reader", () => {
  it("reads a Version 4, CharSize 16 GXT table without decoding its glyph map", () => {
    const summary = inspectGtaIvGxt(makeGxt());
    expect(summary).toMatchObject({ version: 4, charSize: 16, entries: 1 });
    expect(summary.tables[0]).toMatchObject({ name: "MAIN", entries: 1, textBytes: 6 });
  });

  it("rejects a malformed GXT header before reading any table", () => {
    const malformed = makeGxt().slice(0);
    new DataView(malformed).setUint16(2, 8, true);
    expect(() => inspectGtaIvGxt(malformed)).toThrow("CharSize 8");
  });

  it("reads the OXT header and only counts its editable export structure", () => {
    const oxt = "Version 4\nCharSize 16\nNeedDecode False\nSingleFileTable False\nMAIN\n{\n\t0x12345678=Hi\n}\n";
    expect(inspectGtaIvOxt(oxt)).toMatchObject({ version: 4, charSize: 16, tables: 1, entries: 1 });
  });
});
