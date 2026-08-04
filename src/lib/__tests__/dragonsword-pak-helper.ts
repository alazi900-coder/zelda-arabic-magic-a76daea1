import { deflate } from "pako";
import { createHash } from "node:crypto";

/** Real SHA-1, because the writer computes one and the two must agree. */
function sha1(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha1").update(data).digest());
}

/**
 * A pak built by hand, to the same layout the shipped `DragonSword_IT.pak`
 * uses — entry headers in front of their data, then the packed records, the
 * path hash index, the directory index and the 221-byte footer.
 *
 * Written out rather than shipped as a fixture because the real file is 1.9 MB
 * and holds the game's whole script. The numbers here were read off that file:
 * mount point, zlib as the compression method, 64 KB blocks, and a directory
 * index that carries the paths while the hash index only carries locations.
 */
const BLOCK = 0x10000;
const METHOD_ZLIB = 1;

function u32(x: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, x >>> 0, true);
  return b;
}
function u64(x: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(x), true);
  return b;
}
function fstr(s: string): Uint8Array {
  const b = new TextEncoder().encode(`${s}\0`);
  return join([u32(b.length), b]);
}
function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export interface PakFile {
  path: string;
  data: Uint8Array;
  /** Uncompressed entries exist in real paks too, so both paths are covered. */
  compressed?: boolean;
}

export function makePak(files: PakFile[], mount = "../../../DragonSword/Content/Localization/"): Uint8Array {
  const bodyParts: Uint8Array[] = [];
  const records: { path: string; offset: number; flags: number; uncompressed: number; compressed: number; blocks: number[] }[] = [];
  let bodyLength = 0;

  for (const file of files) {
    const offset = bodyLength;
    if (file.compressed === false) {
      const head = join([
        u64(0), u64(file.data.length), u64(file.data.length),
        u32(0), new Uint8Array(20), Uint8Array.of(0), u32(0),
      ]);
      bodyParts.push(head, file.data);
      bodyLength += head.length + file.data.length;
      records.push({
        path: file.path, offset,
        flags: ((1 << 31) | (1 << 30) | (1 << 29) | (1 << 6)) >>> 0,
        uncompressed: file.data.length, compressed: file.data.length, blocks: [],
      });
      continue;
    }
    const chunks: Uint8Array[] = [];
    for (let at = 0; at < file.data.length; at += BLOCK) {
      chunks.push(deflate(file.data.subarray(at, Math.min(at + BLOCK, file.data.length))));
    }
    if (chunks.length === 0) chunks.push(deflate(new Uint8Array(0)));
    const packed = join(chunks);
    const headSize = 8 + 8 + 8 + 4 + 20 + 4 + chunks.length * 16 + 1 + 4;
    const blockTable: Uint8Array[] = [];
    let at = headSize;
    for (const c of chunks) {
      blockTable.push(u64(at), u64(at + c.length));
      at += c.length;
    }
    const head = join([
      u64(0), u64(packed.length), u64(file.data.length),
      u32(METHOD_ZLIB), new Uint8Array(20), u32(chunks.length),
      ...blockTable, Uint8Array.of(0), u32(BLOCK),
    ]);
      bodyParts.push(head, packed);
    bodyLength += head.length + packed.length;
    records.push({
      path: file.path, offset,
      flags: ((1 << 31) | (1 << 30) | (1 << 29) |
        (METHOD_ZLIB << 23) | (chunks.length << 6) | (BLOCK / 2048)) >>> 0,
      uncompressed: file.data.length, compressed: packed.length,
      blocks: chunks.length > 1 ? chunks.map((c) => c.length) : [],
    });
  }

  const encodedParts: Uint8Array[] = [];
  const locations = new Map<string, number>();
  let encodedLength = 0;
  for (const rec of records) {
    locations.set(rec.path, encodedLength);
    const one = join([
      u32(rec.flags), u32(rec.offset), u32(rec.uncompressed),
      ...(rec.flags & (0x3f << 23) ? [u32(rec.compressed)] : []),
      ...rec.blocks.map((n) => u32(n)),
    ]);
    encodedParts.push(one);
    encodedLength += one.length;
  }
  const encoded = join(encodedParts);

  // path hash index: a count, then eight bytes of hash and the record location
  const hashParts: Uint8Array[] = [u32(records.length)];
  for (const rec of records) hashParts.push(new Uint8Array(8), u32(locations.get(rec.path)!));
  const pathHash = join(hashParts);

  const byDir = new Map<string, PakFile[]>();
  for (const file of files) {
    const cut = file.path.lastIndexOf("/");
    const dir = cut < 0 ? "/" : file.path.slice(0, cut + 1);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(file);
  }
  const dirParts: Uint8Array[] = [u32(byDir.size)];
  for (const [dir, inDir] of byDir) {
    dirParts.push(fstr(dir), u32(inDir.length));
    for (const f of inDir) {
      const cut = f.path.lastIndexOf("/");
      dirParts.push(fstr(cut < 0 ? f.path : f.path.slice(cut + 1)), u32(locations.get(f.path)!));
    }
  }
  const dir = join(dirParts);

  const body = join(bodyParts);
  const indexBase = body.length;
  const mountBytes = fstr(mount);
  const primarySize =
    mountBytes.length + 4 + 8 + 4 + 8 + 8 + 20 + 4 + 8 + 8 + 20 + 4 + encoded.length + 4;
  const primary = join([
    mountBytes, u32(records.length), u64(0x1234),
    u32(1), u64(indexBase + primarySize), u64(pathHash.length), new Uint8Array(20),
    u32(1), u64(indexBase + primarySize + pathHash.length), u64(dir.length), new Uint8Array(20),
    u32(encoded.length), encoded, u32(0),
  ]);

  const footer = join([
    new Uint8Array(16), Uint8Array.of(0),
    u32(0x5a6f12e1), u32(11), u64(indexBase), u64(primary.length),
    new Uint8Array(20), new Uint8Array(32 * 5),
  ]);

  return join([body, primary, pathHash, dir, footer]);
}


/**
 * A pak in the layout used before version 10, which is what the Arabic mod
 * pak ships: no hash index, no directory tree — the index simply names each
 * file and repeats its whole header, with the real offset in it while the copy
 * in front of the data reads zero.
 *
 * `encrypted` stamps the index-encrypted flag without encrypting anything,
 * which is enough to check that such a pak is refused with a reason rather
 * than parsed into nonsense.
 */
export function makeLegacyPak(
  files: PakFile[],
  { mount = "../../../", version = 8, encrypted = false, methodNames = 5 } = {}
): Uint8Array {
  const bodyParts: Uint8Array[] = [];
  const headers: { path: string; offset: number; header: (at: number) => Uint8Array }[] = [];
  let bodyLength = 0;

  for (const file of files) {
    const offset = bodyLength;
    if (file.compressed === false || file.compressed === undefined) {
      const hash = sha1(file.data);
      const header = (at: number) =>
        join([u64(at), u64(file.data.length), u64(file.data.length), u32(0),
          hash, Uint8Array.of(0), u32(0)]);
      bodyParts.push(header(0), file.data);
      bodyLength += 53 + file.data.length;
      headers.push({ path: file.path, offset, header });
      continue;
    }
    const chunks: Uint8Array[] = [];
    for (let at = 0; at < file.data.length; at += BLOCK) {
      chunks.push(deflate(file.data.subarray(at, Math.min(at + BLOCK, file.data.length))));
    }
    if (chunks.length === 0) chunks.push(deflate(new Uint8Array(0)));
    const packed = join(chunks);
    const headSize = 8 + 8 + 8 + 4 + 20 + 4 + chunks.length * 16 + 1 + 4;
    const header = (at: number) => {
      const table: Uint8Array[] = [];
      let cursor = headSize;
      for (const c of chunks) {
        table.push(u64(cursor), u64(cursor + c.length));
        cursor += c.length;
      }
      return join([u64(at), u64(packed.length), u64(file.data.length), u32(METHOD_ZLIB),
        sha1(packed), u32(chunks.length), ...table, Uint8Array.of(0), u32(BLOCK)]);
    };
    bodyParts.push(header(0), packed);
    bodyLength += headSize + packed.length;
    headers.push({ path: file.path, offset, header });
  }

  const body = join(bodyParts);
  const index = join([
    fstr(mount), u32(files.length),
    ...headers.flatMap((h) => [fstr(h.path), h.header(h.offset)]),
  ]);
  const footer = join([
    new Uint8Array(16), Uint8Array.of(encrypted ? 1 : 0),
    u32(0x5a6f12e1), u32(version), u64(body.length), u64(index.length),
    sha1(index), new Uint8Array(32 * methodNames),
  ]);
  return join([body, index, footer]);
}
