/**
 * BMG ("MESGbmg1") — Nintendo's standard message-table format, used here by
 * Phantom Hourglass for every dialogue file under `English/Message/*.bmg`
 * (32 files, confirmed this session against the real extracted ROM).
 *
 * Layout (little-endian), confirmed byte-for-byte against real files:
 *   header: "MESGbmg1"(8) + fileSize(u32) + sectionCount(u32) + 16 more
 *           bytes (byte 0 of which is an encoding marker; 0x02 = UTF-16,
 *           the only value seen in this game) = 32 bytes total
 *   INF1:   magic(4)+size(4)+entryCount(u16)+entrySize(u16)+4 unknown bytes
 *           (always zero here), then `entryCount` entries of `entrySize`
 *           bytes each — for this game entrySize is always 8: a u32 byte
 *           offset into DAT1's body, then 4 bytes of opaque per-message
 *           attributes (sound/box-type flags) this module never interprets,
 *           just carries through unchanged.
 *   DAT1:   magic(4)+size(4)+body — the body is a run of UTF-16LE strings,
 *           each null-terminated (U+0000), addressed by each INF1 entry's
 *           offset. Multiple entries can point at the same offset (a
 *           shared/deduplicated string).
 *   FLW1, FLI1: dialogue branching/flow-control data (choice prompts,
 *           flags). Never touched — copied verbatim. They reference
 *           messages by INF1 index, not by DAT1 byte offset, so they stay
 *           valid as long as this module never changes entryCount.
 *
 * Some messages embed BMG escape sequences (control code 0x1A and a few
 * others, e.g. for inserting the player's name or a button icon) — this
 * module refuses to touch any message containing one (see `hasControlCode`
 * on `BmgMessage`), the same conservative stance this project already takes
 * for Fire Emblem 12's own text wrappers: leaving a line untranslated is
 * far better than silently corrupting a control sequence this module
 * doesn't parse.
 */

function readCstr16(data: Uint8Array, start: number): { text: string; endExclusive: number } {
  let end = start;
  while (end + 1 < data.length && !(data[end] === 0 && data[end + 1] === 0)) end += 2;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let text = "";
  for (let i = start; i < end; i += 2) text += String.fromCharCode(view.getUint16(i, true));
  return { text, endExclusive: end + 2 }; // include the null terminator
}

export interface BmgMessage {
  /** original byte offset into DAT1's body — shared by every entry that
   * pointed at the same offset (a deduplicated string) */
  offset: number;
  /** opaque per-entry attribute bytes, carried through unchanged */
  attrs: Uint8Array;
  text: string;
  hasControlCode: boolean;
}

export interface BmgFile {
  encodingByte: number;
  /** one per INF1 entry, in original order — several can share `offset` */
  messages: BmgMessage[];
  /** raw bytes of DAT1's body up to the first referenced offset (BMG files
   * seen this session reserve a leading empty string there); preserved
   * verbatim as the new DAT1's own prefix */
  dat1Prefix: Uint8Array;
  /** DAT1's full original body, byte-for-byte — kept so untranslated
   * messages can be re-emitted from their real bytes instead of from
   * `text`, which `readCstr16` can truncate early (see `hasControlCode`
   * messages: some embed a literal null code unit as an escape parameter,
   * not a terminator). */
  dat1Body: Uint8Array;
  flw1: Uint8Array;
  fli1: Uint8Array;
}

function hasControlCode(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 && code !== 0x0a && code !== 0x0d && code !== 0x09) return true;
  }
  return false;
}

export function parseBmg(data: Uint8Array): BmgFile {
  if (data.length < 32 || String.fromCharCode(...data.subarray(0, 8)) !== "MESGbmg1") {
    throw new Error('ليس ملف BMG (لا يبدأ بـ "MESGbmg1")');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const encodingByte = data[16];

  const sections = new Map<string, { offset: number; size: number }>();
  let off = 0x20;
  while (off < data.length) {
    const magic = String.fromCharCode(...data.subarray(off, off + 4));
    const size = view.getUint32(off + 4, true);
    if (size < 8) break; // malformed/padding — stop rather than loop forever
    sections.set(magic, { offset: off, size });
    off += size;
  }
  const inf1 = sections.get("INF1");
  const dat1 = sections.get("DAT1");
  const flw1 = sections.get("FLW1");
  const fli1 = sections.get("FLI1");
  if (!inf1 || !dat1) throw new Error("ملف BMG ناقص (لا يحوي INF1 أو DAT1)");

  const entryCount = view.getUint16(inf1.offset + 8, true);
  const entrySize = view.getUint16(inf1.offset + 10, true);
  const entriesStart = inf1.offset + 16;
  const dat1Body = dat1.offset + 8;

  const messages: BmgMessage[] = [];
  let minOffset = dat1.size - 8;
  for (let i = 0; i < entryCount; i++) {
    const e = entriesStart + i * entrySize;
    const strOffset = view.getUint32(e, true);
    const attrs = data.slice(e + 4, e + entrySize);
    const { text } = readCstr16(data, dat1Body + strOffset);
    messages.push({ offset: strOffset, attrs, text, hasControlCode: hasControlCode(text) });
    minOffset = Math.min(minOffset, strOffset);
  }

  return {
    encodingByte,
    messages,
    dat1Prefix: data.slice(dat1Body, dat1Body + Math.max(0, minOffset)),
    dat1Body: data.slice(dat1Body, dat1.offset + dat1.size),
    flw1: flw1 ? data.slice(flw1.offset, flw1.offset + flw1.size) : new Uint8Array(0),
    fli1: fli1 ? data.slice(fli1.offset, fli1.offset + fli1.size) : new Uint8Array(0),
  };
}

/** Rebuilds a BMG file, replacing message text via `replacements` (keyed by
 * each message's index in `bmg.messages`, in the same order `parseBmg`
 * returned them). Messages not present in `replacements` keep their
 * original text. INF1's entry count/size never change — only each entry's
 * DAT1 offset is recomputed, and DAT1 itself is rebuilt from scratch. */
export function buildBmg(bmg: BmgFile, replacements: Map<number, string>): Uint8Array {
  const entrySize = 4 + (bmg.messages[0]?.attrs.length ?? 4);
  const encoder = (text: string): Uint8Array => {
    const out = new Uint8Array(text.length * 2 + 2); // +2 for the null terminator
    const view = new DataView(out.buffer);
    for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true);
    return out;
  };

  // Rebuild DAT1: prefix verbatim, then one entry per UNIQUE original offset
  // (so messages that shared a string still share it after rebuilding,
  // matching the source file's own convention rather than duplicating it).
  // Sorted so each untranslated message's *original* byte range (offset up
  // to the next message's offset) can be sliced straight out of the real
  // DAT1 body — not re-encoded from `text`, which `readCstr16` can cut short
  // for messages that embed a null code unit as an escape parameter rather
  // than a terminator (e.g. this game's Yes/No choice prompts). Re-encoding
  // that truncated text would silently corrupt the message on disk, even
  // though it was never touched for translation.
  const uniqueOffsets = [...new Set(bmg.messages.map((m) => m.offset))].sort((a, b) => a - b);
  const newOffsetOf = new Map<number, number>();
  const dat1Chunks: Uint8Array[] = [bmg.dat1Prefix];
  let cursor = bmg.dat1Prefix.length;
  uniqueOffsets.forEach((offset, i) => {
    const firstIdx = bmg.messages.findIndex((m) => m.offset === offset);
    const translation = replacements.get(firstIdx);
    const bytes =
      translation !== undefined
        ? encoder(translation)
        : bmg.dat1Body.slice(offset, uniqueOffsets[i + 1] ?? bmg.dat1Body.length);
    newOffsetOf.set(offset, cursor);
    dat1Chunks.push(bytes);
    cursor += bytes.length;
  });
  const dat1Body = new Uint8Array(cursor);
  { let o = 0; for (const c of dat1Chunks) { dat1Body.set(c, o); o += c.length; } }
  const dat1BodyPadded = pad4(dat1Body);
  const dat1Chunk = new Uint8Array(8 + dat1BodyPadded.length);
  dat1Chunk.set(new TextEncoder().encode("DAT1"), 0);
  new DataView(dat1Chunk.buffer).setUint32(4, dat1Chunk.length, true);
  dat1Chunk.set(dat1BodyPadded, 8);

  // Rebuild INF1 with the same entry count/size, new offsets.
  const inf1HeaderSize = 16;
  const inf1Total = inf1HeaderSize + bmg.messages.length * entrySize;
  const inf1Chunk = new Uint8Array(inf1Total);
  inf1Chunk.set(new TextEncoder().encode("INF1"), 0);
  const iv = new DataView(inf1Chunk.buffer);
  iv.setUint32(4, inf1Total, true);
  iv.setUint16(8, bmg.messages.length, true);
  iv.setUint16(10, entrySize, true);
  bmg.messages.forEach((m, i) => {
    const e = inf1HeaderSize + i * entrySize;
    iv.setUint32(e, newOffsetOf.get(m.offset)!, true);
    inf1Chunk.set(m.attrs, e + 4);
  });

  const flw1Padded = pad4(bmg.flw1);
  const fli1Padded = pad4(bmg.fli1);

  const sectionCount = (bmg.flw1.length > 0 ? 1 : 0) + (bmg.fli1.length > 0 ? 1 : 0) + 2;
  const total = 32 + inf1Chunk.length + dat1Chunk.length + flw1Padded.length + fli1Padded.length;
  const out = new Uint8Array(total);
  out.set(new TextEncoder().encode("MESGbmg1"), 0);
  const ov = new DataView(out.buffer);
  ov.setUint32(8, total, true);
  ov.setUint32(12, sectionCount, true);
  out[16] = bmg.encodingByte;

  let o = 32;
  out.set(inf1Chunk, o); o += inf1Chunk.length;
  out.set(dat1Chunk, o); o += dat1Chunk.length;
  out.set(flw1Padded, o); o += flw1Padded.length;
  out.set(fli1Padded, o); o += fli1Padded.length;

  return out;
}

function pad4(bytes: Uint8Array): Uint8Array {
  const padded = new Uint8Array((bytes.length + 3) & ~3);
  padded.set(bytes);
  return padded;
}
