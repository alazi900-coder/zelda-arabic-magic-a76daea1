/**
 * The verifier exists because the engine says nothing: it drops a font it does
 * not like and the game draws no text at all. These check that each rule it
 * enforces actually fires — every one of them cost a build to learn.
 */
import { describe, it, expect } from "vitest";
import { verifyRisen3Archive, formatRisen3Report } from "@/lib/risen3-verify";
import { buildRisen3Fnt, parseRisen3Fnt, type Risen3FntDocument } from "@/lib/risen3-fnt";
import { parseImagesPakHeader, parseImagesPakFileInfoTree } from "@/lib/risen-images-pak";
import { buildFontsPakArchive } from "@/lib/risen2-fontspak";
import { deflateSync } from "node:zlib";
import { buildRisen3Archive } from "@/lib/risen3-archive";

const HEADER_END = 0xac;
const RECORD_SIZE = 28;

function fontBytes(pairs: { charCode: number; glyphIndex: number }[], cells: number[][], width: number, height: number): Uint8Array {
  const dds = new Uint8Array(128 + width * height);
  dds.set([0x44, 0x44, 0x53, 0x20], 0);
  const dv = new DataView(dds.buffer);
  dv.setUint32(4, 124, true);
  dv.setUint32(12, height, true);
  dv.setUint32(16, width, true);

  const size = HEADER_END + 4 + 4 * pairs.length + 4 + RECORD_SIZE * cells.length + 4 + 4 + dds.length + 36;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) out[0x34 + i] = "GEDXFNT0".charCodeAt(i);
  for (const [i, ch] of [..."Probe"].entries()) out[0x5c + 2 * i] = ch.charCodeAt(0);
  let p = HEADER_END;
  view.setUint32(p, pairs.length, true);
  p += 4;
  for (const pair of pairs) {
    view.setUint16(p, pair.charCode, true);
    view.setUint16(p + 2, pair.glyphIndex, true);
    p += 4;
  }
  view.setUint32(p, cells.length, true);
  p += 4;
  for (const c of cells) {
    for (let k = 0; k < 7; k++) view.setInt32(p + 4 * k, c[k] ?? 0, true);
    p += RECORD_SIZE;
  }
  p += 4;
  view.setUint32(p, dds.length, true);
  p += 4;
  out.set(dds, p);
  p += dds.length;
  view.setUint32(p, 44, true);
  view.setUint32(p + 4, p - 44, true);
  for (let k = 0; k < 3; k++) view.setBigInt64(p + 9 + 9 * k, BigInt(p), true);
  return out;
}

/** A G3V0 archive holding one font, its manifest and its index. */
function archive(font: Uint8Array, recordedEnd: number): Uint8Array {
  const csv = new TextEncoder().encode("Hash|Name|A|B|\nabcdef12|Probe_10_sdf|x|y|\n");
  const dbParts: number[] = [];
  const name = [..."Probe_10_sdf"].map((c) => c.charCodeAt(0));
  const push32 = (v: number) => dbParts.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  push32(name.length);
  dbParts.push(...name);
  push32(44);
  push32(recordedEnd - 44);
  dbParts.push(0);
  for (let k = 0; k < 3; k++) {
    push32(recordedEnd);
    push32(0);
    dbParts.push(0);
  }
  const db = Uint8Array.from(dbParts);

  const entries: { name: string; data: Uint8Array }[] = [
    { name: "w_fnt_0_na.db", data: db },
    { name: "w_fnt_0_na.csv", data: csv },
    { name: "w_fnt_0_na_abcdef12.rom", data: font },
  ];
  const stored = entries.map((e) => ({ ...e, blob: deflateSync(e.data) }));
  let offset = 48;
  const dataParts: Uint8Array[] = [];
  const placed = stored.map((e) => {
    const at = offset;
    dataParts.push(e.blob);
    offset += e.blob.length;
    return { ...e, offset: at };
  });

  const tree: number[] = [];
  const t32 = (v: number) => tree.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  t32(placed.length);
  for (const e of placed) {
    tree.push(2, 0, 2, 0); // file marker (16 is the folder marker)
    t32(e.name.length);
    for (const c of e.name) tree.push(c.charCodeAt(0));
    tree.push(0);
    const off = new Uint8Array(8);
    new DataView(off.buffer).setBigInt64(0, BigInt(e.offset), true);
    tree.push(...off);
    for (let k = 0; k < 24; k++) tree.push(0);
    t32(0); t32(0); t32(0);
    t32(e.blob.length);
    t32(e.data.length);
  }

  const preamble = new Uint8Array(0x20);
  preamble[0x1c] = 16; // علامة مجلّد الجذر، كما في الملف الحقيقي
  preamble[0x1e] = 2;
  const total = offset + preamble.length + tree.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 1, true);
  for (let i = 0; i < 4; i++) out[4 + i] = "G3V0".charCodeAt(i);
  view.setUint32(16, 1, true);
  view.setUint32(20, 0xfeedface, true);
  // dataAddress at 0x18, offset-to-fileinfo at 0x20 (relative to 0x20), size at 0x28
  view.setBigInt64(0x18, BigInt(48), true);
  // The stored offset names the 32-byte block; the reader adds 0x20 to reach the tree.
  view.setBigInt64(0x20, BigInt(offset), true);
  view.setBigInt64(0x28, BigInt(total), true);
  let p = 48;
  for (const part of dataParts) {
    out.set(part, p);
    p += part.length;
  }
  out.set(preamble, offset);
  out.set(Uint8Array.from(tree), offset + preamble.length);
  return out;
}

const GOOD_PAIRS = [
  { charCode: 0x41, glyphIndex: 0 },
  { charCode: 0x42, glyphIndex: 1 },
  { charCode: 0x627, glyphIndex: 2 },
];
const CELLS = [[0, 0, 10, 20, 8], [10, 0, 20, 20, 8], [20, 0, 30, 20, 8]];

describe("Risen 3 — checking a built archive", () => {
  it("passes a sound one, and says so with numbers", () => {
    const font = fontBytes(GOOD_PAIRS, CELLS, 64, 64);
    const report = verifyRisen3Archive(archive(font, font.length - 36), "test");
    expect(report.problems).toEqual([]);
    expect(report.fonts).toHaveLength(1);
    expect(report.fonts[0].chars).toBe(3);
    expect(report.fonts[0].arabic).toBe(1);
    expect(report.fonts[0].atlas).toEqual({ width: 64, height: 64 });
    expect(formatRisen3Report(report)).toContain("لا مشاكل");
  });

  it("catches a charmap out of order — the fault that hid every letter", () => {
    const font = fontBytes(
      [
        { charCode: 0x20ac, glyphIndex: 0 },
        { charCode: 0x0621, glyphIndex: 1 },
        { charCode: 0x0627, glyphIndex: 2 },
      ],
      CELLS,
      64,
      64
    );
    const report = verifyRisen3Archive(archive(font, font.length - 36), "test");
    expect(report.problems.some((p) => p.includes("غير مرتّبة"))).toBe(true);
  });

  it("catches an index left at the old size", () => {
    const font = fontBytes(GOOD_PAIRS, CELLS, 64, 64);
    const report = verifyRisen3Archive(archive(font, 12345), "test");
    expect(report.problems.some((p) => p.includes("الفهرس"))).toBe(true);
  });

  it("catches a cell that falls outside the texture", () => {
    const font = fontBytes(GOOD_PAIRS, [[0, 0, 10, 20, 8], [10, 0, 20, 20, 8], [20, 0, 900, 20, 8]], 64, 64);
    const report = verifyRisen3Archive(archive(font, font.length - 36), "test");
    expect(report.problems.some((p) => p.includes("خارج حدود الأطلس"))).toBe(true);
  });

  it("catches two characters landing on one glyph", () => {
    const font = fontBytes(
      [
        { charCode: 0x41, glyphIndex: 0 },
        { charCode: 0x42, glyphIndex: 0 },
        { charCode: 0x627, glyphIndex: 2 },
      ],
      CELLS,
      64,
      64
    );
    const report = verifyRisen3Archive(archive(font, font.length - 36), "test");
    expect(report.problems.some((p) => p.includes("يتشارك"))).toBe(true);
  });

  it("catches an atlas grown past what the original had", () => {
    // The build that doubled an atlas to 2048x2048 was refused outright even
    // with every other field correct, so growth is judged against the file the
    // translator started from.
    const small = fontBytes(GOOD_PAIRS, CELLS, 64, 64);
    const big = fontBytes(GOOD_PAIRS, CELLS, 64, 128);
    const report = verifyRisen3Archive(archive(big, big.length - 36), "test", archive(small, small.length - 36));
    expect(report.problems.some((p) => p.includes("الأطلس كبر"))).toBe(true);
  });
});

describe("Risen 3 — the block before the file tree", () => {
  it("is kept by a no-op rebuild, byte for byte", () => {
    // The check that would have caught four broken builds: rebuilding without
    // changing anything must give back the same file. The Risen 2 builder
    // dropped 32 bytes here and still parsed, so nothing noticed.
    const font = fontBytes(GOOD_PAIRS, CELLS, 64, 64);
    const original = archive(font, font.length - 36);
    const header = parseImagesPakHeader(original);
    const { tree } = parseImagesPakFileInfoTree(original.subarray(header.fileInfoOffset), header);
    const built = buildRisen3Archive(original, header, tree, new Map());
    expect(built.bytes.length).toBe(original.length);
    expect(built.bytes).toEqual(original);
  });

  it("is reported, and its loss is called a problem", () => {
    const font = fontBytes(GOOD_PAIRS, CELLS, 64, 64);
    const original = archive(font, font.length - 36);
    const report = verifyRisen3Archive(original, "test", original);
    expect(report.preamble.present).toBe(true);
    expect(report.preamble.matchesOriginal).toBe(true);

    // Corrupt the block and it must be named.
    const damaged = original.slice();
    const h = parseImagesPakHeader(damaged);
    damaged[h.fileInfoOffset - 4] ^= 0xff;
    const bad = verifyRisen3Archive(damaged, "test", original);
    expect(bad.problems.some((p) => p.includes("الكتلة"))).toBe(true);
  });
});
