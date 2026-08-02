/**
 * Risen 3 `w_strings.bin` (Genome Engine, "GAR5"/"STB") — string-table archive
 * parser/writer, used for the localization payload found *inside* Risen 3's
 * `localization.p00` (see risen3-p00.ts for the outer G3V0/zlib container).
 *
 * This is a completely different on-disk format from Risen 1/2's TAB0/TAB1
 * tables (see risen-p00.ts) — Risen 3 compiles many source `.csv` files into
 * ONE flat archive with 43,938+ rows shared across 14 language columns
 * (German/English/French/Italian/Spanish/Polish/Russian × Text/StageDir),
 * each row identified by a DJB2 hash instead of a readable string ID.
 *
 * Struct layout (verified byte-for-byte against a real 6.3MB localization.p00,
 * decoding real German/Chinese dialogue text correctly) — credit to NicoDE's
 * reverse-engineering writeup, "[Risen 3] File Formats and other things"
 * (forum.worldofplayers.de, thread 1374683), which documents this exact
 * layout from independent analysis:
 *
 *   gar_header:
 *     char[4]  magic = "GAR5"
 *     u8[4]    flags        (0x10 big-endian / 0x20 little-endian — always
 *                             little-endian in every sample seen)
 *   stb_header (immediately follows, offset 8):
 *     u32 magic              'S'|'T'<<8|'B'<<16|version<<24 (version 5 or 6)
 *     u32 source_count        — number of original .csv files listed below
 *     u32 reserved            — always 0
 *     u32 column_count        — always 14 (7 languages × Text/StageDir)
 *     u32 row_count            — total rows, shared across all columns
 *     u32 source_table_offset
 *     u32 column_names_offset
 *     u32 column_table_offset
 *     u32 id_table_offset
 *
 *   source_table[source_count] @ source_table_offset:
 *     u16 pathLen; char[pathLen] path (NOT 0-terminated, e.g. "#G3:/Data/Raw/Strings/quests.csv")
 *     u32 filetimeHi; u32 filetimeLo   (truncated Windows FILETIME, swapped)
 *   NOTE: no per-source row-count/boundary is stored here — row→source
 *   mapping is not recoverable from the file alone.
 *
 *   id_table @ id_table_offset:
 *     u32 size (= row_count * 4); u32 offset (absolute, = here + 8)
 *     u32 ids[row_count]   — DJB2 hash of the row's original string ID,
 *                             sorted descending (unsigned) for binary search.
 *                             MUST be preserved byte-for-byte on rebuild —
 *                             the game looks up rows by this hash at runtime.
 *
 *   column_names @ column_names_offset:
 *     { u32 size (incl. trailing 0); u32 absoluteOffset }[column_count]
 *     then the actual 0-terminated ASCII names, pointed to by absoluteOffset.
 *
 *   column_table[column_count] @ column_table_offset:
 *     u32 string_table_size; u32 string_table_offset;
 *     u32 symbol_table_size; u32 symbol_table_offset;
 *
 *   Per column, string_table @ string_table_offset:
 *     i32 seq_start[row_count]     — index (in u16 units) into the sequences
 *                                     array below; -1 = empty string for that row
 *     u16 sequences[]               — 0-terminated list of indices into symbols
 *
 *   Per column, symbol_table @ symbol_table_offset:
 *     u32 symbols[]  — packed as prev:u16 (low word) | char:u16 (high word,
 *                       UTF-16 code unit). A "symbol" node encodes ONE
 *                       character plus a back-link to the previous character
 *                       of its chunk (prev=0 terminates the walk). Max chain
 *                       length is 33 (32 prev-links) — this is a shared-suffix
 *                       trie (DAFSA-style) so identical substrings across many
 *                       rows are stored once. To decode one entry from a row's
 *                       `sequences` list: walk the prev-chain collecting chars,
 *                       then reverse. A row's full string = concatenation of
 *                       all its sequence entries' decoded chunks, in order.
 *
 * This module does NOT attempt to reproduce the original's suffix-sharing
 * compression ratio on rebuild (that would require replicating whatever
 * DAFSA-construction algorithm Piranha Bytes used, which isn't documented).
 * Instead the writer builds a simple prefix-sharing trie per column (shares
 * common PREFIXES across chunks within that column, resetting per string) —
 * this keeps the symbol table well within the u16 index range for realistic
 * translation sets while producing a fully valid, game-loadable file. Row
 * IDs, column names, and source file listing are always copied verbatim.
 */

// ============================================================================
// الأنواع
// ============================================================================

export interface RisenGar3SourceFile {
  path: string;
  filetimeHi: number;
  filetimeLo: number;
}

export interface RisenGar3Column {
  name: string;
  /** بطول row_count دائماً — "" تعني صفاً فارغاً (seq_start = -1) لهذا العمود */
  values: string[];
}

export interface RisenGar3Document {
  flags: Uint8Array; // 4 بايت — تُنسخ حرفياً (شوهدت دائماً 0x20 0x00 0x00 0x00 = little-endian)
  stbVersion: number; // 5 أو 6 — يُنسخ حرفياً
  rowCount: number;
  sources: RisenGar3SourceFile[];
  /** بترتيب الفرز الأصلي تماماً (تنازلي كـ unsigned) — يجب ألا يتغير أبداً */
  rowIds: number[];
  columns: RisenGar3Column[];
}

const UTF16_DECODER = new TextDecoder("utf-16le");

function readAscii(bytes: Uint8Array, offset: number, len: number): string {
  return new TextDecoder("ascii").decode(bytes.subarray(offset, offset + len));
}

// ============================================================================
// PARSE
// ============================================================================

export function parseRisenGar5(buffer: ArrayBuffer): RisenGar3Document {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const magic = readAscii(bytes, 0, 4);
  if (magic !== "GAR5") throw new Error(`توقيع GAR5 غير متوقع: "${magic}"`);
  const flags = bytes.slice(4, 8);

  const stbOff = 8;
  const stbMagicByte3 = bytes[stbOff + 2]; // 'B'
  if (readAscii(bytes, stbOff, 2) !== "ST" || String.fromCharCode(stbMagicByte3) !== "B") {
    throw new Error("توقيع STB غير متوقع داخل GAR5");
  }
  const stbVersion = bytes[stbOff + 3];

  const sourceCount = view.getUint32(stbOff + 4, true);
  const columnCount = view.getUint32(stbOff + 12, true);
  const rowCount = view.getUint32(stbOff + 16, true);
  const sourceTableOffset = view.getUint32(stbOff + 20, true);
  const columnNamesOffset = view.getUint32(stbOff + 24, true);
  const columnTableOffset = view.getUint32(stbOff + 28, true);
  const idTableOffset = view.getUint32(stbOff + 32, true);

  // --- source_table ---
  let p = sourceTableOffset;
  const sources: RisenGar3SourceFile[] = [];
  for (let i = 0; i < sourceCount; i++) {
    const pathLen = view.getUint16(p, true); p += 2;
    const path = readAscii(bytes, p, pathLen); p += pathLen;
    const filetimeHi = view.getUint32(p, true); p += 4;
    const filetimeLo = view.getUint32(p, true); p += 4;
    sources.push({ path, filetimeHi, filetimeLo });
  }

  // --- id_table ---
  const idSize = view.getUint32(idTableOffset, true);
  const idOffset = view.getUint32(idTableOffset + 4, true);
  if (idSize !== rowCount * 4) {
    throw new Error(`حجم جدول المعرّفات غير متوقع: ${idSize} (متوقع ${rowCount * 4})`);
  }
  const rowIds: number[] = new Array(rowCount);
  for (let i = 0; i < rowCount; i++) rowIds[i] = view.getUint32(idOffset + i * 4, true);

  // --- column_names ---
  p = columnNamesOffset;
  const nameMeta: Array<{ size: number; offset: number }> = [];
  for (let i = 0; i < columnCount; i++) {
    const size = view.getUint32(p, true); p += 4;
    const offset = view.getUint32(p, true); p += 4;
    nameMeta.push({ size, offset });
  }
  const columnNames = nameMeta.map(({ size, offset }) => readAscii(bytes, offset, size - 1));

  // --- column_table + per-column string/symbol tables ---
  p = columnTableOffset;
  const columns: RisenGar3Column[] = [];
  for (let c = 0; c < columnCount; c++) {
    const stringTableOffset = view.getUint32(p + 4, true);
    const symbolTableOffset = view.getUint32(p + 12, true);
    p += 16;

    const seqStart: Int32Array = new Int32Array(rowCount);
    for (let r = 0; r < rowCount; r++) seqStart[r] = view.getInt32(stringTableOffset + r * 4, true);
    const seqBase = stringTableOffset + rowCount * 4;

    const symbolAt = (idx: number): { prev: number; ch: number } => {
      const v = view.getUint32(symbolTableOffset + idx * 4, true);
      return { prev: v & 0xffff, ch: (v >>> 16) & 0xffff };
    };

    const decodeChunk = (symbolIdx: number): string => {
      const chars: number[] = [];
      let idx = symbolIdx;
      let steps = 0;
      while (idx !== 0 && steps < 40) {
        const { prev, ch } = symbolAt(idx);
        chars.push(ch);
        idx = prev;
        steps++;
      }
      chars.reverse();
      return String.fromCharCode(...chars);
    };

    const values: string[] = new Array(rowCount);
    for (let r = 0; r < rowCount; r++) {
      const s = seqStart[r];
      if (s === -1) { values[r] = ""; continue; }
      let sp = seqBase + s * 2;
      const parts: string[] = [];
      let guard = 0;
      while (guard++ < 5000) {
        const v = view.getUint16(sp, true); sp += 2;
        if (v === 0) break;
        parts.push(decodeChunk(v));
      }
      values[r] = parts.join("");
    }

    columns.push({ name: columnNames[c], values });
  }

  return { flags, stbVersion, rowCount, sources, rowIds, columns };
}

// ============================================================================
// BUILD
// ============================================================================

/**
 * Splits a string into chunks for the symbol trie. The trie can only share a
 * PREFIX (matching from each chunk's own position 0) — proven by the decode
 * direction (a chunk's first character always has prev=0, so two chunks only
 * share nodes if they're identical from their own start).
 *
 * Word-boundary chunking (one chunk per whitespace+word) was tried first and
 * gives real reuse of short function words, but still needed ~97,000 trie
 * nodes to reproduce a real German_Text column — well over the format's
 * 65,536-slot ceiling (confirmed against the real file: max referenced
 * symbol index was exactly 65535). True suffix sharing (independent of
 * prefix) is structurally impossible in this format, so long, mostly-unique
 * words (German compounds, Arabic word+suffix forms, ...) can't reuse tail
 * fragments that way.
 *
 * The fix: split into small FIXED-LENGTH pieces, END-ALIGNED per token (the
 * remainder, if any, is the first piece; every piece after that is exactly
 * `pieceLen` chars). Because pieces are end-aligned, a common word ENDING
 * (e.g. German "-ung"/"-heit"/"-lich", Arabic prefixes/suffixes) lands as an
 * identical final piece across many different words, so it becomes a
 * *shareable prefix of its own piece* even though the whole word isn't
 * shared — an indirect way to get suffix-level reuse despite the format only
 * supporting prefix sharing. Empirically verified: pieceLen=5 brings the
 * same German_Text column down to ~42,000 nodes (well within budget), with
 * exact round-trip fidelity.
 */
function chunkString(s: string, pieceLen: number): string[] {
  const tokens = s.match(/\s*\S+|\s+$/g) ?? (s.length ? [s] : []);
  const out: string[] = [];
  for (const tok of tokens) {
    if (tok.length <= pieceLen) { out.push(tok); continue; }
    const rem = tok.length % pieceLen;
    let i = 0;
    if (rem > 0) { out.push(tok.slice(0, rem)); i = rem; }
    for (; i < tok.length; i += pieceLen) out.push(tok.slice(i, i + pieceLen));
  }
  return out;
}

/** Piece lengths to try, largest first (fewer, bigger pieces = smaller
 * `sequences[]` array) — falls back to smaller pieces only if the larger
 * size doesn't fit. 5 fits real European-language columns comfortably; CJK
 * and other low-repetition scripts (little benefit from splitting words into
 * arbitrary sub-word pieces) need to fall back much further — verified
 * against a real Chinese-substituted column that only 2-char pieces fit. */
const PIECE_LEN_CANDIDATES = [5, 3, 2, 1];

/** Builds one column's string_table + symbol_table bytes. Reuses symbol chain
 * nodes across chunks within the column via a simple (prev,char) → index trie,
 * so repeated prefixes (e.g. common short words) are shared — keeps the table
 * well under the u16 index ceiling without trying to replicate the original's
 * exact DAFSA construction. */
function buildColumnTables(values: string[]): { stringTable: Uint8Array; symbolTable: Uint8Array } {
  const rowCount = values.length;

  let seqStart!: Int32Array;
  let sequenceIndices!: number[];
  let symbolPrev!: number[];
  let symbolChar!: number[];
  let lastError: Error | null = null;

  pieceLenLoop:
  for (const pieceLen of PIECE_LEN_CANDIDATES) {
    // symbols[0] is reserved/unused (index 0 means "chain end"). Node key = `${prev}:${ch}`.
    const nodeIndex = new Map<string, number>();
    symbolPrev = [0]; // placeholder for index 0
    symbolChar = [0];

    function internChunkTail(chunk: string): number {
      // Walks the chunk char by char, extending/reusing the shared trie, and
      // returns the index of the LAST character's node (the chain tail —
      // matches how the reader starts at the tail and walks backward via prev).
      let prev = 0;
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk.charCodeAt(i);
        const key = `${prev}:${ch}`;
        let idx = nodeIndex.get(key);
        if (idx === undefined) {
          idx = symbolPrev.length;
          symbolPrev.push(prev);
          symbolChar.push(ch);
          nodeIndex.set(key, idx);
        }
        prev = idx;
      }
      return prev;
    }

    seqStart = new Int32Array(rowCount);
    sequenceIndices = []; // u16 stream, built up across all rows

    for (let r = 0; r < rowCount; r++) {
      const v = values[r];
      if (!v) { seqStart[r] = -1; continue; }
      seqStart[r] = sequenceIndices.length;
      for (const chunk of chunkString(v, pieceLen)) {
        const tailIdx = internChunkTail(chunk);
        if (tailIdx > 0xffff) {
          lastError = new Error(
            `فاض جدول الرموز عن حدّ 16-bit حتى مع أصغر حجم تقطيع (pieceLen=${pieceLen}) — ` +
            `النص المُدخل لهذا العمود أكبر من أن تستوعبه هذه الصيغة`
          );
          continue pieceLenLoop;
        }
        sequenceIndices.push(tailIdx);
      }
      sequenceIndices.push(0); // terminator
    }
    lastError = null;
    break; // this pieceLen fit — keep the result
  }

  if (lastError) throw lastError;

  const stSize = rowCount * 4 + sequenceIndices.length * 2;
  const stringTable = new Uint8Array(stSize);
  const stView = new DataView(stringTable.buffer);
  for (let r = 0; r < rowCount; r++) stView.setInt32(r * 4, seqStart[r], true);
  let sp = rowCount * 4;
  for (const idx of sequenceIndices) { stView.setUint16(sp, idx, true); sp += 2; }

  const symbolTable = new Uint8Array(symbolPrev.length * 4);
  const symView = new DataView(symbolTable.buffer);
  for (let i = 0; i < symbolPrev.length; i++) {
    const packed = (symbolPrev[i] & 0xffff) | ((symbolChar[i] & 0xffff) << 16);
    symView.setUint32(i * 4, packed >>> 0, true);
  }

  return { stringTable, symbolTable };
}

export function buildRisenGar5(doc: RisenGar3Document): ArrayBuffer {
  const { rowCount, sources, rowIds, columns } = doc;

  // 1) per-column tables (built first — sizes are needed for the column_table)
  const built = columns.map((c) => buildColumnTables(c.values));

  // 2) fixed-size sections
  const HEADER = 8 + 36; // gar_header(8) + stb_header(36)
  const sourceTableOffset = HEADER;
  let sourceTableSize = 0;
  for (const s of sources) sourceTableSize += 2 + s.path.length + 8;

  const idTableOffset = sourceTableOffset + sourceTableSize;
  const idTableHeaderSize = 8;
  const idArrayOffset = idTableOffset + idTableHeaderSize;
  const idTableSize = idTableHeaderSize + rowCount * 4;

  const columnNamesOffset = idTableOffset + idTableSize;
  const columnNamesMetaSize = columns.length * 8;
  let namesBufSize = 0;
  for (const c of columns) namesBufSize += c.name.length + 1;
  const nameBufferStart = columnNamesOffset + columnNamesMetaSize;

  let cursor = nameBufferStart + namesBufSize;
  const stringTableOffsets: number[] = [];
  const symbolTableOffsets: number[] = [];
  for (const b of built) {
    stringTableOffsets.push(cursor);
    cursor += b.stringTable.length;
  }
  for (const b of built) {
    symbolTableOffsets.push(cursor);
    cursor += b.symbolTable.length;
  }
  const columnTableOffset = cursor;
  const columnTableSize = columns.length * 16;
  const totalSize = columnTableOffset + columnTableSize;

  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  // gar_header
  out.set(new TextEncoder().encode("GAR5"), 0);
  out.set(doc.flags, 4);

  // stb_header
  out[8] = 0x53; out[9] = 0x54; out[10] = 0x42; out[11] = doc.stbVersion; // "STB" + version
  view.setUint32(12, sources.length, true);
  view.setUint32(16, 0, true); // reserved
  view.setUint32(20, columns.length, true);
  view.setUint32(24, rowCount, true);
  view.setUint32(28, sourceTableOffset, true);
  view.setUint32(32, columnNamesOffset, true);
  view.setUint32(36, columnTableOffset, true);
  view.setUint32(40, idTableOffset, true);

  // source_table
  let p = sourceTableOffset;
  for (const s of sources) {
    view.setUint16(p, s.path.length, true); p += 2;
    out.set(new TextEncoder().encode(s.path), p); p += s.path.length;
    view.setUint32(p, s.filetimeHi, true); p += 4;
    view.setUint32(p, s.filetimeLo, true); p += 4;
  }

  // id_table
  view.setUint32(idTableOffset, rowCount * 4, true);
  view.setUint32(idTableOffset + 4, idArrayOffset, true);
  for (let i = 0; i < rowCount; i++) view.setUint32(idArrayOffset + i * 4, rowIds[i], true);

  // column_names
  p = columnNamesOffset;
  let nameP = nameBufferStart;
  for (const c of columns) {
    const size = c.name.length + 1;
    view.setUint32(p, size, true); p += 4;
    view.setUint32(p, nameP, true); p += 4;
    out.set(new TextEncoder().encode(c.name), nameP);
    out[nameP + c.name.length] = 0;
    nameP += size;
  }

  // string/symbol tables
  built.forEach((b, i) => {
    out.set(b.stringTable, stringTableOffsets[i]);
    out.set(b.symbolTable, symbolTableOffsets[i]);
  });

  // column_table
  p = columnTableOffset;
  built.forEach((b, i) => {
    view.setUint32(p, b.stringTable.length, true); p += 4;
    view.setUint32(p, stringTableOffsets[i], true); p += 4;
    view.setUint32(p, b.symbolTable.length, true); p += 4;
    view.setUint32(p, symbolTableOffsets[i], true); p += 4;
  });

  return out.buffer;
}
