import { describe, it, expect } from "vitest";
import { makePak, type PakFile } from "./dragonsword-pak-helper";
import {
  readDragonSwordPak,
  writeDragonSwordPak,
  looksLikeDragonSwordPak,
} from "@/lib/dragonsword/ds-pak";

function text(n: number, seed: string): Uint8Array {
  let s = "";
  while (s.length < n) s += `${seed} riga ${s.length} con <orange>{0}</> testo. `;
  return new TextEncoder().encode(s.slice(0, n));
}

const FILES: PakFile[] = [
  { path: "DragonSword/Content/L10N/it/StringData_it.table", data: text(3000, "alpha") },
  // Over one 64 KB block, so the multi-block path and its block table are covered.
  { path: "DragonSword/Content/L10N/it/StringQuestData_it.table", data: text(200000, "beta") },
  { path: "DragonSword/Content/L10N/it/Raw.bin", data: text(120, "gamma"), compressed: false },
];

describe("dragonsword pak reading", () => {
  it("returns every file, with its path and its exact bytes", () => {
    const files = readDragonSwordPak(makePak(FILES));
    expect(files.map((f) => f.path)).toEqual(FILES.map((f) => f.path));
    for (const [i, f] of files.entries()) {
      expect(Array.from(f.data)).toEqual(Array.from(FILES[i].data));
    }
  });

  it("puts a file spanning several blocks back together", () => {
    const files = readDragonSwordPak(makePak(FILES));
    const big = files.find((f) => f.path.endsWith("StringQuestData_it.table"))!;
    expect(big.data.length).toBe(200000);
  });

  it("recognises a pak and refuses anything else", () => {
    expect(looksLikeDragonSwordPak(makePak(FILES))).toBe(true);
    expect(looksLikeDragonSwordPak(new Uint8Array(500))).toBe(false);
    expect(looksLikeDragonSwordPak(new Uint8Array(4))).toBe(false);
    expect(looksLikeDragonSwordPak(new TextEncoder().encode("not a pak at all"))).toBe(false);
  });
});

describe("dragonsword pak writing", () => {
  /**
   * The gate this format had to pass before anything was built on it: take the
   * pak apart and put it back with nothing changed, and every file must come
   * back identical.
   *
   * The pak's own bytes do not come back identical, and cannot: the data is
   * re-compressed, and zlib through pako packs it tighter than the game's
   * packer did. What has to survive is the contents, and they do.
   */
  it("rebuilds untouched and gives back the same contents", () => {
    const pak = makePak(FILES);
    const again = readDragonSwordPak(writeDragonSwordPak(pak, {}));
    expect(again.map((f) => f.path)).toEqual(FILES.map((f) => f.path));
    for (const [i, f] of again.entries()) {
      expect(Array.from(f.data)).toEqual(Array.from(FILES[i].data));
    }
  });

  it("writes a replaced file and leaves the others alone", () => {
    const pak = makePak(FILES);
    const swapped = new TextEncoder().encode("سطرٌ عربيٌّ جديد تماماً");
    const out = writeDragonSwordPak(pak, { [FILES[0].path]: swapped });
    const again = readDragonSwordPak(out);
    expect(Array.from(again[0].data)).toEqual(Array.from(swapped));
    expect(Array.from(again[1].data)).toEqual(Array.from(FILES[1].data));
    expect(Array.from(again[2].data)).toEqual(Array.from(FILES[2].data));
  });

  it("survives a replacement that grows past a block boundary", () => {
    const pak = makePak(FILES);
    const grown = text(300000, "delta");
    const again = readDragonSwordPak(writeDragonSwordPak(pak, { [FILES[1].path]: grown }));
    expect(again[1].data.length).toBe(300000);
    expect(Array.from(again[1].data)).toEqual(Array.from(grown));
  });

  it("can be written twice over — the output is readable input", () => {
    const once = writeDragonSwordPak(makePak(FILES), {});
    const twice = writeDragonSwordPak(once, {});
    const again = readDragonSwordPak(twice);
    for (const [i, f] of again.entries()) {
      expect(Array.from(f.data)).toEqual(Array.from(FILES[i].data));
    }
  });

  it("keeps the footer where a reader will find it", () => {
    const out = writeDragonSwordPak(makePak(FILES), {});
    const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(v.getUint32(out.length - 204, true)).toBe(0x5a6f12e1);
    expect(v.getUint32(out.length - 200, true)).toBe(11);
  });
});
