/**
 * Reads and rebuilds Golden Sun's compressed string table.
 *
 * Layout (all addresses fixed in the US ROM, confirmed against the decomp's
 * `tools/unpack_strings.c` and matched byte-for-byte in this project's own
 * tests):
 *   - 0x3842C: { u32 treesPtr, u32 offsetsPtr } -- the Huffman tables.
 *   - 0x736B8: 42 x { u32 dataPtr, u32 lengthsPtr } -- one per 256-string
 *     chunk (10,722 strings = 41 full chunks + one 226-string chunk).
 * Every pointer is a GBA ROM address (0x08xxxxxx); mask with 0xFFFFFF for
 * the file offset.
 */
import { reshapeArabic, stripDiacritics } from "@/lib/arabic-processing";
import { buildTrees, compressString, decompressString } from "./goldensun-huffman";
import { GOLDENSUN_ARABIC_BYTE_MAP } from "./goldensun-arabic-font";
import { isGoldenSunPlainAscii, tokenizeGoldenSunBytes } from "./goldensun-tags";

export const GS_HUFFMAN_OFFSET = 0x3842c;
export const GS_DATA_OFFSET = 0x736b8;
export const GS_NUM_STRINGS = 10722;
export const GS_ITEMS_PER_FILE = 256;
export const GS_HEADER_TITLE = "Golden Sun"; // ASCII at 0xA0 in every GBA ROM header

function readU32(rom: Uint8Array, off: number): number {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16) | (rom[off + 3] << 24);
}
function writeU32(rom: Uint8Array, off: number, val: number) {
  rom[off] = val & 0xff;
  rom[off + 1] = (val >> 8) & 0xff;
  rom[off + 2] = (val >> 16) & 0xff;
  rom[off + 3] = (val >> 24) & 0xff;
}
const romOff = (ptr: number) => ptr & 0xffffff;
const romPtr = (off: number) => 0x08000000 | off;

/** GBA header game code for Golden Sun (US), at ROM offset 0xAC. */
export function looksLikeGoldenSunRom(rom: Uint8Array): boolean {
  if (rom.length < GS_DATA_OFFSET + GS_ITEMS_PER_FILE * 8) return false;
  const code = String.fromCharCode(...rom.slice(0xac, 0xb0));
  return code === "AGSE";
}

export interface GoldenSunEntry {
  index: number;
  msbtFile: string; // "goldensun/strings" -- one flat table (see goldensun-categories.ts)
  original: string;
}

const ARABIC_BYTE_TO_CODEPOINT: Record<number, number> = (() => {
  const inv: Record<number, number> = {};
  for (const [cp, byte] of Object.entries(GOLDENSUN_ARABIC_BYTE_MAP)) inv[byte as unknown as number] = Number(cp);
  return inv;
})();

/** Bytes -> the text the editor shows: plain ASCII through, control codes and anything else as `\xNN`, Arabic-mapped bytes as their presentation-form character (round-trips a previously-saved translation). */
export function goldensunBytesToText(bytes: number[]): string {
  let out = "";
  for (const tok of tokenizeGoldenSunBytes(bytes)) {
    if (tok.kind === "code") {
      out += tok.bytes.map((b) => "\\x" + b.toString(16).padStart(2, "0")).join("");
      continue;
    }
    for (const b of tok.bytes) {
      if (isGoldenSunPlainAscii(b)) out += String.fromCharCode(b);
      else if (b in ARABIC_BYTE_TO_CODEPOINT) out += String.fromCodePoint(ARABIC_BYTE_TO_CODEPOINT[b]);
      else out += "\\x" + b.toString(16).padStart(2, "0");
    }
  }
  return out;
}

const PUNCT_TO_ASCII: Record<string, string> = { "،": ",", "؟": "?", "؛": ";" };

/** The text the editor holds -> bytes to compress: reshapes logical Arabic to presentation forms, maps punctuation, and reads back every `\xNN` escape and mapped Arabic form. */
export function goldensunTextToBytes(text: string): number[] {
  const out: number[] = [];
  // `\xNN` escapes travel through untouched; everything else is shaped.
  const CODE = /\\x[0-9a-f]{2}/gi;
  let lastIndex = 0;
  const pushShaped = (segment: string) => {
    const shaped = reshapeArabic(stripDiacritics(segment));
    for (const ch of shaped) {
      const cp = ch.codePointAt(0)!;
      const mapped = PUNCT_TO_ASCII[ch];
      if (mapped) { out.push(mapped.charCodeAt(0)); continue; }
      if (cp < 0x80 && isGoldenSunPlainAscii(cp)) { out.push(cp); continue; }
      const byte = GOLDENSUN_ARABIC_BYTE_MAP[cp];
      if (byte === undefined) throw new Error(`goldensun-rom: no glyph for "${ch}" (U+${cp.toString(16)})`);
      out.push(byte);
    }
  };
  let m: RegExpExecArray | null;
  CODE.lastIndex = 0;
  while ((m = CODE.exec(text))) {
    if (m.index > lastIndex) pushShaped(text.slice(lastIndex, m.index));
    out.push(parseInt(m[0].slice(2), 16));
    lastIndex = CODE.lastIndex;
  }
  if (lastIndex < text.length) pushShaped(text.slice(lastIndex));
  return out;
}

/** Reads every string from `rom` (a vanilla or already-patched-but-not-yet-relocated Golden Sun ROM) into editor entries, in id order. */
export function extractGoldenSunEntries(rom: Uint8Array): GoldenSunEntry[] {
  const treesAddr = romOff(readU32(rom, GS_HUFFMAN_OFFSET));
  const offsetsAddr = romOff(readU32(rom, GS_HUFFMAN_OFFSET + 4));
  const entries: GoldenSunEntry[] = [];
  let stringId = 0;
  for (let i = 0; stringId < GS_NUM_STRINGS; i++) {
    const dataAddr = romOff(readU32(rom, GS_DATA_OFFSET + i * 8));
    const lengthsAddr = romOff(readU32(rom, GS_DATA_OFFSET + i * 8 + 4));
    let cursor = dataAddr;
    for (let j = 0; j < GS_ITEMS_PER_FILE && stringId < GS_NUM_STRINGS; j++, stringId++) {
      const bytes = decompressString(rom, cursor, treesAddr, offsetsAddr);
      entries.push({ index: stringId, msbtFile: "goldensun/strings", original: goldensunBytesToText(bytes) });
      const len = rom[lengthsAddr + j];
      if (len === 255) throw new Error(`goldensun-rom: bad length byte at string ${stringId}`);
      cursor += len;
    }
  }
  return entries;
}

/**
 * Rebuilds the string table with `translations` (keyed by "goldensun/strings:<index>")
 * substituted in, and writes it back into `rom` (mutated in place; also returned).
 *
 * The two pointer tables (0x3842C and 0x736B8) keep their own size and
 * position -- only the pointer VALUES change, to a fresh table appended
 * past the ROM's original end (the GBA cart address space allows this up
 * to 32MB; we only ever need a few hundred KB more). Every other byte in
 * the original ROM is untouched.
 */
export function buildGoldenSunStringTable(
  rom: Uint8Array,
  entries: GoldenSunEntry[],
  translations: Record<string, string>
): Uint8Array {
  const bytesPerString: number[][] = entries.map((e) => {
    const key = `${e.msbtFile}:${e.index}`;
    const text = translations[key] ?? e.original;
    return goldensunTextToBytes(text);
  });

  const corpusLen = bytesPerString.reduce((n, b) => n + b.length + 1, 0);
  const corpus = new Uint8Array(corpusLen);
  let cp = 0;
  for (const b of bytesPerString) { corpus.set(b, cp); cp += b.length + 1; }
  const built = buildTrees(corpus);

  const compressed = bytesPerString.map((b) => {
    const c = compressString(built, b);
    if (c.length >= 255) throw new Error(`goldensun-rom: a translated line compressed to ${c.length} bytes (limit 254) -- shorten it`);
    return c;
  });

  const nChunks = Math.ceil(entries.length / GS_ITEMS_PER_FILE);
  const chunkDataBytes: Uint8Array[] = [];
  const chunkLengths: Uint8Array[] = [];
  for (let c = 0; c < nChunks; c++) {
    const start = c * GS_ITEMS_PER_FILE;
    const end = Math.min(start + GS_ITEMS_PER_FILE, entries.length);
    const parts = compressed.slice(start, end);
    const total = parts.reduce((n, p) => n + p.length, 0);
    const buf = new Uint8Array(total);
    let p = 0;
    const lens = new Uint8Array(end - start);
    parts.forEach((part, i) => { buf.set(part, p); p += part.length; lens[i] = part.length; });
    chunkDataBytes.push(buf);
    chunkLengths.push(lens);
  }

  // Append past the ROM's original end: offsets table (512B), then the
  // trees blob, then each chunk's compressed data and its length table.
  // Every piece is 2-byte aligned (the GBA reads u16s from the offsets
  // table and u32 pointers elsewhere); nothing before `appendStart` moves.
  const align2 = (n: number) => (n + 1) & ~1;
  const offsetsBytes = new Uint8Array(512);
  for (let i = 0; i < 256; i++) {
    offsetsBytes[i * 2] = built.offsets[i] & 0xff;
    offsetsBytes[i * 2 + 1] = (built.offsets[i] >> 8) & 0xff;
  }

  const appendStart = align2(rom.length);
  const layout: { bytes: Uint8Array; addr: number }[] = [];
  let cursor = appendStart;
  const place = (bytes: Uint8Array) => {
    const addr = cursor;
    layout.push({ bytes, addr });
    cursor = align2(cursor + bytes.length);
    return addr;
  };

  const offsetsAddr = place(offsetsBytes);
  const treesBlobAddr = place(built.treesBlob);
  const chunkDataAddrs: number[] = [];
  const chunkLengthAddrs: number[] = [];
  for (let c = 0; c < nChunks; c++) {
    chunkDataAddrs.push(place(chunkDataBytes[c]));
    chunkLengthAddrs.push(place(chunkLengths[c]));
  }

  const result = new Uint8Array(cursor);
  result.set(rom, 0);
  for (const { bytes, addr } of layout) result.set(bytes, addr);

  writeU32(result, GS_HUFFMAN_OFFSET, romPtr(treesBlobAddr));
  writeU32(result, GS_HUFFMAN_OFFSET + 4, romPtr(offsetsAddr));
  for (let c = 0; c < nChunks; c++) {
    writeU32(result, GS_DATA_OFFSET + c * 8, romPtr(chunkDataAddrs[c]));
    writeU32(result, GS_DATA_OFFSET + c * 8 + 4, romPtr(chunkLengthAddrs[c]));
  }

  return result;
}
