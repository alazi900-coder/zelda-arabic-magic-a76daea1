/**
 * The pack format, checked against bytes laid out by hand rather than by the
 * code under test -- a round trip through readPack/writePack alone would agree
 * with itself no matter what the format actually is.
 *
 * The fixture copies the shape of the real `evet` entries: a "J10.SAD" asset id
 * at kind 2, two lines at kind 1, and a record whose string needs three NULs to
 * reach a multiple of four.
 */
import { describe, expect, it } from "vitest";
import { compressLz10 } from "@/lib/fireemblem12/nds-lz";
import { looksLikeInazumaPack, readPack, writePack, type InazumaPack } from "../inazuma-pack";

function record(key: number, kind: number, text: string): Uint8Array {
  const length = 8 + Math.ceil((text.length + 1) / 4) * 4;
  const out = new Uint8Array(length);
  const view = new DataView(out.buffer);
  view.setUint16(0, key, true);
  view.setUint16(2, kind, true);
  view.setUint32(4, length, true);
  for (let i = 0; i < text.length; i++) out[8 + i] = text.charCodeAt(i);
  return out;
}

function entryPayload(records: Uint8Array[]): Uint8Array {
  const total = records.reduce((n, r) => n + r.length, 0);
  const out = new Uint8Array(4 + total);
  new DataView(out.buffer).setUint32(0, total, true);
  let at = 4;
  for (const r of records) { out.set(r, at); at += r.length; }
  return out;
}

function pack(entries: { id: number; payload: Uint8Array }[]): { pkh: Uint8Array; pkb: Uint8Array } {
  const blobs = entries.map((e) => compressLz10(e.payload));
  const pkh = new Uint8Array(0x30 + entries.length * 12);
  const view = new DataView(pkh.buffer);
  const magic = "PackNum 20080626";
  for (let i = 0; i < magic.length; i++) pkh[i] = magic.charCodeAt(i);
  view.setUint32(0x10, pkh.length, true);
  view.setUint16(0x14, 1, true);
  view.setUint16(0x16, entries.length, true);
  view.setUint32(0x18, 16, true);
  view.setUint32(0x1c, Math.ceil(Math.max(...blobs.map((b) => b.length)) / 16) * 16, true);
  const pkb = new Uint8Array(blobs.reduce((n, b) => n + b.length, 0));
  let offset = 0;
  for (let i = 0; i < entries.length; i++) {
    const at = 0x30 + i * 12;
    view.setUint32(at, entries[i].id, true);
    view.setUint32(at + 4, offset, true);
    view.setUint32(at + 8, blobs[i].length, true);
    pkb.set(blobs[i], offset);
    offset += blobs[i].length;
  }
  return { pkh, pkb };
}

const FIXTURE = pack([
  { id: 10000309, payload: entryPayload([
    record(0x04, 2, "J10.SAD"),
    record(0x0a, 1, "%s\\njoined you!"),
    record(0x33, 1, "He's always loitering somewhere\\nclose to Natsumi's room."),
  ]) },
  { id: 10000312, payload: entryPayload([record(0x01, 1, "Encount!")]) },
]);

describe("PackNum archive", () => {
  it("recognises the magic", () => {
    expect(looksLikeInazumaPack(FIXTURE.pkh)).toBe(true);
    expect(looksLikeInazumaPack(new Uint8Array(0x30))).toBe(false);
  });

  it("reads every record with its key and kind", () => {
    const parsed = readPack(FIXTURE.pkh, FIXTURE.pkb);
    expect(parsed.entries.map((e) => e.id)).toEqual([10000309, 10000312]);
    expect(parsed.entries[0].strings).toEqual([
      { key: 0x04, kind: 2, text: "J10.SAD" },
      { key: 0x0a, kind: 1, text: "%s\\njoined you!" },
      { key: 0x33, kind: 1, text: "He's always loitering somewhere\\nclose to Natsumi's room." },
    ]);
  });

  it("re-emits an untouched pack byte for byte", () => {
    // LZ10 has many valid encodings of the same bytes, so an entry that did not
    // change must be copied, not recompressed.
    const built = writePack(readPack(FIXTURE.pkh, FIXTURE.pkb));
    expect(Array.from(built.pkb)).toEqual(Array.from(FIXTURE.pkb));
    expect(Array.from(built.pkh)).toEqual(Array.from(FIXTURE.pkh));
    expect(built.grew).toBe(false);
  });

  it("carries an edited line through a rebuild", () => {
    const parsed: InazumaPack = readPack(FIXTURE.pkh, FIXTURE.pkb);
    parsed.entries[0].strings[2].text = "Short.";
    const built = writePack(parsed);
    const again = readPack(built.pkh, built.pkb);
    expect(again.entries[0].strings[2].text).toBe("Short.");
    // The records around it are untouched, including the asset id.
    expect(again.entries[0].strings[0]).toEqual({ key: 0x04, kind: 2, text: "J10.SAD" });
    expect(again.entries[1].strings[0].text).toBe("Encount!");
  });

  it("pads a record to a multiple of four with at least one NUL", () => {
    // "Four" is 4 bytes, so a record that only rounded up would have no room
    // for the terminator and would run into the next key.
    const parsed = readPack(FIXTURE.pkh, FIXTURE.pkb);
    parsed.entries[1].strings[0].text = "Four";
    const built = writePack(parsed);
    expect(readPack(built.pkh, built.pkb).entries[1].strings[0].text).toBe("Four");
  });

  it("reports growth past the size the game shipped with", () => {
    const parsed = readPack(FIXTURE.pkh, FIXTURE.pkb);
    parsed.entries[1].strings[0].text = "Encount!".padEnd(4000, " ");
    expect(writePack(parsed).grew).toBe(true);
  });

  it("keeps the padding the shipped .pkh carries past its last entry", () => {
    // evet and mcht both end four bytes after their entry table. A loader that
    // was built against that size would read past a file that came back short.
    const padded = new Uint8Array(FIXTURE.pkh.length + 4);
    padded.set(FIXTURE.pkh);
    new DataView(padded.buffer).setUint32(0x10, padded.length, true);
    const built = writePack(readPack(padded, FIXTURE.pkb));
    expect(built.pkh.length).toBe(padded.length);
    expect(Array.from(built.pkh)).toEqual(Array.from(padded));
  });

  it("refuses a character that has no byte", () => {
    const parsed = readPack(FIXTURE.pkh, FIXTURE.pkb);
    parsed.entries[1].strings[0].text = "مرحبا";
    expect(() => writePack(parsed)).toThrow(/بايت واحد/);
  });
});
