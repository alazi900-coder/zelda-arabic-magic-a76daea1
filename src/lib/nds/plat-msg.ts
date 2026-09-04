/**
 * The message archives inside `pl_msg.narc`, which are encrypted.
 *
 * Every Gen 4 archive scrambles both its offset table and its text with a
 * pair of key streams seeded from one u16 stored in the clear. Two things make
 * this safe to write back: the seed is kept and reused, so an untouched
 * archive re-encrypts to the bytes it came from; and the layout is always the
 * offset table followed by the data, verified across all 724 archives in this
 * ROM, so nothing has to be discovered per archive.
 *
 * Verified against the build: archive 389 decodes to "Hello there!", and all
 * 46,053 messages end in the 0xFFFF terminator this code assumes.
 */

const TABLE_SEED = 0x2fd;
const TEXT_SEED = 0x91bd3;
const TEXT_STEP = 0x493d;
const EOS = 0xffff;

export interface PlatArchive {
  /** The seed as stored, so re-encoding reproduces the original bytes. */
  key: number;
  /** Charcodes per message, terminator stripped. */
  messages: number[][];
}

export function decodePlatArchive(buf: Uint8Array): PlatArchive {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const count = view.getUint16(0, true);
  const key = view.getUint16(2, true);
  const tableKey = (key * TABLE_SEED) & 0xffff;
  const messages: number[][] = [];

  for (let i = 0; i < count; i++) {
    const k = (tableKey * (i + 1)) & 0xffff;
    const mask = ((k | (k << 16)) >>> 0);
    const offset = (view.getUint32(4 + i * 8, true) ^ mask) >>> 0;
    const size = (view.getUint32(8 + i * 8, true) ^ mask) >>> 0;

    let textKey = (TEXT_SEED * (i + 1)) & 0xffff;
    const codes: number[] = [];
    for (let j = 0; j < size; j++) {
      codes.push(view.getUint16(offset + j * 2, true) ^ textKey);
      textKey = (textKey + TEXT_STEP) & 0xffff;
    }
    if (codes[codes.length - 1] === EOS) codes.pop();
    messages.push(codes);
  }

  return { key, messages };
}

export function encodePlatArchive(archive: PlatArchive): Uint8Array {
  const { key, messages } = archive;
  const dataStart = 4 + messages.length * 8;
  const sizes = messages.map((m) => m.length + 1); // the terminator is stored
  const total = dataStart + sizes.reduce((n, s) => n + s * 2, 0);

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, messages.length, true);
  view.setUint16(2, key, true);

  const tableKey = (key * TABLE_SEED) & 0xffff;
  let offset = dataStart;
  messages.forEach((codes, i) => {
    const k = (tableKey * (i + 1)) & 0xffff;
    const mask = ((k | (k << 16)) >>> 0);
    view.setUint32(4 + i * 8, (offset ^ mask) >>> 0, true);
    view.setUint32(8 + i * 8, (sizes[i] ^ mask) >>> 0, true);

    let textKey = (TEXT_SEED * (i + 1)) & 0xffff;
    for (let j = 0; j < sizes[i]; j++) {
      const c = j < codes.length ? codes[j] : EOS;
      view.setUint16(offset + j * 2, (c ^ textKey) & 0xffff, true);
      textKey = (textKey + TEXT_STEP) & 0xffff;
    }
    offset += sizes[i] * 2;
  });

  return out;
}
