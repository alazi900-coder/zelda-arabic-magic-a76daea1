import { describe, expect, it } from "vitest";
import { analyzeKHBBSCTDText, buildCTD, encodeKHBBSCTDTextForAudit, parseCTD } from "./khbbs-ctd";

function createShiftJisFixture(): Uint8Array {
  const japanese = Uint8Array.from([0x83, 0x5f, 0x83, 0x7e, 0x81, 0x5b, 0x81, 0x46, 0x82, 0x68, 0x82, 0x63, 0x00]);
  const command = Uint8Array.from([0x4c, 0x65, 0x61, 0x72, 0x6e, 0x65, 0x64, 0x20, 0xf2, 0xf6, 0x24, 0x73, 0x21, 0x21, 0x00]);
  const stringDataOffset = 0x40;
  const bytes = new Uint8Array(stringDataOffset + japanese.length + command.length);
  bytes.set([0x40, 0x43, 0x54, 0x44]); // @CTD
  const view = new DataView(bytes.buffer);
  view.setUint32(0x04, 1, true);
  view.setUint16(0x0e, 2, true);
  view.setUint32(0x10, 0x20, true);
  view.setUint32(0x18, stringDataOffset, true);
  view.setUint32(0x20, 1, true);
  view.setUint32(0x24, stringDataOffset, true);
  view.setUint32(0x2c, 2, true);
  view.setUint32(0x30, stringDataOffset + japanese.length, true);
  bytes.set(japanese, stringDataOffset);
  bytes.set(command, stringDataOffset + japanese.length);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

describe("KHBBS CTD Shift-JIS reader", () => {
  it("renders Shift-JIS text as text and keeps F2 commands as one protected token", () => {
    const document = parseCTD(toArrayBuffer(createShiftJisFixture()));

    expect(document.entries[0].text).toBe("ダミー：ＩＤ");
    expect(document.entries[0].text).not.toContain("[CTD:");
    expect(document.entries[1].text).toBe("Learned [CTD:F2 F6]$s!!");
    expect(Array.from(document.entries[1].rawControlBytes)).toEqual([0xf2, 0xf6]);
  });

  it("preserves an unchanged Shift-JIS entry while another CTD entry is rebuilt", () => {
    const document = parseCTD(toArrayBuffer(createShiftJisFixture()));
    const entries = document.entries.map((entry) => ({ ...entry }));
    entries[1].translation = "Changed [CTD:F2 F6]";

    const rebuilt = buildCTD(document, entries);
    const reparsed = parseCTD(toArrayBuffer(rebuilt));

    expect(reparsed.entries[0].text).toBe("ダミー：ＩＤ");
    expect(Array.from(reparsed.entries[0].rawTextBytes)).toEqual([0x83, 0x5f, 0x83, 0x7e, 0x81, 0x5b, 0x81, 0x46, 0x82, 0x68, 0x82, 0x63]);
    expect(reparsed.entries[1].text).toBe("Changed [CTD:F2 F6]");
  });

  it("builds the verified English Shift-JIS symbols without marking them unsupported", () => {
    const symbols = "―∥±×　－｜";

    expect(analyzeKHBBSCTDText(symbols).unsupported).toEqual([]);
    expect(Array.from(encodeKHBBSCTDTextForAudit(symbols))).toEqual([
      0x81, 0x5c, 0x81, 0x61, 0x81, 0x7d, 0x81, 0x7e,
      0x81, 0x40, 0x81, 0x7c, 0x81, 0x62,
    ]);

    const document = parseCTD(toArrayBuffer(createShiftJisFixture()));
    const entries = document.entries.map((entry) => ({ ...entry }));
    entries[1].translation = `English ${symbols} [CTD:F2 F6]`;
    const rebuilt = buildCTD(document, entries);

    expect(parseCTD(toArrayBuffer(rebuilt)).entries[1].text).toBe(`English ${symbols} [CTD:F2 F6]`);
  });
});
