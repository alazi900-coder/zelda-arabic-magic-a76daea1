/**
 * TEST: بناء Kingdom Hearts يخرج BBS0–BBS3 كاملة؛ لا يتغير خارج المورد المحدد.
 */

import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildKHBbsDatOutput,
  clearKHBbsBbsWorkspace,
  makeKHBbsResourceReference,
  setKHBbsBbsWorkspace,
  setKHBbsFontReplacement,
} from "@/lib/khbbs-bbs-workspace";
import type { BbsArchiveEntry, BbsArchiveIndex } from "@/lib/khbbs-bbsa";

const SECTOR = 0x800;

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

function makeFile(name: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/octet-stream" });
}

function makeWorkspace(includeBbs3 = true): { archive: BbsArchiveIndex; ctd: BbsArchiveEntry; font: BbsArchiveEntry; originals: Map<number, number[]> } {
  const originals = new Map<number, number[]>([
    [0, [0x10, 0x11, 0x12, 0x13, 0x20, 0x21, 0x22, 0x23]],
    [1, [0x30, 0x31, 0x32, 0x33]],
    [2, [0x40, 0x41, 0x42, 0x43]],
    [3, [0x50, 0x51, 0x52, 0x53]],
  ]);
  const archives = new Map<number, File>();
  for (const [index, bytes] of originals) {
    if (index === 3 && !includeBbs3) continue;
    archives.set(index, makeFile(`BBS${index}.DAT`, bytes));
  }
  const ctd: BbsArchiveEntry = {
    id: "bbs0-test-ctd",
    archiveIndex: 0,
    sourceArchiveName: "BBS0.DAT",
    directory: "test",
    directoryHash: 0,
    fileHash: 0,
    directoryTableIndex: 0,
    infoTableOffset: 0,
    sourceInfo: 1,
    catalogExtension: "ctd",
    extension: "ctd",
    globalSector: 0,
    localSector: 0,
    allocatedSectors: 1,
    allocatedBytes: 4,
    byteOffset: 4,
    downloadAvailable: true,
    isStreamed: false,
    isVerifiedCtd: true,
    ctdVerification: "confirmed",
  };
  const font: BbsArchiveEntry = {
    ...ctd,
    id: "bbs1-test-font",
    archiveIndex: 1,
    sourceArchiveName: "BBS1.DAT",
    catalogExtension: "arc",
    extension: "arc",
    byteOffset: 0,
    isVerifiedCtd: false,
    ctdVerification: "not-applicable",
  };
  return {
    ctd,
    font,
    originals,
    archive: {
      version: 1,
      archives,
      entries: [ctd, font],
      warnings: [],
      headerSectors: { archive0: 0, archive1: 0, archive2: 0, archive3: 0, archive4: 0 },
      metadataEndOffset: 0,
    },
  };
}

function makeRelocationWorkspace(): { archive: BbsArchiveIndex; ctd: BbsArchiveEntry; neighborOffset: number; original: Uint8Array } {
  const original = new Uint8Array(14 * SECTOR);
  original.fill(0);
  const ctdOffset = SECTOR;
  const neighborOffset = 3 * SECTOR;
  original.fill(0x41, ctdOffset, ctdOffset + 2 * SECTOR);
  original.fill(0x5a, neighborOffset, neighborOffset + SECTOR);
  const ctd: BbsArchiveEntry = {
    id: "bbs0-relocated-ctd",
    archiveIndex: 0,
    sourceArchiveName: "BBS0.DAT",
    directory: "test",
    directoryHash: 0,
    fileHash: 0,
    directoryTableIndex: 0,
    infoTableOffset: 0x40,
    sourceInfo: (1 << 12) | 2,
    catalogExtension: "ctd",
    extension: "ctd",
    globalSector: 1,
    localSector: 1,
    allocatedSectors: 2,
    allocatedBytes: 2 * SECTOR,
    byteOffset: ctdOffset,
    downloadAvailable: true,
    isStreamed: false,
    isVerifiedCtd: true,
    ctdVerification: "confirmed",
  };
  const neighbor: BbsArchiveEntry = {
    ...ctd,
    id: "bbs0-neighbor",
    infoTableOffset: 0x4c,
    sourceInfo: (3 << 12) | 1,
    globalSector: 3,
    localSector: 3,
    allocatedSectors: 1,
    allocatedBytes: SECTOR,
    byteOffset: neighborOffset,
    isVerifiedCtd: false,
    ctdVerification: "not-applicable",
    extension: "bin",
  };
  const archives = new Map<number, File>([
    [0, makeFile("BBS0.DAT", [...original])],
    [1, makeFile("BBS1.DAT", [0x31])],
    [2, makeFile("BBS2.DAT", [0x32])],
    [3, makeFile("BBS3.DAT", [0x33])],
  ]);
  return {
    ctd,
    neighborOffset,
    original,
    archive: {
      version: 1,
      archives,
      entries: [ctd, neighbor],
      warnings: [],
      headerSectors: { archive0: 0, archive1: 0, archive2: 0, archive3: 0, archive4: 0 },
      metadataEndOffset: SECTOR,
    },
  };
}

async function makeDualFontWorkspace(): Promise<{ archive: BbsArchiveIndex; originals: Map<number, Uint8Array>; embeddedArabicFont: Uint8Array }> {
  const embeddedArabicFont = new Uint8Array(await readFile("src/assets/Font.arabic.arc"));
  const englishFont = embeddedArabicFont.slice();
  englishFont[0] ^= 0xff;
  const originals = new Map<number, Uint8Array>([
    [0, englishFont],
    [1, englishFont],
    [2, new Uint8Array([0x42, 0x42, 0x53, 0x32])],
    [3, new Uint8Array([0x42, 0x42, 0x53, 0x33])],
  ]);
  const archives = new Map<number, File>([...originals].map(([index, bytes]) => [index, makeFile(`BBS${index}.DAT`, [...bytes])]));
  const fontEntry = (archiveIndex: 0 | 1): BbsArchiveEntry => ({
    id: `bbs${archiveIndex}-font-arc`,
    archiveIndex,
    sourceArchiveName: `BBS${archiveIndex}.DAT`,
    directory: "arc/system",
    directoryHash: 0,
    fileHash: 0,
    directoryTableIndex: 0,
    infoTableOffset: null,
    sourceInfo: 0,
    catalogExtension: "arc",
    extension: "arc",
    globalSector: 0,
    localSector: 0,
    allocatedSectors: Math.ceil(englishFont.byteLength / SECTOR),
    allocatedBytes: englishFont.byteLength,
    byteOffset: 0,
    downloadAvailable: true,
    isStreamed: false,
    isVerifiedCtd: false,
    ctdVerification: "not-applicable",
  });
  return {
    originals,
    embeddedArabicFont,
    archive: {
      version: 1,
      archives,
      entries: [fontEntry(0), fontEntry(1)],
      warnings: [],
      headerSectors: { archive0: 0, archive1: 0, archive2: 0, archive3: 0, archive4: 0 },
      metadataEndOffset: 0,
    },
  };
}

afterEach(() => clearKHBbsBbsWorkspace());

describe("buildKHBbsDatOutput", () => {
  it("يخرج BBS0–BBS3 كاملة ويغير CTD في BBS0 والخط في BBS1 فقط", async () => {
    const { archive, ctd, font, originals } = makeWorkspace();
    setKHBbsBbsWorkspace(archive);

    const output = await buildKHBbsDatOutput([
      { source: makeKHBbsResourceReference(ctd), bytes: new Uint8Array([0xaa, 0xbb]) },
      { source: makeKHBbsResourceReference(font), bytes: new Uint8Array([0xcc]) },
    ]);

    expect(output.includedArchives).toEqual([0, 1, 2, 3]);
    expect(output.changedArchives).toEqual([0, 1]);
    const zip = await JSZip.loadAsync(output.archive);
    expect(Object.keys(zip.files).sort()).toEqual(["BBS0.DAT", "BBS1.DAT", "BBS2.DAT", "BBS3.DAT"]);

    const bbs0 = [...new Uint8Array(await zip.file("BBS0.DAT")!.async("arraybuffer"))];
    expect(bbs0).toEqual([0x10, 0x11, 0x12, 0x13, 0xaa, 0xbb, 0x22, 0x23]);
    const bbs1 = [...new Uint8Array(await zip.file("BBS1.DAT")!.async("arraybuffer"))];
    expect(bbs1).toEqual([0xcc, 0x31, 0x32, 0x33]);
    for (const archiveIndex of [2, 3]) {
      const bytes = [...new Uint8Array(await zip.file(`BBS${archiveIndex}.DAT`)!.async("arraybuffer"))];
      expect(bytes).toEqual(originals.get(archiveIndex));
    }
  });

  it("يرفض البناء عندما لا يكون أحد ملفات BBS0–BBS3 موجوداً", async () => {
    const { archive, ctd } = makeWorkspace(false);
    setKHBbsBbsWorkspace(archive);
    await expect(buildKHBbsDatOutput([
      { source: makeKHBbsResourceReference(ctd), bytes: new Uint8Array([0xaa]) },
    ])).rejects.toThrow("BBS3.DAT");
  });

  it("يكتشف Font.arc في BBS0 وBBS1 ويضع الخط العربي فيهما فقط", async () => {
    const { archive, originals, embeddedArabicFont } = await makeDualFontWorkspace();
    setKHBbsBbsWorkspace(archive);
    const fontCopy = new Uint8Array(embeddedArabicFont.byteLength);
    fontCopy.set(embeddedArabicFont);
    const sources = await setKHBbsFontReplacement(new File([fontCopy.buffer], "Font.arabic.arc", { type: "application/octet-stream" }));
    expect(sources.map((source) => source.archiveIndex)).toEqual([0, 1]);

    const output = await buildKHBbsDatOutput([]);
    expect(output.includedArchives).toEqual([0, 1, 2, 3]);
    expect(output.changedArchives).toEqual([0, 1]);
    const zip = await JSZip.loadAsync(output.archive);
    for (const archiveIndex of [0, 1]) {
      const bytes = new Uint8Array(await zip.file(`BBS${archiveIndex}.DAT`)!.async("arraybuffer"));
      expect(bytes).toEqual(embeddedArabicFont);
    }
    for (const archiveIndex of [2, 3]) {
      const bytes = new Uint8Array(await zip.file(`BBS${archiveIndex}.DAT`)!.async("arraybuffer"));
      expect(bytes).toEqual(originals.get(archiveIndex));
    }
  });

  it("يدخل موردي D2 وD3 الاختباريين في BBS0 وBBS1 فقط", async () => {
    const variants = [
      "src/assets/Font.arabic.test-d2-nearest-ten-mesfont.arc",
      "src/assets/Font.arabic.test-d3-reversed-levels-ten-mesfont.arc",
    ];
    for (const path of variants) {
      const { archive, originals } = await makeDualFontWorkspace();
      const testFont = new Uint8Array(await readFile(path));
      setKHBbsBbsWorkspace(archive);
      await setKHBbsFontReplacement(new File([testFont], path.split("/").at(-1)!, { type: "application/octet-stream" }));
      const output = await buildKHBbsDatOutput([]);
      const zip = await JSZip.loadAsync(output.archive);
      for (const archiveIndex of [0, 1]) {
        expect(new Uint8Array(await zip.file(`BBS${archiveIndex}.DAT`)!.async("arraybuffer"))).toEqual(testFont);
      }
      for (const archiveIndex of [2, 3]) {
        expect(new Uint8Array(await zip.file(`BBS${archiveIndex}.DAT`)!.async("arraybuffer"))).toEqual(originals.get(archiveIndex));
      }
      clearKHBbsBbsWorkspace();
    }
  });

  it("ينقل CTD المتجاوز إلى قطاعات صفرية ويُبقي المورد المجاور كما هو", async () => {
    const { archive, ctd, neighborOffset, original } = makeRelocationWorkspace();
    setKHBbsBbsWorkspace(archive);
    const translated = new Uint8Array(17_327).fill(0xab);

    const output = await buildKHBbsDatOutput([
      { source: makeKHBbsResourceReference(ctd), bytes: translated },
    ]);

    expect(output.changedArchives).toEqual([0]);
    const zip = await JSZip.loadAsync(output.archive);
    const bbs0 = new Uint8Array(await zip.file("BBS0.DAT")!.async("arraybuffer"));
    expect(bbs0.byteLength).toBe(original.byteLength);
    expect(new DataView(bbs0.buffer).getUint32(0x40, true)).toBe((4 << 12) | 9);
    expect([...bbs0.slice(SECTOR, 3 * SECTOR)]).toEqual([...original.slice(SECTOR, 3 * SECTOR)]);
    expect([...bbs0.slice(neighborOffset, neighborOffset + SECTOR)]).toEqual([...original.slice(neighborOffset, neighborOffset + SECTOR)]);
    expect([...bbs0.slice(4 * SECTOR, 4 * SECTOR + translated.byteLength)]).toEqual([...translated]);
    expect([...bbs0.slice(4 * SECTOR + translated.byteLength, 13 * SECTOR)]).toEqual(new Array(13 * SECTOR - (4 * SECTOR + translated.byteLength)).fill(0));
  });

  it("يبني تجربة قسرية بحجم BBS0 نفسه عندما لا توجد فجوة صفرية", async () => {
    const { archive, ctd, original } = makeRelocationWorkspace();
    const bbs0 = archive.archives.get(0)!;
    const occupied = new Uint8Array(await bbs0.arrayBuffer());
    occupied.fill(0x7f, 4 * SECTOR);
    archive.archives.set(0, makeFile("BBS0.DAT", [...occupied]));
    setKHBbsBbsWorkspace(archive);
    const translated = new Uint8Array(17_327).fill(0xab);

    const output = await buildKHBbsDatOutput([
      { source: makeKHBbsResourceReference(ctd), bytes: translated },
    ]);

    expect(output.warnings).toHaveLength(1);
    expect(output.warnings[0]).toContain("تجربة قسرية");
    const zip = await JSZip.loadAsync(output.archive);
    const forcedBbs0 = new Uint8Array(await zip.file("BBS0.DAT")!.async("arraybuffer"));
    expect(forcedBbs0.byteLength).toBe(original.byteLength);
    expect([...forcedBbs0.slice(SECTOR, SECTOR + translated.byteLength)]).toEqual([...translated]);
  });
});
