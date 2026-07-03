/**
 * Risen 1 `strings.p00` (Genome Engine) — TAB0 parser.
 *
 * Binary layout (verified byte-exact against real file per project spec):
 *
 *   TAB0 Header:
 *     magic       : "TAB0"        (4 bytes)
 *     version     : uint16, uint16 (4 bytes)
 *     timestamp   : int64          (8 bytes, FILETIME)
 *     field_count : uint32
 *   Then field_count times:
 *     flag        : uint8   (always 1)
 *     unk         : uint16  (always 1)
 *     name_len    : uint16  (UTF-16 units)
 *     name        : UTF-16LE[name_len]
 *     row_count   : uint32
 *     rows        : row_count × { str_len: uint16 (UTF-16 units); str_data: UTF-16LE[str_len] }
 *
 * Strings are Pascal-style (length-prefixed). No separator, no NUL terminator.
 */

export const TAB0_MAGIC = [0x54, 0x41, 0x42, 0x30]; // "TAB0"

export interface TabField {
  name: string;
  rowCount: number;
  values: string[];
  /** Byte offset (in original buffer) where this field's header (flag byte) begins */
  headerOffset: number;
  /** Byte offset immediately after the last row of this field */
  endOffset: number;
}

export interface Tab0Table {
  /** Best-guess logical name — from the whitelist quests/infos/documents or `tab_${offset}` */
  name: string;
  /** Byte offset of the "TAB0" magic */
  offset: number;
  /** Byte offset immediately after the last row of the last field */
  endOffset: number;
  version: [number, number];
  timestamp: bigint;
  fields: TabField[];
}

export interface ParsedP00 {
  buffer: ArrayBuffer;
  totalSize: number;
  tables: Tab0Table[];
  /** Bytes after the last table (typically ~32 bytes of padding + timestamps) up to end of file */
  trailerOffset: number;
}

const TRANSLATABLE_FIELD_RE =
  /^(German|English|French|Italian|Spanish)_(Text|StageDir)$/;

export function isTranslatableFieldName(name: string): boolean {
  return TRANSLATABLE_FIELD_RE.test(name);
}

/**
 * Preferred source field for translation, in fallback order.
 * The editor shows this text as the "original" to translate from.
 */
export const SOURCE_FIELD_PREFERENCE = [
  "English_Text",
  "German_Text",
  "French_Text",
];

/**
 * Default field to REPLACE with the Arabic translation on rebuild.
 * We overwrite English so users who play with English selected see Arabic.
 */
export const DEFAULT_ARABIC_TARGET_FIELD = "English_Text";

/** Contextual (non-translatable) fields the editor can show for AI context. */
export const CONTEXT_FIELDS = ["Owner", "Role", "Voice"];

function readUtf16LE(buf: DataView, offset: number, unitCount: number): string {
  let out = "";
  for (let i = 0; i < unitCount; i++) {
    out += String.fromCharCode(buf.getUint16(offset + i * 2, true));
  }
  return out;
}

/** Scan the whole buffer for TAB0 signatures (raw, unvalidated). Returns byte offsets. */
export function findAllTab0Offsets(buffer: ArrayBuffer): number[] {
  const view = new Uint8Array(buffer);
  const out: number[] = [];
  for (let i = 0; i <= view.length - 4; i++) {
    if (
      view[i] === TAB0_MAGIC[0] &&
      view[i + 1] === TAB0_MAGIC[1] &&
      view[i + 2] === TAB0_MAGIC[2] &&
      view[i + 3] === TAB0_MAGIC[3]
    ) {
      out.push(i);
    }
  }
  return out;
}

const MIN_PLAUSIBLE_FIELD_COUNT = 1;
const MAX_PLAUSIBLE_FIELD_COUNT = 50;

function isPrintableFieldName(name: string): boolean {
  if (name.length === 0 || name.length > 100) return false;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
}

/**
 * Reject a candidate "TAB0" offset that is just a coincidental byte match inside
 * string data (rather than a real table header) — without throwing. Checks that
 * field_count is plausible and that the first field's name is a sane printable
 * string immediately after the header.
 */
function isValidTab0Candidate(buffer: ArrayBuffer, offset: number): boolean {
  try {
    const view = new DataView(buffer);
    let p = offset + 4; // skip "TAB0" magic
    if (p + 4 + 8 + 4 > view.byteLength) return false;
    p += 4; // version (u16, u16)
    p += 8; // timestamp (i64)
    const fieldCount = view.getUint32(p, true); p += 4;
    if (fieldCount < MIN_PLAUSIBLE_FIELD_COUNT || fieldCount > MAX_PLAUSIBLE_FIELD_COUNT) {
      return false;
    }

    if (p + 1 + 2 + 2 > view.byteLength) return false;
    p += 1; // flag
    p += 2; // unk
    const nameLen = view.getUint16(p, true); p += 2;
    if (nameLen === 0 || nameLen > 100) return false;
    if (p + nameLen * 2 > view.byteLength) return false;
    const name = readUtf16LE(view, p, nameLen);
    return isPrintableFieldName(name);
  } catch {
    return false;
  }
}

/** Parse a single TAB0 table starting at `start` (offset of the "TAB0" magic). */
export function parseTab0(buffer: ArrayBuffer, start: number, logicalName?: string): Tab0Table {
  const view = new DataView(buffer);
  let p = start;

  // magic
  if (
    view.getUint8(p) !== 0x54 ||
    view.getUint8(p + 1) !== 0x41 ||
    view.getUint8(p + 2) !== 0x42 ||
    view.getUint8(p + 3) !== 0x30
  ) {
    throw new Error(`TAB0 magic not found at offset ${start}`);
  }
  p += 4;

  const v1 = view.getUint16(p, true); p += 2;
  const v2 = view.getUint16(p, true); p += 2;
  const timestamp = view.getBigInt64(p, true); p += 8;
  const fieldCount = view.getUint32(p, true); p += 4;

  if (fieldCount === 0 || fieldCount > 512) {
    throw new Error(`TAB0 at ${start}: implausible field_count ${fieldCount}`);
  }

  const fields: TabField[] = [];
  for (let f = 0; f < fieldCount; f++) {
    const headerOffset = p;
    const flag = view.getUint8(p); p += 1;
    const unk = view.getUint16(p, true); p += 2;
    if (flag !== 1 || unk !== 1) {
      // Not fatal — log and continue. Some builds may use different sentinel values.
      console.warn(`TAB0 at ${start}: field ${f} flag=${flag} unk=${unk} (expected 1,1)`);
    }

    const nameLen = view.getUint16(p, true); p += 2;
    if (nameLen > 256) {
      throw new Error(`TAB0 at ${start}: field ${f} name_len ${nameLen} too large`);
    }
    const name = readUtf16LE(view, p, nameLen); p += nameLen * 2;

    const rowCount = view.getUint32(p, true); p += 4;
    if (rowCount > 200_000) {
      throw new Error(`TAB0 at ${start}: field "${name}" row_count ${rowCount} too large`);
    }

    const values: string[] = new Array(rowCount);
    for (let r = 0; r < rowCount; r++) {
      const strLen = view.getUint16(p, true); p += 2;
      if (p + strLen * 2 > view.byteLength) {
        throw new Error(
          `TAB0 at ${start}: field "${name}" row ${r} str_len ${strLen} exceeds buffer`
        );
      }
      values[r] = readUtf16LE(view, p, strLen);
      p += strLen * 2;
    }

    fields.push({ name, rowCount, values, headerOffset, endOffset: p });
  }

  return {
    name: logicalName ?? `tab_0x${start.toString(16)}`,
    offset: start,
    endOffset: p,
    version: [v1, v2],
    timestamp,
    fields,
  };
}

/**
 * Best-effort logical naming based on ordering and content shape.
 * The report identifies 3 tables in strings.p00: quests, infos, documents.
 */
function guessTableName(index: number, total: number, fields: TabField[]): string {
  if (total === 3) {
    if (index === 0) return "quests.tab";
    if (index === 1) return "infos.tab";
    if (index === 2) return "documents.tab";
  }
  // Fall back: use presence of dialogue-specific fields
  const names = new Set(fields.map((f) => f.name));
  if (names.has("Voice") || names.has("Role")) return "infos.tab";
  return `tab_${index}`;
}

/** Parse a whole `strings.p00` file. */
export function parseP00(buffer: ArrayBuffer): ParsedP00 {
  const candidates = findAllTab0Offsets(buffer);
  const offsets: number[] = [];
  for (const c of candidates) {
    if (isValidTab0Candidate(buffer, c)) {
      offsets.push(c);
    } else {
      console.warn(`Rejected false-positive TAB0 signature match at offset ${c} (not a real table header)`);
    }
  }
  if (offsets.length === 0) {
    throw new Error("No TAB0 signatures found — is this really a Risen strings.p00 file?");
  }

  const tables: Tab0Table[] = [];
  for (let i = 0; i < offsets.length; i++) {
    // Parse first without a name so we can name it based on field shape
    const raw = parseTab0(buffer, offsets[i]);
    raw.name = guessTableName(i, offsets.length, raw.fields);
    tables.push(raw);
  }

  return {
    buffer,
    totalSize: buffer.byteLength,
    tables,
    trailerOffset: tables[tables.length - 1].endOffset,
  };
}
