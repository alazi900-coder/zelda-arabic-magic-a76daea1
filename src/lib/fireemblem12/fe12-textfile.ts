/**
 * Fire Emblem 12's text-resource format — verified byte-for-byte against
 * four different real files this session (m/System, m/Menu, m/MM,
 * m/PlayerMake): a no-op parse→build round trip reproduced every one of
 * them exactly.
 *
 *   header (0x20 bytes): u32 totalSize, u32 tableRelOffset (relative to the
 *     header base, 0x20), u32 reserved, u32 recordCount, 16 reserved bytes
 *   text blob: 0x20 .. tableAbs — NUL-terminated display strings, packed
 *     back to back
 *   table: recordCount × (u32 textOffset, u32 keyOffset) — textOffset is
 *     relative to the header base; keyOffset is relative to the key blob
 *   key blob: tableAbs + recordCount*8 .. EOF — NUL-terminated ID keys
 *     (MPID_ANNA, MMMH_ROOKIE, …). The engine falls back to printing one of
 *     these raw when a text lookup fails — which is exactly the corruption
 *     seen this session when a file was relocated in the ROM, so they must
 *     survive a rebuild completely untouched.
 */

const HEADER_BASE = 0x20;
const textDecoder = new TextDecoder("latin1");

export interface Fe12TextRecord {
  index: number;
  key: string;
  text: string;
  textOffset: number;
  keyOffset: number;
}

export interface Fe12TextFile {
  totalSize: number;
  reserved: number;
  records: Fe12TextRecord[];
  keyBlob: Uint8Array;
}

function readCString(data: Uint8Array, base: number, offset: number): string {
  let end = base + offset;
  while (end < data.length && data[end] !== 0) end++;
  return textDecoder.decode(data.subarray(base + offset, end));
}

export function parseFe12TextFile(data: Uint8Array): Fe12TextFile {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const totalSize = view.getUint32(0, true);
  const tableRelOffset = view.getUint32(4, true);
  const reserved = view.getUint32(8, true);
  const recordCount = view.getUint32(12, true);
  if (totalSize !== data.length) throw new Error(`totalSize بالترويسة (${totalSize}) لا يطابق طول الملفّ الفعلي (${data.length}).`);

  const tableAbs = HEADER_BASE + tableRelOffset;
  const keyBlobStart = tableAbs + recordCount * 8;
  if (keyBlobStart > data.length) throw new Error("عدد السجلّات يتجاوز نهاية الملفّ.");

  const records: Fe12TextRecord[] = [];
  for (let i = 0; i < recordCount; i++) {
    const textOffset = view.getUint32(tableAbs + i * 8, true);
    const keyOffset = view.getUint32(tableAbs + i * 8 + 4, true);
    records.push({
      index: i,
      key: readCString(data, keyBlobStart, keyOffset),
      text: readCString(data, HEADER_BASE, textOffset),
      textOffset,
      keyOffset,
    });
  }

  return { totalSize, reserved, records, keyBlob: data.subarray(keyBlobStart) };
}

/**
 * Rebuilds the file from parsed records, allowing replacement text of any
 * length. Strings are re-emitted in the order the original file stored them
 * (by textOffset), and records that originally shared one offset (repeated
 * text) keep sharing it — so a no-op rebuild reproduces the source exactly.
 * `keyOffset`s are untouched: they index into the key blob's own start, so
 * they stay correct regardless of how much the text blob grows or shrinks.
 */
export function buildFe12TextFile(parsed: Fe12TextFile, replacements: Map<number, string> = new Map()): Uint8Array {
  const order = [...parsed.records].sort((a, b) => a.textOffset - b.textOffset);
  const newOffsetForOld = new Map<number, number>();
  const chunks: Uint8Array[] = [];
  let cursor = 0;
  for (const record of order) {
    if (newOffsetForOld.has(record.textOffset)) continue;
    const text = replacements.get(record.index) ?? record.text;
    // latin1 code points 0x80-0xff (used for the FE12 charmap's 2-byte
    // Shift-JIS codes) must round-trip as single bytes, not UTF-8 pairs,
    // so this maps char codes directly rather than using TextEncoder.
    const encoded = new Uint8Array(text.length + 1);
    for (let i = 0; i < text.length; i++) encoded[i] = text.charCodeAt(i) & 0xff;
    encoded[text.length] = 0;
    newOffsetForOld.set(record.textOffset, cursor);
    chunks.push(encoded);
    cursor += encoded.length;
  }
  const textBlobLength = cursor;
  const padding = (4 - (textBlobLength % 4)) % 4;

  const table = new Uint8Array(parsed.records.length * 8);
  const tableView = new DataView(table.buffer);
  parsed.records.forEach((record, i) => {
    tableView.setUint32(i * 8, newOffsetForOld.get(record.textOffset)!, true);
    tableView.setUint32(i * 8 + 4, record.keyOffset, true);
  });

  const tableRelOffset = textBlobLength + padding;
  const totalSize = HEADER_BASE + tableRelOffset + table.length + parsed.keyBlob.length;
  const header = new Uint8Array(HEADER_BASE);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, totalSize, true);
  headerView.setUint32(4, tableRelOffset, true);
  headerView.setUint32(8, parsed.reserved, true);
  headerView.setUint32(12, parsed.records.length, true);

  const out = new Uint8Array(totalSize);
  let pos = 0;
  out.set(header, pos); pos += header.length;
  for (const chunk of chunks) { out.set(chunk, pos); pos += chunk.length; }
  pos += padding;
  out.set(table, pos); pos += table.length;
  out.set(parsed.keyBlob, pos);
  return out;
}

/**
 * Encodes replacement text using latin1 semantics: each JS char code
 * (0x00-0xff) becomes exactly one output byte. Used by the caller when
 * building a replacement string from raw FE12 charmap byte pairs, since
 * `buildFe12TextFile` re-derives length from `.length`, not UTF-8 byte size.
 */
export function fe12StringFromBytes(bytes: number[]): string {
  return bytes.map((b) => String.fromCharCode(b & 0xff)).join("");
}
