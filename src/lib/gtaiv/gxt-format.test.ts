import { describe, expect, it } from "vitest";
import {
  gtaIvHashKey,
  inspectGtaIvGxt,
  inspectGtaIvOxt,
  parseGtaIvGxt,
  parseGtaIvOxt,
  rebuildGtaIvGxt,
  reconcileGtaIvOxtWithGxt,
  validateGtaIvRuntimeTokenSequence,
} from "./gxt-format";

function makeGxt(crc = 0x12345678): ArrayBuffer {
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
  view.setUint32(36, crc, true);
  bytes.set([0x54, 0x44, 0x41, 0x54], 40); // TDAT
  view.setUint32(44, 6, true);
  bytes.set([0x48, 0x00, 0x69, 0x00, 0x00, 0x00], 48);
  return bytes.buffer;
}

describe("GTA IV GXT/OXT structural reader", () => {
  it("reads a Version 4, CharSize 16 GXT table and retains raw text units", () => {
    const summary = inspectGtaIvGxt(makeGxt());
    const parsed = parseGtaIvGxt(makeGxt());
    expect(summary).toMatchObject({ version: 4, charSize: 16, entries: 1 });
    expect(summary.tables[0]).toMatchObject({ name: "MAIN", entries: 1, textBytes: 6 });
    expect(Array.from(parsed.tables[0].entries[0].textUnits)).toEqual([0x48, 0x69]);
    expect(parsed.tables[0].entries[0].crc).toBe(0x12345678);
  });

  it("rejects a malformed GXT header before reading any table", () => {
    const malformed = makeGxt().slice(0);
    new DataView(malformed).setUint16(2, 8, true);
    expect(() => inspectGtaIvGxt(malformed)).toThrow("CharSize 8");
  });

  it("uses the documented GTA IV key identity algorithm for known OXT keys", () => {
    expect(gtaIvHashKey("T182_645")).toBe(0x00009b22);
    expect(gtaIvHashKey('"T182_645"')).toBe(0x00009b22);
    expect(gtaIvHashKey("SOME\\KEY")).toBe(gtaIvHashKey("some/key"));
  });

  it("parses named and numeric OXT keys while preserving values after the first equals sign", () => {
    const oxt = "Version 4\nCharSize 16\nNeedDecode False\nSingleFileTable False\nMAIN\n{\n\tT182_645 =Hi=a\n\t0x12345678 =\u01EA\u01A4\n}\n";
    const parsed = parseGtaIvOxt(oxt);
    expect(inspectGtaIvOxt(oxt)).toMatchObject({ version: 4, charSize: 16, tables: 1, entries: 2 });
    expect(parsed.tables[0].entries[0]).toMatchObject({ key: "T182_645", keyKind: "named", crc: 0x00009b22, value: "Hi=a" });
    expect(Array.from(parsed.tables[0].entries[1].textUnits)).toEqual([0x01ea, 0x01a4]);
  });

  it("reconciles OXT rows by table and CRC, not by duplicate text content", () => {
    const gxt = parseGtaIvGxt(makeGxt(0x00009b22));
    const oxt = parseGtaIvOxt("Version 4\nCharSize 16\nNeedDecode False\nSingleFileTable False\nMAIN\n{\n\tT182_645 =Hi\n}\n");
    const identities = reconcileGtaIvOxtWithGxt(gxt, oxt);
    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatchObject({ table: "MAIN", key: "T182_645", crc: 0x00009b22 });
    expect(identities[0].gxtEntry).not.toBeNull();
  });

  it("returns a byte-identical GXT when no replacement is requested", () => {
    const source = makeGxt(0x00009b22);
    expect(Array.from(new Uint8Array(rebuildGtaIvGxt(source)))).toEqual(Array.from(new Uint8Array(source)));
  });

  it("rebuilds TDAT offsets while preserving CRC and rejects changed runtime tokens", () => {
    const source = makeGxt(0x00009b22);
    const rebuilt = rebuildGtaIvGxt(source, [{ table: "MAIN", crc: 0x00009b22, textUnits: new Uint16Array([0x41, 0x42, 0x43]) }]);
    const parsed = parseGtaIvGxt(rebuilt);
    expect(parsed.tables[0].entries[0].crc).toBe(0x00009b22);
    expect(Array.from(parsed.tables[0].entries[0].textUnits)).toEqual([0x41, 0x42, 0x43]);

    const protectedSource = makeGxt(0x00009b22);
    const sourceView = new DataView(protectedSource);
    sourceView.setUint32(44, 10, true);
    new Uint8Array(protectedSource).set([0x7e, 0x00, 0x6e, 0x00, 0x7e, 0x00, 0x00, 0x00, 0x00, 0x00], 48);
    expect(() => rebuildGtaIvGxt(protectedSource, [{ table: "MAIN", crc: 0x00009b22, textUnits: new Uint16Array([0x41]) }])).toThrow("رموز وقت التشغيل غير محفوظة");
  });

  it("requires exact ordered GTA IV runtime tokens and rejects a lone tilde", () => {
    expect(validateGtaIvRuntimeTokenSequence("~x~ Hello ~n~~z~", "~x~ نص ~n~~z~")).toMatchObject({ valid: true });
    expect(validateGtaIvRuntimeTokenSequence("~x~ Hello ~n~~z~", "~x~ نص ~z~~n~")).toMatchObject({ valid: false });
    expect(validateGtaIvRuntimeTokenSequence("Hello", "نص ~")).toMatchObject({ valid: false });
  });

});
