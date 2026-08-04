/**
 * DragonSword Awakening ships its text in an Unreal Engine 4 `.pak`, and this
 * reads one and writes it back.
 *
 * Everything below was taken off a real `DragonSword_IT.pak` (1.9 MB, four
 * files) and checked by rebuilding it untouched and comparing byte for byte —
 * the same gate this project puts in front of every container format.
 *
 * THE SHAPE OF THE FILE
 *
 *   [ entry header + data ] x N        each entry's own header sits in front
 *   index                              mount point, then one encoded record
 *                                      per file
 *   path hash index                    hash of the path -> where its record is
 *   full directory index               directory + file name -> the same
 *   footer                             221 bytes, ending the file
 *
 * The footer is found from the end: its magic `5A6F12E1` sits 204 bytes before
 * EOF, with 16 bytes of encryption GUID and one flag byte in front of it.
 *
 * AN ENTRY HEADER, at the offset its record names:
 *
 *   u64 offset (always 0 here), u64 compressed size, u64 uncompressed size,
 *   u32 compression method, 20 bytes SHA-1 of the compressed data,
 *   then when compressed: u32 block count and, per block, u64 start and u64
 *   end — both relative to the header — then u8 encrypted and u32 block size.
 *
 * AN ENCODED RECORD, in the index — the same numbers, packed:
 *
 *   u32 flags: bit 31/30/29 say offset/uncompressed/compressed fit in 32 bits,
 *              bits 23..28 the compression method, bit 22 encrypted,
 *              bits 6..21 the block count, bits 0..5 the block size in 2 KB
 *              units (0x3f meaning "read it from the header").
 *   u32 offset, u32 uncompressed size, u32 compressed size,
 *   and when there is more than one block, u32 of each block's packed length.
 *
 * WHY THE PATH HASHES ARE COPIED AND NOT COMPUTED
 *
 * The path hash index is a hash of each file's path against a seed, and Unreal
 * has changed that function more than once. Nothing here needs it: the paths
 * do not change, so the hashes are carried across untouched and only the
 * locations they point at are rewritten. A hash function guessed wrong would
 * make the game silently fail to find a file; a copied one cannot.
 */

import { inflate, deflate } from "pako";

const FOOTER_MAGIC = 0x5a6f12e1;
/** Magic, version, index offset and size, its hash, and the method names. */
const FOOTER_AFTER_MAGIC = 4 + 4 + 8 + 8 + 20 + 32 * 5;
/**
 * How many bytes follow the magic, longest first.
 *
 * The count of 32-byte compression-method names is what differs: five in the
 * paks this was written against, four in the older layout. The magic is found
 * by trying each size rather than assumed, because a pak built by a modding
 * tool may pair either footer with any version number — the 9.8 MB Arabic mod
 * stamps version 8 and still carries the five-name footer.
 */
const FOOTER_SIZES = [FOOTER_AFTER_MAGIC, 4 + 4 + 8 + 8 + 20 + 32 * 4];
/** The GUID and the encrypted-index flag sit in front of the magic. */
const FOOTER_BEFORE_MAGIC = 16 + 1;
/** From this version on, the index is split into the two lookup blobs. */
const FIRST_SPLIT_INDEX_VERSION = 10;

export interface DsPakEntry {
  /** Path below the pak's mount point, as the index spells it. */
  path: string;
  /** The file's bytes, decompressed. */
  data: Uint8Array;
}

interface Record_ {
  path: string;
  location: number;
  flags: number;
  offset: number;
  uncompressed: number;
  compressed: number;
  blockSizes: number[];
  method: number;
  blockBytes: number;
}

class Reader {
  at = 0;
  constructor(readonly d: Uint8Array, readonly v = new DataView(d.buffer, d.byteOffset, d.byteLength)) {}
  u32() { const x = this.v.getUint32(this.at, true); this.at += 4; return x; }
  i32() { const x = this.v.getInt32(this.at, true); this.at += 4; return x; }
  u64() { const x = Number(this.v.getBigUint64(this.at, true)); this.at += 8; return x; }
  skip(n: number) { this.at += n; }
  bytes(n: number) { const b = this.d.subarray(this.at, this.at + n); this.at += n; return b; }
  /** Unreal's FString: a positive count is ASCII, a negative one UTF-16. */
  str(): string {
    const n = this.i32();
    if (n >= 0) {
      const b = this.bytes(n);
      return new TextDecoder().decode(b).replace(/\0+$/, "");
    }
    const b = this.bytes(-n * 2);
    return new TextDecoder("utf-16le").decode(b).replace(/\0+$/, "");
  }
}

interface Footer {
  magicAt: number;
  /** Bytes from the magic to the end — the method-name count differs. */
  size: number;
}

function findFooter(pak: Uint8Array): Footer {
  const v = new DataView(pak.buffer, pak.byteOffset, pak.byteLength);
  for (const size of FOOTER_SIZES) {
    const at = pak.length - size;
    if (at >= FOOTER_BEFORE_MAGIC && v.getUint32(at, true) === FOOTER_MAGIC) {
      return { magicAt: at, size };
    }
  }
  if (pak.length < FOOTER_SIZES[0]) throw new Error("الملفّ أصغر من أن يكون حاوية Unreal");
  throw new Error("لم أجد توقيع حاوية Unreal في نهاية الملفّ");
}

/** True when this file looks like the pak this reader was written against. */
export function looksLikeDragonSwordPak(pak: Uint8Array): boolean {
  try {
    findFooter(pak);
    return true;
  } catch {
    return false;
  }
}

interface Parsed {
  magicAt: number;
  footerSize: number;
  version: number;
  /** True when the index carries the names and full headers inline. */
  legacy: boolean;
  indexOffset: number;
  indexSize: number;
  mount: string;
  seed: number;
  pathHashOffset: number;
  pathHashSize: number;
  dirOffset: number;
  dirSize: number;
  records: Record_[];
}

/**
 * Reads one entry header, wherever it sits.
 *
 * The same eleven fields appear twice in every pak: once in front of the data
 * and once — in the older index layout — inside the index, where the offset
 * field is the real one while the copy in front of the data reads zero.
 */
function readHeader(r: Reader): Omit<Record_, "path" | "location" | "flags"> & { offset: number } {
  const offset = r.u64();
  const compressed = r.u64();
  const uncompressed = r.u64();
  const method = r.u32();
  r.skip(20);
  const blockSizes: number[] = [];
  if (method) {
    const n = r.u32();
    for (let i = 0; i < n; i++) {
      const start = r.u64();
      blockSizes.push(r.u64() - start);
    }
  }
  r.skip(1);
  const blockBytes = r.u32();
  return { offset, compressed, uncompressed, method, blockSizes, blockBytes };
}

/**
 * The index of a pak older than version 10: the mount point, a count, and then
 * every file's name followed by its whole header. No hashes, no directory
 * tree, nothing to keep in step — which is why this one can be rebuilt exactly.
 */
function parseLegacyIndex(pak: Uint8Array, indexOffset: number): { mount: string; records: Record_[] } {
  const r = new Reader(pak);
  r.at = indexOffset;
  const mount = r.str();
  const count = r.u32();
  const records: Record_[] = [];
  for (let i = 0; i < count; i++) {
    const path = r.str();
    const location = r.at - indexOffset;
    const h = readHeader(r);
    records.push({ path, location, flags: 0, ...h });
  }
  return { mount, records };
}

function parse(pak: Uint8Array): Parsed {
  const { magicAt, size: footerSize } = findFooter(pak);
  if (pak[magicAt - 1] !== 0) {
    throw new Error(
      "فهرس هذه الحاوية مشفَّر (AES) — لا يمكن قراءة أسماء ملفّاتها بلا مفتاح التشفير"
    );
  }
  const f = new Reader(pak);
  f.at = magicAt + 4;
  const version = f.u32();
  const indexOffset = f.u64();
  const indexSize = f.u64();

  if (version < FIRST_SPLIT_INDEX_VERSION) {
    const { mount, records } = parseLegacyIndex(pak, indexOffset);
    return {
      magicAt, footerSize, version, legacy: true, indexOffset, indexSize, mount,
      seed: 0, pathHashOffset: 0, pathHashSize: 0, dirOffset: 0, dirSize: 0, records,
    };
  }

  const r = new Reader(pak);
  r.at = indexOffset;
  const mount = r.str();
  const count = r.u32();
  const seed = r.u64();
  let pathHashOffset = 0, pathHashSize = 0, dirOffset = 0, dirSize = 0;
  if (r.u32()) { pathHashOffset = r.u64(); pathHashSize = r.u64(); r.skip(20); }
  if (r.u32()) { dirOffset = r.u64(); dirSize = r.u64(); r.skip(20); }
  const encodedSize = r.u32();
  const encodedAt = r.at;
  r.skip(encodedSize);
  const notEncoded = r.u32();
  if (notEncoded !== 0) {
    throw new Error("هذه الحاوية تحمل مداخل غير مُرمَّزة، وهي حالةٌ لم تُقَس");
  }

  // directory index: directory name, then its files and where each record is
  const d = new Reader(pak);
  d.at = dirOffset;
  const dirs = d.u32();
  const found: { path: string; location: number }[] = [];
  for (let i = 0; i < dirs; i++) {
    const dir = d.str();
    const files = d.u32();
    for (let j = 0; j < files; j++) {
      const name = d.str();
      found.push({ path: (dir === "/" ? "" : dir) + name, location: d.u32() });
    }
  }
  if (found.length !== count) {
    throw new Error(`الفهرس يعد ${count} ملفاً والمجلّدات تعطي ${found.length}`);
  }

  const records = found.map(({ path, location }) => {
    const e = new Reader(pak);
    e.at = encodedAt + location;
    const flags = e.u32();
    const method = (flags >>> 23) & 0x3f;
    const blocks = (flags >>> 6) & 0xffff;
    const offset = e.u32();
    const uncompressed = e.u32();
    const compressed = method ? e.u32() : uncompressed;
    const blockSizes: number[] = [];
    if (blocks > 1) for (let i = 0; i < blocks; i++) blockSizes.push(e.u32());
    // The block size in bytes is only reliable in the entry's own header.
    const h = new Reader(pak);
    h.at = offset + 8 + 8 + 8 + 4 + 20;
    let blockBytes = 0;
    if (method) {
      const n = h.u32();
      h.skip(n * 16);
      h.skip(1);
      blockBytes = h.u32();
    }
    return { path, location, flags, offset, uncompressed, compressed, blockSizes, method, blockBytes };
  });

  return { magicAt, footerSize, version, legacy: false, indexOffset, indexSize, mount, seed,
    pathHashOffset, pathHashSize, dirOffset, dirSize, records };
}

/** Every file inside the pak, decompressed. */
export function readDragonSwordPak(pak: Uint8Array): DsPakEntry[] {
  const { records } = parse(pak);
  return records.map((rec) => {
    if (!rec.method) {
      const start = rec.offset + headerSize(0, 0);
      return { path: rec.path, data: pak.subarray(start, start + rec.uncompressed) };
    }
    const h = new Reader(pak);
    h.at = rec.offset + 8 + 8 + 8 + 4 + 20;
    const n = h.u32();
    const out = new Uint8Array(rec.uncompressed);
    let written = 0;
    for (let i = 0; i < n; i++) {
      const start = h.u64(), end = h.u64();
      const piece = inflate(pak.subarray(rec.offset + start, rec.offset + end));
      out.set(piece, written);
      written += piece.length;
    }
    if (written !== rec.uncompressed) {
      throw new Error(`«${rec.path}» فُكّ إلى ${written} بايتاً والمنتظر ${rec.uncompressed}`);
    }
    return { path: rec.path, data: out };
  });
}

function headerSize(blocks: number, method: number): number {
  return 8 + 8 + 8 + 4 + 20 + (method ? 4 + blocks * 16 : 0) + 1 + 4;
}

/** SHA-1, written out because the browser's own is a promise and this is not. */
function sha1(data: Uint8Array): Uint8Array {
  const ml = data.length;
  const withPad = new Uint8Array((((ml + 8) >> 6) + 1) << 6);
  withPad.set(data);
  withPad[ml] = 0x80;
  new DataView(withPad.buffer).setUint32(withPad.length - 4, ml << 3, false);
  new DataView(withPad.buffer).setUint32(withPad.length - 8, Math.floor(ml / 536870912), false);
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  const view = new DataView(withPad.buffer);
  for (let i = 0; i < withPad.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4, false);
    for (let j = 16; j < 80; j++) {
      const n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = (n << 1) | (n >>> 31);
    }
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let j = 0; j < 80; j++) {
      const [f, k] =
        j < 20 ? [(b & c) | (~b & d), 0x5a827999] :
        j < 40 ? [b ^ c ^ d, 0x6ed9eba1] :
        j < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] :
                 [b ^ c ^ d, 0xca62c1d6];
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h, false));
  return out;
}

class Writer {
  private parts: Uint8Array[] = [];
  length = 0;
  push(b: Uint8Array) { this.parts.push(b); this.length += b.length; }
  u32(x: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, x >>> 0, true); this.push(b); }
  u64(x: number) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(x), true); this.push(b); }
  u8(x: number) { this.push(Uint8Array.of(x)); }
  str(s: string) {
    const b = new TextEncoder().encode(s + "\0");
    this.u32(b.length);
    this.push(b);
  }
  done(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const p of this.parts) { out.set(p, at); at += p.length; }
    return out;
  }
}

interface Rebuilt {
  rec: Record_;
  offset: number;
  compressed: number;
  uncompressed: number;
  blockSizes: number[];
  /** SHA-1 of the bytes as stored, computed once while writing them. */
  hash: Uint8Array;
}

/**
 * One entry header. `at` is what goes in the offset field: zero for the copy
 * in front of the data, the real position for the copy inside a legacy index.
 * Everything else is identical between the two copies.
 */
function entryHeader(e: {
  compressed: number;
  uncompressed: number;
  method: number;
  blockSizes: number[];
  blockBytes: number;
  hash: Uint8Array;
}, at: number): Uint8Array {
  const h = new Writer();
  h.u64(at); h.u64(e.compressed); h.u64(e.uncompressed);
  h.u32(e.method); h.push(e.hash);
  if (e.method) {
    h.u32(e.blockSizes.length);
    let cursor = headerSize(e.blockSizes.length, e.method);
    for (const n of e.blockSizes) { h.u64(cursor); h.u64(cursor + n); cursor += n; }
  }
  h.u8(0); h.u32(e.blockBytes);
  return h.done();
}

/** The footer, which is the same shape whichever index came before it. */
function footerFor(pak: Uint8Array, p: Parsed, indexOffset: number, index: Uint8Array): Uint8Array {
  const f = new Writer();
  f.push(new Uint8Array(16));
  f.u8(0);
  f.u32(FOOTER_MAGIC);
  f.u32(p.version);
  f.u64(indexOffset);
  f.u64(index.length);
  f.push(sha1(index));
  // The compression-method names are carried across rather than written: their
  // count is what sets the footer's size, and the version stamped in the file
  // does not reliably say which count this pak uses.
  f.push(pak.subarray(p.magicAt + 4 + 4 + 8 + 8 + 20, p.magicAt + p.footerSize));
  return f.done();
}

/**
 * Rebuilds a pak older than version 10, whose index holds each file's name and
 * whole header in one run. There is no hash index and no directory tree to
 * keep in step, so this path can put the file back exactly as it was.
 */
function writeLegacy(pak: Uint8Array, p: Parsed, body: Uint8Array, rebuilt: Rebuilt[]): Uint8Array {
  const index = new Writer();
  index.str(p.mount);
  index.u32(rebuilt.length);
  for (const r of rebuilt) {
    index.str(r.rec.path);
    // The offset field here is the real one; the copy in front of the data
    // reads zero. Everything else, hash included, is the same header.
    index.push(entryHeader({ ...r, method: r.rec.method, blockBytes: r.rec.blockBytes }, r.offset));
  }
  const built = index.done();
  return concat([body, built, footerFor(pak, p, body.length, built)]);
}

/**
 * Writes the pak back with some files replaced.
 *
 * Everything the game reads is rebuilt from the same numbers: the entry
 * headers, the packed records, the two indexes and the footer. The paths, the
 * mount point, the file order, the compression method and the block size are
 * carried across from the file that came in — a rebuild is not a chance to
 * change any of them.
 */
export function writeDragonSwordPak(
  pak: Uint8Array,
  replace: Record<string, Uint8Array>
): Uint8Array {
  const p = parse(pak);
  const body = new Writer();

  // Read every file once. The old code re-read the whole pak per entry, which
  // is fine for four files and quadratic for thirty-four.
  const source = new Map(readDragonSwordPak(pak).map((e) => [e.path, e.data]));

  /**
   * The data is laid out in the order it was laid out in, not in index order.
   * A pak's index does not have to list files in the order they sit on disk —
   * the Arabic mod's does not — and rebuilding in index order would move every
   * byte for nothing, which costs an untouched rebuild its byte-for-byte match.
   */
  const built = new Map<string, Omit<Rebuilt, "rec">>();
  for (const rec of [...p.records].sort((a, b) => a.offset - b.offset)) {
    const data = replace[rec.path] ?? source.get(rec.path);
    if (!data) throw new Error(`«${rec.path}» غير موجود في الحاوية`);
    const offset = body.length;
    let stored = data;
    let blockSizes: number[] = [];
    if (rec.method) {
      const per = rec.blockBytes;
      const chunks: Uint8Array[] = [];
      for (let at = 0; at < data.length; at += per) {
        chunks.push(deflate(data.subarray(at, Math.min(at + per, data.length))));
      }
      if (chunks.length === 0) chunks.push(deflate(new Uint8Array(0)));
      stored = concat(chunks);
      blockSizes = chunks.map((c) => c.length);
    }
    const entry = {
      offset, compressed: stored.length, uncompressed: data.length,
      blockSizes, hash: sha1(stored),
    };
    body.push(entryHeader({ ...entry, method: rec.method, blockBytes: rec.blockBytes }, 0));
    body.push(stored);
    built.set(rec.path, entry);
  }
  const rebuilt: Rebuilt[] = p.records.map((rec) => ({ rec, ...built.get(rec.path)! }));

  if (p.legacy) return writeLegacy(pak, p, body.done(), rebuilt);

  // the packed records, in the order the directory index lists them
  const enc = new Writer();
  const locations = new Map<string, number>();
  for (const r of rebuilt) {
    locations.set(r.rec.path, enc.length);
    const blocks = r.blockSizes.length || 1;
    const flags =
      ((1 << 31) | (1 << 30) | (1 << 29) |
       (r.rec.method << 23) | (blocks << 6) | (r.rec.flags & 0x3f)) >>> 0;
    enc.u32(flags);
    enc.u32(r.offset);
    enc.u32(r.uncompressed);
    if (r.rec.method) enc.u32(r.compressed);
    if (blocks > 1) for (const n of r.blockSizes) enc.u32(n);
  }
  const encoded = enc.done();

  const indexBase = body.length;
  const index = new Writer();
  index.str(p.mount);
  index.u32(p.records.length);
  index.u64(p.seed);
  const pathHash = rewritePathHash(pak, p, locations);
  const dir = buildDirectoryIndex(p, locations);
  const primarySize = 4 + encodedLead(p.mount) + 4 + 8 + 4 + 8 + 8 + 20 + 4 + 8 + 8 + 20 + 4 + encoded.length + 4;
  index.u32(1);
  index.u64(indexBase + primarySize);
  index.u64(pathHash.length);
  index.push(sha1(pathHash));
  index.u32(1);
  index.u64(indexBase + primarySize + pathHash.length);
  index.u64(dir.length);
  index.push(sha1(dir));
  index.u32(encoded.length);
  index.push(encoded);
  index.u32(0);
  const primary = index.done();
  if (primary.length !== primarySize) {
    throw new Error(`حساب حجم الفهرس ${primarySize} والناتج ${primary.length}`);
  }

  return concat([body.done(), primary, pathHash, dir, footerFor(pak, p, indexBase, primary)]);
}

/** How many bytes `Writer.str` will spend on the mount point. */
function encodedLead(mount: string): number {
  return new TextEncoder().encode(mount + "\0").length;
}

function readOne(pak: Uint8Array, rec: Record_): Uint8Array {
  const all = readDragonSwordPak(pak);
  const hit = all.find((e) => e.path === rec.path);
  if (!hit) throw new Error(`«${rec.path}» غير موجود في الحاوية`);
  return hit.data;
}

/** The hashes are of paths, which do not change — only where they point does. */
function rewritePathHash(pak: Uint8Array, p: Parsed, locations: Map<string, number>): Uint8Array {
  const blob = pak.slice(p.pathHashOffset, p.pathHashOffset + p.pathHashSize);
  const v = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const n = v.getUint32(0, true);
  const oldToNew = new Map<number, number>();
  for (const rec of p.records) oldToNew.set(rec.location, locations.get(rec.path)!);
  for (let i = 0; i < n; i++) {
    const at = 4 + i * 12 + 8;
    const was = v.getUint32(at, true);
    const now = oldToNew.get(was);
    if (now === undefined) throw new Error(`فهرس المسارات يشير إلى سجلٍّ لا أعرفه (${was})`);
    v.setUint32(at, now, true);
  }
  return blob;
}

function buildDirectoryIndex(p: Parsed, locations: Map<string, number>): Uint8Array {
  const byDir = new Map<string, { name: string; path: string }[]>();
  for (const rec of p.records) {
    const cut = rec.path.lastIndexOf("/");
    const dir = cut < 0 ? "/" : rec.path.slice(0, cut + 1);
    const name = cut < 0 ? rec.path : rec.path.slice(cut + 1);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push({ name, path: rec.path });
  }
  const w = new Writer();
  w.u32(byDir.size);
  for (const [dir, files] of byDir) {
    w.str(dir);
    w.u32(files.length);
    for (const f of files) { w.str(f.name); w.u32(locations.get(f.path)!); }
  }
  return w.done();
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
