/**
 * TEST: بناء Kingdom Hearts يخرج BBS0–BBS3 كاملة؛ لا يتغير خارج المورد المحدد.
 */

import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildKHBbsDatOutput,
  clearKHBbsBbsWorkspace,
  makeKHBbsResourceReference,
  setKHBbsBbsWorkspace,
} from "@/lib/khbbs-bbs-workspace";
import type { BbsArchiveEntry, BbsArchiveIndex } from "@/lib/khbbs-bbsa";

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
});
