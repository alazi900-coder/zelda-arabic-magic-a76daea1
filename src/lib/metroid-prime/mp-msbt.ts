/**
 * Metroid Prime Remastered MSBT text asset — parser/rebuilder for the
 * `USEN` (US English) locale section only.
 *
 * Reverse-engineered structure (no official spec; confirmed by decoding real
 * MSBT assets from GuiSysMP1.pak and reading out actual game text like
 * "X-Ray Visor acquired!" and the intro narration):
 *
 *   asset content (after the outer 32-byte RFRM header) = a sequence of
 *   per-locale sub-chunks, each: id(4, ASCII e.g. "USEN"/"EUFR"/"JPJP") +
 *   size:u32(4) + padding(4, zero) + unk:u32(4, =1) + skip(8, zero) = 24
 *   bytes, followed by `size` bytes of a standard Nintendo LMS ("MsgStdBn")
 *   text bank — 13 locales bundled per asset. We only ever touch the USEN
 *   sub-chunk; the other 12 are preserved byte-for-byte.
 *
 *   MsgStdBn body: magic(8) + BOM:u16(2)=0xFEFF + unk(2) + encoding:u8(1) +
 *   version:u8(1) + section_count:u16(2) + padding(2) + file_size:u32(4) +
 *   padding(10) = 32 bytes, then `section_count` sections back to back, each
 *   16-byte-aligned: magic(4) + size:u32(4) + padding(8) + body(size bytes),
 *   next section at `(16 + size + 15) & ~15` past this one's start.
 *
 *   Sections used: LBL1 (labels, index-based — untouched on rebuild, since
 *   we never add/remove/reorder strings), ATR1 (opaque attributes, also
 *   untouched), TXT2 (the actual text: count:u32 + count×u32 byte-offsets
 *   into the TXT2 body + UTF-16LE string data, each string's byte range
 *   bounded by consecutive offsets). Embedded control tags (button-icon
 *   references etc.) start with code unit 0x000E: group:u16 + type:u16 +
 *   param_size:u16 + param_size raw bytes — represented here as bracket
 *   placeholders `[TAG:000e:GROUP:TYPE:HEXPARAMS]` so translators can see
 *   and safely move them without needing to understand the binary form
 *   (mirrors the bracket-tag convention already used for Xenoblade).
 */

import { shapeArabicForMp, mpTagPlaceholderIndex } from "./mp-arabic-shaper";

function readU32(b: Uint8Array, off: number): number {
  return b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24);
}
function readU16(b: Uint8Array, off: number): number {
  return b[off] | (b[off + 1] << 8);
}
function writeU32(b: Uint8Array, off: number, v: number): void {
  b[off] = v & 0xff; b[off + 1] = (v >>> 8) & 0xff; b[off + 2] = (v >>> 16) & 0xff; b[off + 3] = (v >>> 24) & 0xff;
}
function writeU16(b: Uint8Array, off: number, v: number): void {
  b[off] = v & 0xff; b[off + 1] = (v >>> 8) & 0xff;
}

const TAG_RE = /\[TAG:([0-9a-fA-F]{4}):([0-9a-fA-F]{4}):([0-9a-fA-F]{4}):([0-9a-fA-F]*)\]/g;

function decodeMsbtString(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i + 1 < bytes.length) {
    const cu = readU16(bytes, i);
    if (cu === 0) { i += 2; continue; }
    if (cu === 0x000e || cu === 0x000f) {
      if (i + 8 > bytes.length) break;
      const group = readU16(bytes, i + 2);
      const type = readU16(bytes, i + 4);
      const psize = readU16(bytes, i + 6);
      const pend = Math.min(i + 8 + psize, bytes.length);
      const params = bytes.subarray(i + 8, pend);
      let hex = "";
      for (const b of params) hex += b.toString(16).padStart(2, "0");
      out += `[TAG:${cu.toString(16).padStart(4, "0")}:${group.toString(16).padStart(4, "0")}:${type.toString(16).padStart(4, "0")}:${hex}]`;
      i = pend;
      continue;
    }
    out += String.fromCharCode(cu);
    i += 2;
  }
  return out;
}

/** Encode one `[TAG:…]` bracket string back to its exact original binary
 *  form, appending to `bytes`. Returns false if it isn't a well-formed tag. */
function pushTagBytes(bytes: number[], tag: string): boolean {
  const m = /^\[TAG:([0-9a-fA-F]{4}):([0-9a-fA-F]{4}):([0-9a-fA-F]{4}):([0-9a-fA-F]*)\]$/.exec(tag);
  if (!m) return false;
  const pushU16 = (v: number) => { bytes.push(v & 0xff, (v >>> 8) & 0xff); };
  const hex = m[4];
  pushU16(parseInt(m[1], 16));
  pushU16(parseInt(m[2], 16));
  pushU16(parseInt(m[3], 16));
  pushU16(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return true;
}

/**
 * Inverse of decodeMsbtString — re-encodes bracket placeholders back to
 * their exact original binary tag form, and literal text as UTF-16LE.
 *
 * Arabic values are first shaped into presentation forms and visually
 * reordered (see mp-arabic-shaper.ts): the engine draws each stored codepoint
 * literally, left-to-right, with no shaping and no BiDi, so logical Arabic
 * would find no glyph in the font at all and render as boxes. Non-Arabic
 * values take the original path unchanged.
 */
function encodeMsbtString(text: string): Uint8Array {
  const bytes: number[] = [];
  const pushU16 = (v: number) => { bytes.push(v & 0xff, (v >>> 8) & 0xff); };

  const { text: shapedText, tags } = shapeArabicForMp(text);

  if (tags.length > 0) {
    // Shaped path: every tag is now a single placeholder character whose
    // position the reversal has already put where it belongs.
    for (const ch of shapedText) {
      const slot = mpTagPlaceholderIndex(ch);
      if (slot !== null && slot < tags.length) {
        if (pushTagBytes(bytes, tags[slot])) continue;
      }
      pushU16(ch.charCodeAt(0));
    }
    pushU16(0); // null terminator, matches the convention observed on every real string
    return new Uint8Array(bytes);
  }

  // No tags to shield (either plain text, or non-Arabic left untouched).
  let last = 0;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const pushText = (s: string) => { for (const ch of s) pushU16(ch.charCodeAt(0)); };
  while ((m = TAG_RE.exec(shapedText)) !== null) {
    pushText(shapedText.slice(last, m.index));
    pushTagBytes(bytes, m[0]);
    last = TAG_RE.lastIndex;
  }
  pushText(shapedText.slice(last));
  pushU16(0); // null terminator, matches the convention observed on every real string
  return new Uint8Array(bytes);
}

export interface MpMsbtEntry {
  index: number;
  original: string;
}

interface Section {
  magic: string;
  bodyStart: number;
  bodyEnd: number; // exclusive, = bodyStart + size (no padding)
  rawStart: number; // = bodyStart - 16 (header start)
  rawEnd: number; // exclusive, 16-byte-aligned end including original trailing padding
}

function walkSections(content: Uint8Array, msgStart: number, sectionCount: number): Section[] {
  const sections: Section[] = [];
  let pos = msgStart + 32;
  for (let i = 0; i < sectionCount; i++) {
    const magic = String.fromCharCode(content[pos], content[pos + 1], content[pos + 2], content[pos + 3]);
    const size = readU32(content, pos + 4);
    const bodyStart = pos + 16;
    const rawEnd = pos + ((16 + size + 15) & ~15);
    sections.push({ magic, bodyStart, bodyEnd: bodyStart + size, rawStart: pos, rawEnd });
    pos = rawEnd;
  }
  return sections;
}

function findUsenChunk(assetContent: Uint8Array): { chunkStart: number; msgStart: number; sectionCount: number } {
  // Scan sub-chunk headers from the start: id(4)+size(4)+pad(4)+unk(4)+skip(8).
  let pos = 0;
  while (pos + 24 <= assetContent.length) {
    const id = String.fromCharCode(assetContent[pos], assetContent[pos + 1], assetContent[pos + 2], assetContent[pos + 3]);
    const size = readU32(assetContent, pos + 4);
    const bodyStart = pos + 24;
    if (id === "USEN") {
      const sectionCount = readU16(assetContent, bodyStart + 14);
      return { chunkStart: pos, msgStart: bodyStart, sectionCount };
    }
    if (size === 0 || bodyStart + size > assetContent.length) break;
    pos = bodyStart + size;
  }
  throw new Error("لم يُعثر على قسم USEN (الإنجليزية) في هذا الأصل");
}

/** Parses the USEN locale's TXT2 strings from one MSBT asset's raw bytes
 *  (asset.data, i.e. including the outer 32-byte RFRM header). */
export function parseMsbtUsenEntries(assetData: Uint8Array): MpMsbtEntry[] {
  const content = assetData.subarray(32);
  const { msgStart, sectionCount } = findUsenChunk(content);
  const sections = walkSections(content, msgStart, sectionCount);
  const txt2 = sections.find((s) => s.magic === "TXT2");
  if (!txt2) return [];
  const body = content.subarray(txt2.bodyStart, txt2.bodyEnd);
  const count = readU32(body, 0);
  const out: MpMsbtEntry[] = [];
  for (let i = 0; i < count; i++) {
    const off = readU32(body, 4 + i * 4);
    const end = i + 1 < count ? readU32(body, 4 + (i + 1) * 4) : body.length;
    out.push({ index: i, original: decodeMsbtString(body.subarray(off, end)) });
  }
  return out;
}

/**
 * Rebuilds one MSBT asset's raw bytes with `edits` (index -> new text)
 * applied to the USEN TXT2 section. Every other locale chunk, plus LBL1/
 * ATR1 within USEN, is copied byte-for-byte unchanged. Returns the full new
 * asset.data buffer (same 32-byte outer RFRM header prefix, size fields
 * recomputed).
 */
export function rebuildMsbtUsenAsset(assetData: Uint8Array, edits: Map<number, string>): Uint8Array {
  const content = assetData.subarray(32);
  const { chunkStart, msgStart, sectionCount } = findUsenChunk(content);
  const sections = walkSections(content, msgStart, sectionCount);
  const txt2 = sections.find((s) => s.magic === "TXT2");
  if (!txt2) throw new Error("لم يُعثر على قسم TXT2 داخل USEN");
  const body = content.subarray(txt2.bodyStart, txt2.bodyEnd);
  const count = readU32(body, 0);

  const encoded: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const off = readU32(body, 4 + i * 4);
    const end = i + 1 < count ? readU32(body, 4 + (i + 1) * 4) : body.length;
    const edit = edits.get(i);
    encoded.push(edit != null && edit !== "" ? encodeMsbtString(edit) : body.subarray(off, end));
  }

  const newOffsets: number[] = [];
  let cursor = 4 + count * 4;
  for (const e of encoded) { newOffsets.push(cursor); cursor += e.length; }
  const newTxt2Body = new Uint8Array(cursor);
  writeU32(newTxt2Body, 0, count);
  for (let i = 0; i < count; i++) writeU32(newTxt2Body, 4 + i * 4, newOffsets[i]);
  let p = 4 + count * 4;
  for (const e of encoded) { newTxt2Body.set(e, p); p += e.length; }

  // Rebuild the MsgStdBn body: sections other than TXT2 are copied verbatim
  // (raw byte range, including whatever original trailing padding filler
  // the game uses — observed to be 0xAB, not zero). TXT2 is reconstructed;
  // if its body length is unchanged (no edits), its own original trailing
  // padding bytes are reused too, so a no-edit rebuild is byte-identical.
  const msgHeader = content.subarray(msgStart, msgStart + 32);
  const parts: Uint8Array[] = [msgHeader];
  for (const s of sections) {
    if (s !== txt2) {
      parts.push(content.subarray(s.rawStart, s.rawEnd));
      continue;
    }
    const header = new Uint8Array(16);
    for (let i = 0; i < 4; i++) header[i] = s.magic.charCodeAt(i);
    writeU32(header, 4, newTxt2Body.length);
    const padded = (16 + newTxt2Body.length + 15) & ~15;
    const section = new Uint8Array(padded);
    section.set(header, 0);
    section.set(newTxt2Body, 16);
    const tailLen = padded - (16 + newTxt2Body.length);
    if (tailLen > 0) {
      const origBodyLen = s.bodyEnd - s.bodyStart;
      const origPadTail = content.subarray(s.bodyStart + origBodyLen, s.rawEnd);
      if (origPadTail.length === tailLen) section.set(origPadTail, 16 + newTxt2Body.length);
    }
    parts.push(section);
  }
  const newMsg = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  { let o = 0; for (const part of parts) { newMsg.set(part, o); o += part.length; } }
  writeU32(newMsg, 18, newMsg.length); // file_size field at msg-relative offset 18

  // Rebuild the USEN sub-chunk (24-byte header + newMsg body).
  const usenHeader = content.subarray(chunkStart, chunkStart + 24).slice();
  writeU32(usenHeader, 4, newMsg.length);
  const newUsenChunk = new Uint8Array(24 + newMsg.length);
  newUsenChunk.set(usenHeader, 0);
  newUsenChunk.set(newMsg, 24);

  // Splice the new USEN chunk into content in place of the old one.
  const usenOldEnd = msgStart + readU32(content, chunkStart + 4);
  const newContent = new Uint8Array(content.length - (usenOldEnd - chunkStart) + newUsenChunk.length);
  newContent.set(content.subarray(0, chunkStart), 0);
  newContent.set(newUsenChunk, chunkStart);
  newContent.set(content.subarray(usenOldEnd), chunkStart + newUsenChunk.length);

  // Rebuild the outer 32-byte RFRM header (magic + size:u64 + rest verbatim).
  const newAsset = new Uint8Array(32 + newContent.length);
  newAsset.set(assetData.subarray(0, 32), 0);
  const view = new DataView(newAsset.buffer, newAsset.byteOffset, newAsset.byteLength);
  view.setBigUint64(4, BigInt(newContent.length), true);
  newAsset.set(newContent, 32);
  return newAsset;
}
