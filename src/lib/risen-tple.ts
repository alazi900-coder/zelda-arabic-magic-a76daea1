/**
 * Risen 1 `.tple` entity-template files (Genome Engine) — read-only-safe
 * float-property patcher. This is NOT a full parser of the format (that
 * would require documentation we don't have); it recognizes and edits
 * ONLY numeric (float32) property records that match one exact, verified
 * byte signature, and ignores everything else untouched.
 *
 * Format (reverse-engineered from a single real sample, `PC_Hero.tple`,
 * cross-validated against 12 independent property records that all matched
 * this exact layout with zero deviation):
 *
 *   Body: a serialized property tree. Each float property is stored as a
 *   fixed 14-byte record, found by scanning for this exact byte pattern:
 *     0x00  uint16  poolIndex   — index into the trailing string pool (name)
 *     0x02  uint16  0x0021      — constant (type-container marker)
 *     0x04  uint16  0x001e      — constant (float type id)
 *     0x06  uint16  0x0004      — constant (value size = 4 bytes)
 *     0x08  uint16  0x0000      — constant (reserved/padding)
 *     0x0A  float32 value       — the actual property value (little-endian)
 *
 *   Sentinel: 4 bytes `EF BE AD DE` ("DEADBEEF") mark the end of the body
 *   and the start of the string pool header.
 *
 *   String pool: starts 9 bytes after the sentinel (4-byte unknown field +
 *   1-byte padding), then a sequence of [uint16 length][ascii bytes]
 *   entries running to the end of the file. Property/class names are
 *   looked up by their 0-based position in this sequence.
 *
 * Because only float properties matching the exact signature above are
 * touched, editing never changes the file's length — a patched file can be
 * spliced back into its original archive at the exact same offset.
 */

const SENTINEL = [0xef, 0xbe, 0xad, 0xde];
const POOL_HEADER_SIZE = 9; // bytes between the sentinel and the first pool entry
const RECORD_SIZE = 14;
const RECORD_MAGIC_1 = 0x0021;
const RECORD_MAGIC_2 = 0x001e;
const RECORD_MAGIC_3 = 0x0004;
const RECORD_MAGIC_4 = 0x0000;
const MAX_POOL_STRING_LEN = 500;

export interface TpleFloatProperty {
  name: string;
  poolIndex: number;
  recordOffset: number;
  valueOffset: number;
  value: number;
}

export interface TplePropertyInfo {
  label: string;
  description: string;
  category: "movement" | "other";
}

/** Curated, verified explanations — only for properties whose meaning is
 * confidently understood from their (self-descriptive) name and the
 * gCCharacterMovement_PS context they were found in. Anything else found
 * by the generic scan is shown with its raw name and no invented meaning. */
export const TPLE_PROPERTY_INFO: Record<string, TplePropertyInfo> = {
  ForwardSpeedMax: { label: "أقصى سرعة للأمام", description: "السرعة القصوى عند التحرك للأمام.", category: "movement" },
  StrafeSpeedMax: { label: "أقصى سرعة جانبية", description: "السرعة القصوى عند التحرك يميناً/يساراً.", category: "movement" },
  BackwardSpeedMax: { label: "أقصى سرعة للخلف", description: "السرعة القصوى عند التحرك للخلف.", category: "movement" },
  TurnSpeedMax: { label: "أقصى سرعة دوران", description: "أقصى سرعة دوران الشخصية حول نفسها.", category: "movement" },
  TurnSpeedModifier: { label: "معامل سرعة الدوران", description: "معامل يُضرب في سرعة الدوران الأساسية.", category: "movement" },
  MoveAcceleration: { label: "تسارع الحركة", description: "مدى سرعة الوصول لأقصى سرعة عند بدء الحركة.", category: "movement" },
  MoveDecceleration: { label: "تباطؤ الحركة", description: "مدى سرعة التوقف عند إيقاف الحركة.", category: "movement" },
  TurnAcceleration: { label: "تسارع الدوران", description: "مدى سرعة الوصول لأقصى سرعة دوران.", category: "movement" },
  TurnDecceleration: { label: "تباطؤ الدوران", description: "مدى سرعة توقف الدوران.", category: "movement" },
  SlowModifier: { label: "معامل السرعة البطيئة", description: "معامل يُضرب في سرعة الحركة أثناء المشي البطيء.", category: "movement" },
  FastModifier: { label: "معامل السرعة السريعة", description: "معامل يُضرب في سرعة الحركة أثناء الجري/السرعة القصوى.", category: "movement" },
  SneakModifier: { label: "معامل التسلل", description: "معامل يُضرب في سرعة الحركة أثناء التسلل.", category: "movement" },
};

function findSentinelOffset(bytes: Uint8Array): number {
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (bytes[i] === SENTINEL[0] && bytes[i + 1] === SENTINEL[1] && bytes[i + 2] === SENTINEL[2] && bytes[i + 3] === SENTINEL[3]) {
      return i;
    }
  }
  return -1;
}

/** Parses the trailing string pool. Throws if no DEADBEEF sentinel is found (not a recognized .tple). */
export function parseTpleStringPool(bytes: Uint8Array): string[] {
  const sentinel = findSentinelOffset(bytes);
  if (sentinel < 0) {
    throw new Error("لم يُعثر على علامة بداية جدول الأسماء — هذا الملف ليس بصيغة .tple المدعومة");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("ascii");
  let p = sentinel + POOL_HEADER_SIZE;
  const names: string[] = [];
  while (p + 2 <= bytes.length) {
    const len = view.getUint16(p, true);
    p += 2;
    if (len === 0 || len > MAX_POOL_STRING_LEN || p + len > bytes.length) break;
    names.push(decoder.decode(bytes.subarray(p, p + len)));
    p += len;
  }
  return names;
}

/** Scans the whole file for float-property records matching the exact verified signature. Returns [] if the file isn't a recognized .tple (no sentinel found). */
export function findTpleFloatProperties(bytes: Uint8Array): TpleFloatProperty[] {
  const sentinel = findSentinelOffset(bytes);
  if (sentinel < 0) return [];
  const names = parseTpleStringPool(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const results: TpleFloatProperty[] = [];
  for (let off = 0; off + RECORD_SIZE <= sentinel; off++) {
    const idx = view.getUint16(off, true);
    if (idx >= names.length) continue;
    if (view.getUint16(off + 2, true) !== RECORD_MAGIC_1) continue;
    if (view.getUint16(off + 4, true) !== RECORD_MAGIC_2) continue;
    if (view.getUint16(off + 6, true) !== RECORD_MAGIC_3) continue;
    if (view.getUint16(off + 8, true) !== RECORD_MAGIC_4) continue;
    results.push({
      name: names[idx],
      poolIndex: idx,
      recordOffset: off,
      valueOffset: off + 10,
      value: view.getFloat32(off + 10, true),
    });
  }
  return results;
}

/** Patches float values in place (by valueOffset) — never changes the file's length. */
export function applyTpleFloatEdits(bytes: Uint8Array, edits: Map<number, number>): Uint8Array {
  const out = new Uint8Array(bytes);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  for (const [valueOffset, value] of edits) {
    view.setFloat32(valueOffset, value, true);
  }
  return out;
}

/** Splices a same-size replacement for one entry back into a full copy of the archive it came from. */
export function spliceFileIntoArchive(
  archiveBytes: Uint8Array,
  entryOffset: number,
  entrySize: number,
  newEntryBytes: Uint8Array,
): Uint8Array {
  if (newEntryBytes.length !== entrySize) {
    throw new Error(`حجم الملف المعدَّل (${newEntryBytes.length}) لا يطابق حجمه الأصلي (${entrySize}) — لا يمكن إدخاله بنفس المكان بأمان`);
  }
  if (entryOffset + entrySize > archiveBytes.length) {
    throw new Error("موضع الملف داخل الأرشيف خارج الحدود");
  }
  const out = new Uint8Array(archiveBytes);
  out.set(newEntryBytes, entryOffset);
  return out;
}
