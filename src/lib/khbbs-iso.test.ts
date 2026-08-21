/** TEST: إدراج BBS داخل ISO محلياً لا يغيّر غير امتدادات BBS0–BBS3. */

import { describe, expect, it } from "vitest";
import { injectKHBbsArchivesIntoIso } from "@/lib/khbbs-iso";

const SECTOR = 2048;

if (!("arrayBuffer" in Blob.prototype)) {
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    value: function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(this);
      });
    },
  });
}

function writeU32LE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function putDirectoryRecord(bytes: Uint8Array, offset: number, name: Uint8Array, sector: number, size: number, directory = false): number {
  const pad = name.byteLength % 2 === 0 ? 1 : 0;
  const length = 33 + name.byteLength + pad;
  bytes[offset] = length;
  writeU32LE(bytes, offset + 2, sector);
  writeU32LE(bytes, offset + 10, size);
  bytes[offset + 25] = directory ? 0x02 : 0;
  bytes[offset + 32] = name.byteLength;
  bytes.set(name, offset + 33);
  return offset + length;
}

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function putDots(bytes: Uint8Array, offset: number, sector: number, size: number): number {
  let cursor = putDirectoryRecord(bytes, offset, new Uint8Array([0]), sector, size, true);
  cursor = putDirectoryRecord(bytes, cursor, new Uint8Array([1]), sector, size, true);
  return cursor;
}

function makePspIso(): { iso: Blob; original: Uint8Array; offsets: number[]; archiveSize: number } {
  const bytes = new Uint8Array(40 * SECTOR).fill(0x33);
  const archiveSize = 64;
  bytes.fill(0, 20 * SECTOR, 23 * SECTOR);
  const pvd = 16 * SECTOR;
  bytes[pvd] = 1;
  bytes.set(ascii("CD001"), pvd + 1);
  bytes[pvd + 6] = 1;
  putDirectoryRecord(bytes, pvd + 156, new Uint8Array([0]), 20, SECTOR, true);

  let root = putDots(bytes, 20 * SECTOR, 20, SECTOR);
  putDirectoryRecord(bytes, root, ascii("PSP_GAME"), 21, SECTOR, true);
  let pspGame = putDots(bytes, 21 * SECTOR, 21, SECTOR);
  putDirectoryRecord(bytes, pspGame, ascii("USRDIR"), 22, SECTOR, true);
  let usrdir = putDots(bytes, 22 * SECTOR, 22, SECTOR);
  const offsets: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const sector = 23 + index;
    usrdir = putDirectoryRecord(bytes, usrdir, ascii(`BBS${index}.DAT;1`), sector, archiveSize);
    const offset = sector * SECTOR;
    bytes.fill(0x10 + index, offset, offset + archiveSize);
    offsets.push(offset);
  }
  bytes[35 * SECTOR] = 0x7e;
  return { iso: new Blob([bytes]), original: bytes, offsets, archiveSize };
}

function makeIsoWithoutPspGame(): Blob {
  const bytes = new Uint8Array(32 * SECTOR);
  const pvd = 16 * SECTOR;
  bytes[pvd] = 1;
  bytes.set(ascii("CD001"), pvd + 1);
  bytes[pvd + 6] = 1;
  putDirectoryRecord(bytes, pvd + 156, new Uint8Array([0]), 20, SECTOR, true);
  putDots(bytes, 20 * SECTOR, 20, SECTOR);
  return new Blob([bytes]);
}

describe("injectKHBbsArchivesIntoIso", () => {
  it("يستبدل امتدادات BBS الأربعة فقط ويبقي الحجم وكل مورد آخر كما هو", async () => {
    const { iso, original, offsets, archiveSize } = makePspIso();
    const archives = new Map<number, Blob>();
    for (let index = 0; index < 4; index += 1) {
      archives.set(index, new Blob([new Uint8Array(archiveSize).fill(0xa0 + index)]));
    }

    const result = await injectKHBbsArchivesIntoIso(iso, archives);
    const output = new Uint8Array(await result.iso.arrayBuffer());
    expect(output.byteLength).toBe(original.byteLength);
    expect(result.replaced).toEqual(["BBS0.DAT", "BBS1.DAT", "BBS2.DAT", "BBS3.DAT"]);
    for (let index = 0; index < 4; index += 1) {
      expect([...output.slice(offsets[index], offsets[index] + archiveSize)]).toEqual(new Array(archiveSize).fill(0xa0 + index));
    }
    expect(output[35 * SECTOR]).toBe(0x7e);
    expect([...output.slice(0, 16 * SECTOR)]).toEqual([...original.slice(0, 16 * SECTOR)]);
  });

  it("يرفض BBS إذا اختلف حجمه عن الحجز داخل ISO", async () => {
    const { iso, archiveSize } = makePspIso();
    const archives = new Map<number, Blob>();
    for (let index = 0; index < 4; index += 1) {
      archives.set(index, new Blob([new Uint8Array(archiveSize + (index === 0 ? 1 : 0))]));
    }
    await expect(injectKHBbsArchivesIntoIso(iso, archives)).rejects.toThrow("BBS0.DAT الناتج حجمه");
  });

  it("يرفض ISO إذا غاب المسار PSP_GAME/USRDIR", async () => {
    const archives = new Map<number, Blob>();
    for (let index = 0; index < 4; index += 1) archives.set(index, new Blob([new Uint8Array(1)]));
    await expect(injectKHBbsArchivesIntoIso(makeIsoWithoutPspGame(), archives)).rejects.toThrow("PSP_GAME");
  });
});
