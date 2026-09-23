import { describe, expect, it } from "vitest";
import {
  parseSfpEntries, inazumaContainerImages, parseInazumaImage, inazumaImageWidths,
  renderInazumaImage, encodeInazumaImage, buildInazumaImagesRom, classifyInazumaImage,
  type InazumaImageRef,
} from "../inazuma-images";
import { compressLz10, decompressLz10 } from "@/lib/fireemblem12/nds-lz";
import { findNdsFile } from "@/lib/nds/nds-rom";

function u32le(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

/** 16 RGB555 colours: 0 black (transparent), 1 red, 2 green, 3 blue, rest grey. */
function palette(): number[] {
  const out: number[] = [];
  const cols = [0, 0x001f, 0x03e0, 0x7c00];
  for (let i = 0; i < 16; i++) { const v = cols[i] ?? 0x4210; out.push(v & 0xff, v >> 8); }
  return out;
}

/** A tiled entry: `map` cells naming `tiles` (each 64 colour indices). */
function tiledEntry(map: number[], tiles: number[][]): Uint8Array {
  const mapOff = 64;
  const tileOff = Math.ceil((mapOff + map.length * 2) / 32) * 32;
  const tileSize = tiles.length * 32;
  const out = new Uint8Array(tileOff + tileSize);
  out.set([...u32le(3), ...u32le(32), ...u32le(32), ...u32le(mapOff), ...u32le(map.length * 2), ...u32le(tileOff), ...u32le(tileSize), ...u32le(tileOff + tileSize - 32)]);
  out.set(palette(), 32);
  map.forEach((v, i) => { out[mapOff + i * 2] = v & 0xff; out[mapOff + i * 2 + 1] = v >> 8; });
  tiles.forEach((t, k) => { for (let i = 0; i < 64; i += 2) out[tileOff + k * 32 + i / 2] = t[i] | (t[i + 1] << 4); });
  return out;
}

/** A linear 4bpp texture of `pixels` colour indices. */
function linearEntry(pixels: number[]): Uint8Array {
  const texSize = pixels.length / 2;
  const out = new Uint8Array(32 + texSize + 32);
  out.set([...u32le(3), ...u32le(32), ...u32le(texSize), ...u32le(32 + texSize), ...u32le(32), ...u32le(64 + texSize), ...u32le(0), ...u32le(0)]);
  for (let i = 0; i < pixels.length; i += 2) out[32 + i / 2] = pixels[i] | (pixels[i + 1] << 4);
  out.set(palette(), 32 + texSize);
  return out;
}

const bare = (d: Uint8Array): InazumaImageRef => inazumaContainerImages("x.pac_", d)[0];
const solid = (n: number) => new Array(64).fill(n);

describe("inazuma-images", () => {
  it("reads a tiled picture and lists every width its cell count allows", () => {
    const d = tiledEntry([0, 1, 1, 0], [solid(1), solid(2)]);
    const img = parseInazumaImage(d, bare(d))!;
    expect(img.kind).toBe("tiled");
    expect(inazumaImageWidths(img)).toEqual([8, 16, 32]);
    const r = renderInazumaImage(d, img, 16);
    expect([r.width, r.height]).toEqual([16, 16]);
    // top-left red, top-right green
    expect(Array.from(r.rgba.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(r.rgba.slice(8 * 4, 8 * 4 + 4))).toEqual([0, 255, 0, 255]);
  });

  it("writes an edit back without moving any cell, and the picture reads back as drawn", () => {
    // Tile 2 is spare, so the edited top-left cell has somewhere to go.
    const d = tiledEntry([0, 1, 1, 0], [solid(1), solid(2), solid(0)]);
    const ref = bare(d);
    const img = parseInazumaImage(d, ref)!;
    const r = renderInazumaImage(d, img, 16);
    const edit = r.rgba.slice();
    edit.set([0, 0, 255, 255], 0); // one blue pixel in the top-left cell
    const before = d.slice();
    encodeInazumaImage(d, img, 16, edit);
    expect(d.length).toBe(before.length);
    const back = renderInazumaImage(d, parseInazumaImage(d, ref)!, 16);
    expect(Array.from(back.rgba)).toEqual(Array.from(edit));
  });

  it("gives a cell its own tile when it stops matching the cells it shared with", () => {
    // Both cells name tile 0; tile 1 is spare.
    const d = tiledEntry([0, 0], [solid(1), solid(0)]);
    const ref = bare(d);
    const img = parseInazumaImage(d, ref)!;
    const edit = renderInazumaImage(d, img, 16).rgba.slice();
    for (let y = 0; y < 8; y++) for (let x = 8; x < 16; x++) edit.set([0, 255, 0, 255], (y * 16 + x) * 4);
    const { merged } = encodeInazumaImage(d, img, 16, edit);
    expect(merged).toBe(0);
    const back = renderInazumaImage(d, parseInazumaImage(d, ref)!, 16);
    expect(Array.from(back.rgba)).toEqual(Array.from(edit));
  });

  it("merges the closest squares when the edit needs more tiles than the picture has", () => {
    const d = tiledEntry([0, 0], [solid(1)]);
    const img = parseInazumaImage(d, bare(d))!;
    const edit = renderInazumaImage(d, img, 16).rgba.slice();
    edit.set([0, 255, 0, 255], 8 * 4);
    expect(encodeInazumaImage(d, img, 16, edit).merged).toBe(1);
  });

  it("keeps a cell's flips and palette bits when it is rewritten", () => {
    const d = tiledEntry([0x0400, 1], [solid(1), solid(2)]); // cell 0 is H-flipped
    const ref = bare(d);
    const img = parseInazumaImage(d, ref)!;
    const edit = renderInazumaImage(d, img, 16).rgba.slice();
    edit.set([0, 0, 255, 255], 0);
    encodeInazumaImage(d, img, 16, edit);
    const after = parseInazumaImage(d, ref)!;
    expect(after.kind === "tiled" && after.map[0] & 0xfc00).toBe(0x0400);
    expect(Array.from(renderInazumaImage(d, after, 16).rgba)).toEqual(Array.from(edit));
  });

  it("reads and writes a linear texture, transparent pixels becoming colour 0", () => {
    const px = Array.from({ length: 32 }, (_, i) => (i % 3) + 1);
    const d = linearEntry(px);
    const ref = bare(d);
    const img = parseInazumaImage(d, ref)!;
    expect(img.kind).toBe("linear");
    expect(inazumaImageWidths(img)).toEqual([8, 16, 32]);
    const edit = renderInazumaImage(d, img, 16).rgba.slice();
    edit[3] = 0; // pixel 0 transparent
    edit.set([250, 5, 5, 255], 4); // near-red
    encodeInazumaImage(d, img, 16, edit);
    expect(d[32] & 15).toBe(0);
    expect(d[32] >> 4).toBe(1);
  });

  it("lists an SFP container's named entries", () => {
    const a = tiledEntry([0], [solid(1)]);
    const b = linearEntry(new Array(64).fill(2));
    const names = "A.PAC\0B.PAC\0";
    const table = 32, nameAt = table + 32, dataAt = Math.ceil((nameAt + names.length) / 32) * 32;
    const bOff = Math.ceil(a.length / 32) * 32;
    const d = new Uint8Array(dataAt + bOff + b.length);
    d.set([0x53, 0x46, 0x50, 0, ...u32le(0), ...u32le(5), ...u32le(table), ...u32le(dataAt)]);
    d.set([...u32le(nameAt), ...u32le(a.length), ...u32le(0), ...u32le(0)], table);
    d.set([...u32le(nameAt + 6), ...u32le(b.length), ...u32le(bOff / 32), ...u32le(0)], table + 16);
    for (let i = 0; i < names.length; i++) d[nameAt + i] = names.charCodeAt(i);
    d.set(a, dataAt);
    d.set(b, dataAt + bOff);
    expect(parseSfpEntries(d).map((e) => e.name)).toEqual(["A.PAC", "B.PAC"]);
    const refs = inazumaContainerImages("data_iz/pic2d/menu/en/X.SPF_", d);
    expect(refs.map((r) => r.id)).toEqual(["data_iz/pic2d/menu/en/X.SPF_#A.PAC", "data_iz/pic2d/menu/en/X.SPF_#B.PAC"]);
    expect(parseInazumaImage(d, refs[1])?.kind).toBe("linear");
  });

  it("packs an edited file back into the ROM, compressed and verified", () => {
    const original = tiledEntry([0, 1], [solid(1), solid(2)]);
    const packed = compressLz10(original);
    // A one-file ROM: name table at 0x140, FAT at 0x1000, the file after it.
    const name = "a.pac_";
    const rom = new Uint8Array(0x2000);
    rom.set([...u32le(8), 0, 0, 1, 0, name.length, ...Array.from(name, (c) => c.charCodeAt(0)), 0], 0x140);
    rom.set(u32le(0x140), 0x40);
    rom.set(u32le(0x1000), 0x48);
    rom.set(u32le(8), 0x4c);
    rom.set([...u32le(0x1008), ...u32le(0x1008 + packed.length)], 0x1000);
    rom.set(packed, 0x1008);
    rom.set(u32le(0x1008 + packed.length), 0x80);

    const edited = original.slice();
    const img = parseInazumaImage(edited, bare(edited))!;
    const rgba = renderInazumaImage(edited, img, 16).rgba.slice();
    rgba.set([0, 0, 255, 255], 0);
    encodeInazumaImage(edited, img, 16, rgba);

    const out = buildInazumaImagesRom(rom, new Map([[name, edited]]));
    const f = findNdsFile(out, name)!;
    expect(Array.from(decompressLz10(out.subarray(f.start, f.end)))).toEqual(Array.from(edited));
  });

  it("sorts pictures into the sections the translator works in", () => {
    expect(classifyInazumaImage("data_iz/pic2d/menu/en/MMName.SPF_").id).toBe("menu");
    expect(classifyInazumaImage("data_iz/pic3d/en/mbd_s001r.pac_").id).toBe("tex-en");
    expect(classifyInazumaImage("data_iz/pic3d/mf01gm01.pac_").group).toBe("other");
  });
});
