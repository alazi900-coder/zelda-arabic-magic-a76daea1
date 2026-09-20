/**
 * Level-5's `PackNum` archive, which is where Inazuma Eleven keeps its text.
 *
 * A pack is two files: `<name>.pkh` names and locates the entries, `<name>.pkb`
 * holds their bytes. Every entry is an LZ10 stream, and what it decompresses to
 * is a flat list of keyed strings -- the script addresses a line by its key, so
 * keys are not reorderable and a missing one is a line that never prints.
 *
 * Measured against the European ROM (`YEEP`): `script/en/evet` holds 1,737
 * entries and `script/en/mcht` 269, and all 2,006 parse to their declared size
 * exactly, so the layout below is the format and not a guess that happens to
 * work on the first file.
 *
 *   .pkh   0x00  "PackNum 20080626"
 *          0x10  u32  size of this .pkh
 *          0x14  u16  1
 *          0x16  u16  entry count
 *          0x18  u32  16
 *          0x1C  u32  largest compressed entry, rounded up -- see writePack
 *          0x30  entries: u32 id, u32 offset into .pkb, u32 compressed size
 *
 *   entry  u32  total size of everything after this field
 *          records: u16 key, u16 kind, u32 length INCLUDING this 8-byte header,
 *                   then the string, NUL-terminated and padded so length % 4 == 0
 *
 * `kind` is 1 for a line the player reads and 2 for an internal id -- a sound
 * or script name like "J10.SAD" that must not be translated. Higher kinds exist
 * and are left alone for the same reason.
 *
 * A line break is stored as the two characters `\` and `n`, not as 0x0A.
 */
import { compressLz10, decompressLz10 } from "@/lib/fireemblem12/nds-lz";

/** The kind of a record the player actually reads. */
export const INAZUMA_TEXT_KIND = 1;

export interface InazumaString {
  /** The key the script addresses this line by. Never renumbered. */
  key: number;
  kind: number;
  text: string;
}

export interface InazumaEntry {
  id: number;
  strings: InazumaString[];
  /**
   * What this entry decompressed to, kept so writePack can tell an untouched
   * entry from an edited one and re-emit the original compressed bytes for it.
   */
  payload: Uint8Array;
  /** The original compressed bytes, reused whenever the payload is unchanged. */
  compressed: Uint8Array;
}

export interface InazumaPack {
  /** The .pkh up to the entry table, carried through untouched. */
  header: Uint8Array;
  /**
   * How long the .pkh was.
   *
   * The shipped file carries a few bytes of padding past the last entry -- 4 in
   * `evet` and in `mcht`. Nothing here reads them, but a loader that trusts the
   * size it was built against would read past a file that came back shorter, so
   * the length is kept and the rebuild pads out to it.
   */
  pkhLength: number;
  entries: InazumaEntry[];
}

/**
 * Bytes to a string one-to-one, so anything this module did not touch survives.
 *
 * The European text is ASCII, but 163 of evet's entries are untranslated
 * Shift-JIS left over from the Japanese build. Decoding those as UTF-8 would
 * replace every unmapped byte with U+FFFD and lose them on the way back;
 * Latin-1 has no unmapped byte, so a round trip is exact whatever the bytes
 * meant.
 */
function toLatin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function fromLatin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) throw new Error(`الحرف "${text[i]}" خارج نطاق بايت واحد — النصّ العربي يحتاج جدول ترميز اللعبة.`);
    out[i] = code;
  }
  return out;
}

function u16(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8);
}

function u32(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}

function setU16(b: Uint8Array, at: number, v: number): void {
  b[at] = v & 0xff;
  b[at + 1] = (v >>> 8) & 0xff;
}

function setU32(b: Uint8Array, at: number, v: number): void {
  b[at] = v & 0xff;
  b[at + 1] = (v >>> 8) & 0xff;
  b[at + 2] = (v >>> 16) & 0xff;
  b[at + 3] = (v >>> 24) & 0xff;
}

const PACK_MAGIC = "PackNum ";
const ENTRY_TABLE = 0x30;
const ENTRY_SIZE = 12;

export function looksLikeInazumaPack(pkh: Uint8Array): boolean {
  return pkh.length >= ENTRY_TABLE && toLatin1(pkh.subarray(0, 8)) === PACK_MAGIC;
}

/** The strings inside one decompressed entry, in the order the file lists them. */
function readStrings(payload: Uint8Array): InazumaString[] {
  const declared = u32(payload, 0);
  const end = Math.min(payload.length, 4 + declared);
  const strings: InazumaString[] = [];
  let at = 4;
  while (at + 8 <= end) {
    const key = u16(payload, at);
    const kind = u16(payload, at + 2);
    const length = u32(payload, at + 4);
    if (length < 8 || at + length > end) {
      throw new Error(`سجلّ تالف في أرشيف Inazuma عند 0x${at.toString(16)} (الطول ${length}).`);
    }
    // The string ends at its first NUL; the rest of the record is padding that
    // exists only to keep the next record 4-aligned.
    let stop = at + 8;
    while (stop < at + length && payload[stop] !== 0) stop++;
    strings.push({ key, kind, text: toLatin1(payload.subarray(at + 8, stop)) });
    at += length;
  }
  return strings;
}

function writeStrings(strings: InazumaString[]): Uint8Array {
  const records = strings.map((s) => {
    const bytes = fromLatin1(s.text);
    // One NUL is required; the rest rounds the record up to a multiple of four.
    const length = 8 + Math.ceil((bytes.length + 1) / 4) * 4;
    return { s, bytes, length };
  });
  const total = records.reduce((n, r) => n + r.length, 0);
  const out = new Uint8Array(4 + total);
  setU32(out, 0, total);
  let at = 4;
  for (const { s, bytes, length } of records) {
    setU16(out, at, s.key);
    setU16(out, at + 2, s.kind);
    setU32(out, at + 4, length);
    out.set(bytes, at + 8);
    at += length;
  }
  return out;
}

export function readPack(pkh: Uint8Array, pkb: Uint8Array): InazumaPack {
  if (!looksLikeInazumaPack(pkh)) throw new Error("هذا ليس ملف ‎.pkh‎ من نوع PackNum.");
  const count = u16(pkh, 0x16);
  const entries: InazumaEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = ENTRY_TABLE + i * ENTRY_SIZE;
    const id = u32(pkh, at);
    const offset = u32(pkh, at + 4);
    const size = u32(pkh, at + 8);
    const compressed = pkb.subarray(offset, offset + size);
    // Not every entry is a text blob; anything that is not LZ10 is carried
    // through byte for byte rather than guessed at.
    const isLz10 = compressed.length > 4 && compressed[0] === 0x10;
    const payload = isLz10 ? decompressLz10(compressed) : new Uint8Array(0);
    entries.push({
      id,
      strings: isLz10 ? readStrings(payload) : [],
      payload,
      compressed: compressed.slice(),
    });
  }
  return { header: pkh.subarray(0, ENTRY_TABLE).slice(), pkhLength: pkh.length, entries };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The pack back to a .pkh/.pkb pair.
 *
 * An entry whose strings are unchanged re-emits the bytes it came in as, rather
 * than being recompressed: LZ10 has many valid encodings of the same data and
 * only the original one round-trips the file byte for byte, which is what makes
 * "nothing changed" provable rather than asserted.
 *
 * `maxCompressed` is the field at 0x1C, which in all four packs measured tracks
 * the largest compressed entry rounded up to a multiple of 16 -- almost
 * certainly the buffer the loader reads an entry into. It is recomputed here,
 * and `grew` says whether it went past what the game shipped with, because that
 * is the one number a longer translation can push past a limit the ROM set.
 */
export function writePack(pack: InazumaPack): { pkh: Uint8Array; pkb: Uint8Array; grew: boolean } {
  const blobs = pack.entries.map((entry) => {
    if (entry.payload.length === 0) return entry.compressed;
    const rebuilt = writeStrings(entry.strings);
    return sameBytes(rebuilt, entry.payload) ? entry.compressed : compressLz10(rebuilt);
  });

  const pkh = new Uint8Array(Math.max(pack.pkhLength, ENTRY_TABLE + pack.entries.length * ENTRY_SIZE));
  pkh.set(pack.header, 0);
  const pkb = new Uint8Array(blobs.reduce((n, b) => n + b.length, 0));
  let offset = 0;
  for (let i = 0; i < blobs.length; i++) {
    const at = ENTRY_TABLE + i * ENTRY_SIZE;
    setU32(pkh, at, pack.entries[i].id);
    setU32(pkh, at + 4, offset);
    setU32(pkh, at + 8, blobs[i].length);
    pkb.set(blobs[i], offset);
    offset += blobs[i].length;
  }

  const was = u32(pack.header, 0x1c);
  const now = Math.ceil(Math.max(0, ...blobs.map((b) => b.length)) / 16) * 16;
  setU32(pkh, 0x10, pkh.length);
  setU32(pkh, 0x1c, Math.max(was, now));
  return { pkh, pkb, grew: now > was };
}
