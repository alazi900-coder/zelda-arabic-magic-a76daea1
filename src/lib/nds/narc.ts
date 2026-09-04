/**
 * NARC — the archive format the DS games keep everything in.
 *
 * Three chunks after a 16-byte header: BTAF is a table of start/end offsets,
 * BTNF names the members (this ROM's message archive leaves it empty, and
 * nothing reads it), GMIF is the bytes those offsets point into.
 *
 * Rebuilding rather than patching in place is deliberate: a translated message
 * archive is a different size from the one it replaces, so every offset after
 * it moves anyway.
 */

const HEADER = 16;

export interface Narc {
  files: Uint8Array[];
  /** BTNF verbatim, so an archive that does name its members keeps them. */
  btnf: Uint8Array;
}

function u16(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8);
}

function u32(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}

function put32(b: Uint8Array, at: number, v: number): void {
  b[at] = v & 0xff;
  b[at + 1] = (v >>> 8) & 0xff;
  b[at + 2] = (v >>> 16) & 0xff;
  b[at + 3] = (v >>> 24) & 0xff;
}

function put16(b: Uint8Array, at: number, v: number): void {
  b[at] = v & 0xff;
  b[at + 1] = (v >>> 8) & 0xff;
}

function ascii(b: Uint8Array, at: number): string {
  return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
}

export function parseNarc(buf: Uint8Array): Narc {
  if (ascii(buf, 0) !== "NARC") throw new Error("ليس أرشيف NARC");
  const sections = new Map<string, { at: number; size: number }>();
  let at = u16(buf, 12);
  for (let i = 0, n = u16(buf, 14); i < n; i++) {
    const size = u32(buf, at + 4);
    sections.set(ascii(buf, at), { at, size });
    at += size;
  }
  const btaf = sections.get("BTAF");
  const btnf = sections.get("BTNF");
  const gmif = sections.get("GMIF");
  if (!btaf || !btnf || !gmif) throw new Error("أرشيف NARC ناقص الأقسام");

  const count = u16(buf, btaf.at + 8);
  const data = gmif.at + 8;
  const files: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const e = btaf.at + 12 + i * 8;
    files.push(buf.subarray(data + u32(buf, e), data + u32(buf, e + 4)));
  }
  return { files, btnf: buf.subarray(btnf.at, btnf.at + btnf.size) };
}

export function buildNarc(narc: Narc): Uint8Array {
  // Members are 4-byte aligned, matching what nitroarc emits; the game reads
  // through the table so the padding is never seen, but keeping the layout
  // identical means an untouched archive rebuilds to the same bytes.
  const align = (n: number) => (n + 3) & ~3;
  const btafSize = 12 + narc.files.length * 8;
  let dataSize = 0;
  const spans = narc.files.map((f) => {
    const start = dataSize;
    dataSize = align(dataSize + f.length);
    return { start, end: start + f.length };
  });

  const gmifSize = 8 + dataSize;
  const total = HEADER + btafSize + narc.btnf.length + gmifSize;
  const out = new Uint8Array(total);

  out.set([0x4e, 0x41, 0x52, 0x43, 0xfe, 0xff, 0x00, 0x01]); // "NARC", BOM, version
  put32(out, 8, total);
  put16(out, 12, HEADER);
  put16(out, 14, 3);

  let at = HEADER;
  out.set([0x42, 0x54, 0x41, 0x46], at);
  put32(out, at + 4, btafSize);
  put16(out, at + 8, narc.files.length);
  put16(out, at + 10, 0);
  spans.forEach((s, i) => {
    put32(out, at + 12 + i * 8, s.start);
    put32(out, at + 16 + i * 8, s.end);
  });

  at += btafSize;
  out.set(narc.btnf, at);

  at += narc.btnf.length;
  out.set([0x47, 0x4d, 0x49, 0x46], at);
  put32(out, at + 4, gmifSize);
  // nitroarc pads the gaps between members with 0xFF, not zero. Matching it is
  // what makes an untouched archive rebuild to the same bytes, which is the
  // check that says the reader and writer agree.
  out.fill(0xff, at + 8, at + gmifSize);
  narc.files.forEach((f, i) => out.set(f, at + 8 + spans[i].start));

  return out;
}
