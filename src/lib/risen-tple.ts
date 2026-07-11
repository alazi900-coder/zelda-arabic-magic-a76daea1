/**
 * Risen 1 `.tple` entity-template files (Genome Engine) — a same-size-only,
 * read-only-safe property patcher. This is NOT a full parser of the format
 * (that would require documentation we don't have); it recognizes and edits
 * ONLY float/bool/int property records that match one of three exact,
 * verified byte signatures, and ignores everything else untouched.
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
 * A second property kind, boolean, uses the same overall shape with
 * different constants and is likewise cross-validated — 25 independent
 * records in the same sample file, all matching with zero deviation:
 *   0x00  uint16  poolIndex
 *   0x02  uint16  0x0018      — constant (bool type-container marker)
 *   0x04  uint16  0x001e      — constant (same "value slot" marker as float)
 *   0x06  uint16  0x0001      — constant (value size = 1 byte)
 *   0x08  uint16  0x0000      — constant (reserved/padding)
 *   0x0A  uint8   value       — 0 or 1
 *
 * A third kind, integers, was re-investigated after fixing the string-pool
 * bug above (the earlier "no reliable signature" conclusion was simply
 * looking in the wrong place) — confirmed against 11 independent records
 * spanning 3 distinct integer type names ("short"/"int"/"long"), each with
 * the byte width its type name implies:
 *   0x00  uint16  poolIndex        — the property's own name
 *   0x02  uint16  typeNameIndex    — points into the SAME string pool, at a
 *                                    name that must resolve to "short"
 *                                    (2 bytes), "int", or "long" (4 bytes
 *                                    each) — unlike float/bool, the type
 *                                    isn't a fixed constant here
 *   0x04  uint16  0x001e           — the same "value slot" marker as float/bool
 *   0x06  uint16  size             — must match the width implied by the
 *                                    resolved type name exactly (2 or 4)
 *   0x08  uint16  0x0000           — constant (reserved/padding)
 *   0x0A  intN    value            — signed little-endian, N = size bytes
 *
 * Because only records matching one of these three exact signatures are
 * touched, editing never changes the file's length — a patched file can be
 * spliced back into its original archive at the exact same offset.
 */

const SENTINEL = [0xef, 0xbe, 0xad, 0xde];
const POOL_HEADER_SIZE = 9; // bytes between the sentinel and the first pool entry
const FLOAT_RECORD_SIZE = 14;
const FLOAT_MAGIC_1 = 0x0021;
const FLOAT_MAGIC_2 = 0x001e;
const FLOAT_MAGIC_3 = 0x0004;
const FLOAT_MAGIC_4 = 0x0000;
const BOOL_RECORD_SIZE = 11;
const BOOL_MAGIC_1 = 0x0018;
const BOOL_MAGIC_2 = 0x001e;
const BOOL_MAGIC_3 = 0x0001;
const BOOL_MAGIC_4 = 0x0000;
const INT_RECORD_HEADER_SIZE = 10;
const INT_MAGIC_SLOT = 0x001e;
const INT_MAGIC_RESERVED = 0x0000;
/** Confirmed integer type names and their exact byte width — any other type-name reference is left untouched. */
const INT_TYPE_SIZES: Record<string, number> = { short: 2, int: 4, long: 4 };
const MAX_POOL_STRING_LEN = 500;

export interface TpleFloatProperty {
  name: string;
  poolIndex: number;
  recordOffset: number;
  valueOffset: number;
  value: number;
}

export interface TpleBoolProperty {
  name: string;
  poolIndex: number;
  recordOffset: number;
  valueOffset: number;
  value: boolean;
}

export interface TpleIntProperty {
  name: string;
  poolIndex: number;
  typeName: string;
  recordOffset: number;
  valueOffset: number;
  size: number;
  value: number;
}

export interface TplePropertyInfo {
  label: string;
  description: string;
  category: "movement" | "physics" | "other";
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

  PhysicsEnabled: { label: "تفعيل الفيزياء", description: "هل يتأثر الكيان بمحرك الفيزياء (الجاذبية والتصادم).", category: "physics" },
  IsQuadruped: { label: "كائن رباعي الأرجل", description: "هل يتحرك الكيان كحيوان رباعي الأرجل بدل ثنائي.", category: "physics" },
  DoHeightCorrection: { label: "تصحيح الارتفاع", description: "تصحيح تلقائي لارتفاع الكيان فوق سطح الأرض.", category: "physics" },
  DisableCollision: { label: "تعطيل التصادم", description: "تجاهل التصادم مع هذا الشكل.", category: "physics" },
  DisableResponse: { label: "تعطيل استجابة التصادم", description: "عدم الاستجابة الفيزيائية عند التصادم (يبقى الاكتشاف فقط).", category: "physics" },
  IsClimbable: { label: "قابل للتسلق", description: "هل يمكن للاعب تسلّق هذا الشكل.", category: "physics" },
  HitByProjectile: { label: "يُصاب بالمقذوفات", description: "هل يمكن أن تصيبه مقذوفات (سهام وغيرها).", category: "physics" },
  IgnoredByTraceRay: { label: "يُتجاهل عند فحص خط الرؤية", description: "يُستثنى من فحوصات الرؤية/الاصطدام الشعاعية (Raycast).", category: "physics" },
  IsUnique: { label: "شكل فريد", description: "شكل غير مكرَّر (لا يُشارَك بين كيانات أخرى).", category: "physics" },
  EnableCCD: { label: "كشف تصادم مستمر", description: "يمنع اختراق الأجسام السريعة الحركة لبعضها (Continuous Collision Detection).", category: "physics" },
  OverrideEntityAABB: { label: "تجاوز الصندوق المحيط", description: "استخدام صندوق تصادم مخصَّص بدل الافتراضي.", category: "physics" },
  TriggersOnTouch: { label: "يُفعَّل عند اللمس", description: "يُطلق حدثاً عند بدء التلامس مع الشكل.", category: "physics" },
  TriggersOnUntouch: { label: "يُفعَّل عند مغادرة اللمس", description: "يُطلق حدثاً عند انتهاء التلامس مع الشكل.", category: "physics" },
  TriggersOnIntersect: { label: "يُفعَّل عند التقاطع", description: "يُطلق حدثاً عند تقاطع الشكل مع شكل آخر.", category: "physics" },
  IsLazyGenerated: { label: "يُولَّد عند الحاجة فقط", description: "لا يُنشأ الشكل الفيزيائي إلا عند الحاجة الفعلية له.", category: "physics" },
  SensorAffectsDirection: { label: "المستشعر يؤثر على الاتجاه", description: "هل يؤثر مستشعر الأرضية على اتجاه حركة الشخصية.", category: "physics" },
  ForceGroundAlignment: { label: "إجبار محاذاة الأرضية", description: "إجبار محاذاة الشخصية مع ميل سطح الأرض.", category: "physics" },
  CanBePushedWhileIdle: { label: "يمكن دفعه أثناء الثبات", description: "هل يمكن دفع الشخصية أثناء وقوفها ساكنة.", category: "physics" },
  TreatWaterAsSolid: { label: "معاملة الماء كسطح صلب", description: "يمنع الشخصية من دخول الماء ويعامله كأرضية.", category: "physics" },
  DisableTranslation: { label: "تعطيل الانتقال المكاني", description: "منع تغيّر موضع الكيان بالكامل.", category: "physics" },
  DisableRotation: { label: "تعطيل الدوران", description: "منع دوران الكيان بالكامل.", category: "physics" },

  // Integer (short/int/long) properties — only a handful of names are
  // confidently understood; most others found by the generic scan look like
  // transient runtime/save state (timestamps, internal counters, currently
  // 0 in the one sample checked), not designer-authored settings, so they're
  // intentionally left uncurated rather than guessing at their purpose.
  InteractionCounter: { label: "عداد التفاعل", description: "عدد مرات التفاعل مع هذا الكيان.", category: "other" },
  MaterialSwitch: { label: "نوع المادة", description: "مؤشر لنوع المادة المستخدمة (قد يؤثر مثلاً على صوت الخطى).", category: "other" },
  DamageBonus: { label: "إضافة على الضرر", description: "قيمة تُضاف عند حساب الضرر.", category: "other" },
  DamageAmount: { label: "مقدار الضرر", description: "القيمة الأساسية للضرر.", category: "other" },
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
    // A length of 0 is a legitimate empty string (e.g. a bCString property's
    // blank default value) — NOT the end of the pool. Only bail out on a
    // clearly-corrupt length or running past the end of the file.
    if (len > MAX_POOL_STRING_LEN || p + len > bytes.length) break;
    names.push(len === 0 ? "" : decoder.decode(bytes.subarray(p, p + len)));
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
  for (let off = 0; off + FLOAT_RECORD_SIZE <= sentinel; off++) {
    const idx = view.getUint16(off, true);
    if (idx >= names.length) continue;
    if (view.getUint16(off + 2, true) !== FLOAT_MAGIC_1) continue;
    if (view.getUint16(off + 4, true) !== FLOAT_MAGIC_2) continue;
    if (view.getUint16(off + 6, true) !== FLOAT_MAGIC_3) continue;
    if (view.getUint16(off + 8, true) !== FLOAT_MAGIC_4) continue;
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

/** Scans the whole file for bool-property records matching the exact verified signature. Returns [] if the file isn't a recognized .tple (no sentinel found). */
export function findTpleBoolProperties(bytes: Uint8Array): TpleBoolProperty[] {
  const sentinel = findSentinelOffset(bytes);
  if (sentinel < 0) return [];
  const names = parseTpleStringPool(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const results: TpleBoolProperty[] = [];
  for (let off = 0; off + BOOL_RECORD_SIZE <= sentinel; off++) {
    const idx = view.getUint16(off, true);
    if (idx >= names.length) continue;
    if (view.getUint16(off + 2, true) !== BOOL_MAGIC_1) continue;
    if (view.getUint16(off + 4, true) !== BOOL_MAGIC_2) continue;
    if (view.getUint16(off + 6, true) !== BOOL_MAGIC_3) continue;
    if (view.getUint16(off + 8, true) !== BOOL_MAGIC_4) continue;
    results.push({
      name: names[idx],
      poolIndex: idx,
      recordOffset: off,
      valueOffset: off + 10,
      value: bytes[off + 10] !== 0,
    });
  }
  return results;
}

/** Scans the whole file for integer-property records matching the exact verified signature (type resolved via a pool-index reference, not a fixed constant). Returns [] if the file isn't a recognized .tple (no sentinel found). */
export function findTpleIntProperties(bytes: Uint8Array): TpleIntProperty[] {
  const sentinel = findSentinelOffset(bytes);
  if (sentinel < 0) return [];
  const names = parseTpleStringPool(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const results: TpleIntProperty[] = [];
  for (let off = 0; off + INT_RECORD_HEADER_SIZE <= sentinel; off++) {
    const propIdx = view.getUint16(off, true);
    if (propIdx >= names.length) continue;
    const typeIdx = view.getUint16(off + 2, true);
    if (typeIdx >= names.length) continue;
    const typeName = names[typeIdx];
    const expectedSize = INT_TYPE_SIZES[typeName];
    if (expectedSize === undefined) continue;
    if (view.getUint16(off + 4, true) !== INT_MAGIC_SLOT) continue;
    const size = view.getUint16(off + 6, true);
    if (size !== expectedSize) continue;
    if (view.getUint16(off + 8, true) !== INT_MAGIC_RESERVED) continue;
    if (off + INT_RECORD_HEADER_SIZE + size > sentinel) continue;
    const value = size === 2 ? view.getInt16(off + 10, true) : view.getInt32(off + 10, true);
    results.push({ name: names[propIdx], poolIndex: propIdx, typeName, recordOffset: off, valueOffset: off + 10, size, value });
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

/** Patches bool values in place (by valueOffset) — never changes the file's length. */
export function applyTpleBoolEdits(bytes: Uint8Array, edits: Map<number, boolean>): Uint8Array {
  const out = new Uint8Array(bytes);
  for (const [valueOffset, value] of edits) {
    out[valueOffset] = value ? 1 : 0;
  }
  return out;
}

/** Patches integer values in place (by valueOffset) — each edit carries its
 * own byte width (2 or 4, from the matching TpleIntProperty.size) since it
 * varies per property; never changes the file's length. */
export function applyTpleIntEdits(bytes: Uint8Array, edits: Map<number, { value: number; size: number }>): Uint8Array {
  const out = new Uint8Array(bytes);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  for (const [valueOffset, { value, size }] of edits) {
    if (size === 2) view.setInt16(valueOffset, value, true);
    else view.setInt32(valueOffset, value, true);
  }
  return out;
}

export interface ArchiveReplacement {
  offset: number;
  size: number;
  bytes: Uint8Array;
}

/** Splices same-size replacements for any number of entries back into one full
 * copy of the archive they came from. Validates every replacement BEFORE
 * touching the output buffer, so it either applies all of them or throws
 * without producing a partially-patched result. */
export function spliceMultipleFilesIntoArchive(archiveBytes: Uint8Array, replacements: ArchiveReplacement[]): Uint8Array {
  for (const r of replacements) {
    if (r.bytes.length !== r.size) {
      throw new Error(`حجم الملف المعدَّل (${r.bytes.length}) لا يطابق حجمه الأصلي (${r.size}) عند الموضع ${r.offset} — لا يمكن إدخاله بنفس المكان بأمان`);
    }
    if (r.offset + r.size > archiveBytes.length) {
      throw new Error(`موضع الملف عند ${r.offset} خارج حدود الأرشيف`);
    }
  }
  const out = new Uint8Array(archiveBytes);
  for (const r of replacements) out.set(r.bytes, r.offset);
  return out;
}

/** Splices a same-size replacement for one entry back into a full copy of the archive it came from. */
export function spliceFileIntoArchive(
  archiveBytes: Uint8Array,
  entryOffset: number,
  entrySize: number,
  newEntryBytes: Uint8Array,
): Uint8Array {
  return spliceMultipleFilesIntoArchive(archiveBytes, [{ offset: entryOffset, size: entrySize, bytes: newEntryBytes }]);
}

export interface TpleBatchOccurrence {
  path: string;
  kind: "float" | "bool" | "int";
  valueOffset: number;
  value: number | boolean;
  /** Only set (and only meaningful) for kind "int" — the byte width to write back (2 or 4). */
  size?: number;
}

/** Scans multiple already-read .tple files and groups every recognized
 * property by name, across all of them — the basis for bulk-editing one
 * property (e.g. ForwardSpeedMax) across every template in an archive at
 * once. Files with no recognized properties simply contribute nothing. */
export function buildTpleBatchIndex(files: Array<{ path: string; bytes: Uint8Array }>): Map<string, TpleBatchOccurrence[]> {
  const index = new Map<string, TpleBatchOccurrence[]>();
  const add = (name: string, occurrence: TpleBatchOccurrence) => {
    const list = index.get(name);
    if (list) list.push(occurrence);
    else index.set(name, [occurrence]);
  };
  for (const { path, bytes } of files) {
    for (const p of findTpleFloatProperties(bytes)) {
      add(p.name, { path, kind: "float", valueOffset: p.valueOffset, value: p.value });
    }
    for (const p of findTpleBoolProperties(bytes)) {
      add(p.name, { path, kind: "bool", valueOffset: p.valueOffset, value: p.value });
    }
    for (const p of findTpleIntProperties(bytes)) {
      add(p.name, { path, kind: "int", valueOffset: p.valueOffset, value: p.value, size: p.size });
    }
  }
  return index;
}
