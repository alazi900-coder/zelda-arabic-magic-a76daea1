/**
 * STYLE: مساحة عمل Kingdom Hearts هادئة ومباشرة. مخرجات البناء تضم BBS0–BBS3
 * كاملة؛ لا تنقل مورداً ولا تغيّر فهرس BBSA، وكل إدخال يستبدل بايتات المورد
 * نفسه ضمن حجزه القطاعي الأصلي.
 */

import JSZip from "jszip";
import {
  BBS_SECTOR_SIZE,
  getBbsEntryFilename,
  isKHBbsFontArchive,
  readBbsArchiveEntry,
  type BbsArchiveEntry,
  type BbsArchiveIndex,
} from "@/lib/khbbs-bbsa";
import type { KHBbsDatResourceSource } from "@/lib/khbbs-dat-workspace";

/** ملف العربية المصحح المضمّن؛ لا يُحمّل ولا يُكتب إلا بعد ضغط المستخدم لزر استخدامه. */
export const KHBBS_BUILT_IN_ARABIC_FONT_URL = "/manus-storage/Font.arabic.fixed_1ef34122.arc";
export const KHBBS_BUILT_IN_ARABIC_FONT_FILENAME = "Font.arabic.arc";

export interface KHBbsResourceReference extends KHBbsDatResourceSource {
  filename: string;
  allocatedSectors: number;
  isVerifiedCtd: boolean;
  infoTableOffset: number | null;
  sourceInfo: number;
}

export interface KHBbsCtdEditorInput {
  file: File;
  bbsSource: KHBbsResourceReference;
}

interface KHBbsFontReplacement {
  sources: KHBbsResourceReference[];
  bytes: Uint8Array;
  filename: string;
}

interface KHBbsBbsWorkspace {
  archive: BbsArchiveIndex;
  font: KHBbsFontReplacement | null;
}

export interface KHBbsDatOutput {
  archive: Blob;
  archives: ReadonlyMap<number, Blob>;
  includedArchives: readonly [0, 1, 2, 3];
  changedArchives: number[];
  changedResources: number;
  /** تحذيرات البناء التجريبي التي يراها المستخدم بعد التنزيل. */
  warnings: string[];
}

let activeWorkspace: KHBbsBbsWorkspace | null = null;

function toSource(entry: BbsArchiveEntry): KHBbsResourceReference {
  return {
    kind: "bbs-dat",
    entryId: entry.id,
    archiveIndex: entry.archiveIndex,
    byteOffset: entry.byteOffset,
    allocatedBytes: entry.allocatedBytes,
    filename: getBbsEntryFilename(entry),
    allocatedSectors: entry.allocatedSectors,
    isVerifiedCtd: entry.isVerifiedCtd,
    infoTableOffset: entry.infoTableOffset,
    sourceInfo: entry.sourceInfo,
  };
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function assertReplacement(source: KHBbsResourceReference, bytes: Uint8Array, label: string): void {
  if (bytes.byteLength > source.allocatedBytes) {
    throw new Error(`${label} أكبر من الحجز الأصلي: يحتاج ${bytes.byteLength.toLocaleString("ar")} بايت بينما المورد يسمح بـ ${source.allocatedBytes.toLocaleString("ar")} بايت. لم تُحرّك الأداة المورد التالي.`);
  }
}

interface KHBbsArchivePatch {
  byteOffset: number;
  bytes: Uint8Array;
  label: string;
  /** رقماً أكبر يعني أن هذا التعديل ينتصر عند التداخل المقصود في تجربة CTD. */
  priority?: number;
}

interface KHBbsPreparedReplacement {
  source: KHBbsResourceReference;
  changed: boolean;
  patches: KHBbsArchivePatch[];
  warnings: string[];
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && end > otherStart;
}

async function isAllZero(archive: File, offset: number, length: number): Promise<boolean> {
  const bytes = new Uint8Array(await archive.slice(offset, offset + length).arrayBuffer());
  return bytes.every((byte) => byte === 0);
}

/**
 * يختار فجوة صفرية حقيقية بين موارد BBS0 المفهرسة. لا يلمس حجم الملف، ولا
 * يعيد استخدام أي قطاع محجوز أو أي مساحة سُجلت لنقل CTD آخر في البناء نفسه.
 */
async function findBbs0FreeSectors(requiredSectors: number, claimed: Array<{ start: number; end: number }>): Promise<number | null> {
  const workspace = activeWorkspace;
  if (!workspace) throw new Error("افتح BBS0–BBS3 من مدير Kingdom Hearts أولاً.");
  const bbs0 = workspace.archive.archives.get(0);
  if (!bbs0) return null;
  const firstSafeOffset = Math.ceil(workspace.archive.metadataEndOffset / BBS_SECTOR_SIZE) * BBS_SECTOR_SIZE;
  const occupied = [
    ...workspace.archive.entries
      .filter((entry) => entry.archiveIndex === 0 && entry.downloadAvailable && !entry.isStreamed && entry.allocatedBytes > 0)
      .map((entry) => ({ start: entry.byteOffset, end: entry.byteOffset + entry.allocatedBytes })),
    ...claimed,
  ].sort((left, right) => left.start - right.start);
  const requiredBytes = requiredSectors * BBS_SECTOR_SIZE;
  let cursor = firstSafeOffset;
  for (const range of [...occupied, { start: bbs0.size, end: bbs0.size }]) {
    if (range.end <= cursor) continue;
    const candidate = Math.ceil(cursor / BBS_SECTOR_SIZE) * BBS_SECTOR_SIZE;
    if (candidate + requiredBytes <= range.start && await isAllZero(bbs0, candidate, requiredBytes)) return candidate;
    cursor = Math.max(cursor, range.end);
  }
  return null;
}

async function prepareReplacement(
  source: KHBbsResourceReference,
  nextBytes: Uint8Array,
  claimedBbs0Ranges: Array<{ start: number; end: number }>,
): Promise<KHBbsPreparedReplacement> {
  const workspace = activeWorkspace;
  if (!workspace) throw new Error("افتح BBS0–BBS3 من مدير Kingdom Hearts أولاً.");
  const entry = workspace.archive.entries.find((item) => item.id === source.entryId);
  const archive = workspace.archive.archives.get(source.archiveIndex);
  if (!entry || !archive || entry.allocatedBytes !== source.allocatedBytes) throw new Error(`فُقد مرجع المورد ${source.filename}. أعد فتح ملفات BBS.`);
  if (nextBytes.byteLength <= source.allocatedBytes) {
    const previous = new Uint8Array(await archive.slice(source.byteOffset, source.byteOffset + source.allocatedBytes).arrayBuffer());
    const next = previous.slice();
    next.set(nextBytes, 0);
    return {
      source,
      changed: !equalBytes(next, previous),
      patches: [{ byteOffset: source.byteOffset, bytes: next, label: source.filename }],
      warnings: [],
    };
  }

  if (source.archiveIndex !== 0 || !source.isVerifiedCtd || source.infoTableOffset === null) {
    assertReplacement(source, nextBytes, source.filename);
  }
  const requiredSectors = Math.ceil(nextBytes.byteLength / BBS_SECTOR_SIZE);
  const destinationOffset = await findBbs0FreeSectors(requiredSectors, claimedBbs0Ranges);
  if (destinationOffset === null) {
    const overflowBytes = nextBytes.byteLength - source.allocatedBytes;
    const followingEntry = workspace.archive.entries
      .filter((item) => item.archiveIndex === 0 && item.downloadAvailable && !item.isStreamed && item.byteOffset >= source.byteOffset + source.allocatedBytes)
      .sort((left, right) => left.byteOffset - right.byteOffset)[0];
    const nextLabel = followingEntry ? getBbsEntryFilename(followingEntry) : "نهاية BBS0.DAT";
    return {
      source,
      changed: true,
      patches: [{ byteOffset: source.byteOffset, bytes: nextBytes, label: `${source.filename} (تجريبي قسري)`, priority: 0 }],
      warnings: [`تجربة قسرية: ${source.filename} تجاوز حجزه بـ ${overflowBytes.toLocaleString("ar")} بايت ووصل إلى ${nextLabel}. قد لا تعمل اللعبة؛ اختبر الناتج فقط.`],
    };
  }
  const destinationSectors = destinationOffset / BBS_SECTOR_SIZE;
  const newGlobalSector = destinationSectors - workspace.archive.headerSectors.archive0;
  if (!Number.isInteger(newGlobalSector) || newGlobalSector < 0 || newGlobalSector > 0x000fffff) {
    throw new Error(`تعذر تسجيل موضع آمن جديد لـ ${source.filename} داخل جدول BBSA.`);
  }
  const movedBytes = new Uint8Array(requiredSectors * BBS_SECTOR_SIZE);
  movedBytes.set(nextBytes, 0);
  const infoBytes = new Uint8Array(4);
  new DataView(infoBytes.buffer).setUint32(0, (newGlobalSector << 12) | requiredSectors, true);
  claimedBbs0Ranges.push({ start: destinationOffset, end: destinationOffset + movedBytes.byteLength });
  return {
    source,
    changed: true,
    patches: [
      { byteOffset: source.infoTableOffset, bytes: infoBytes, label: `سجل BBSA لـ ${source.filename}` },
      { byteOffset: destinationOffset, bytes: movedBytes, label: source.filename },
    ],
    warnings: [],
  };
}

/**
 * ينشئ نسخة DAT بالحجم نفسه. عند البناء القسري، يطبق تعديل المورد اللاحق فوق
 * الذيل المتجاوز بدلاً من تغيير طول الملف؛ هذا يحافظ على ترويسة BBS وحدوده.
 */
function patchArchiveKeepingSize(original: File, patches: KHBbsArchivePatch[]): Blob {
  const ordered = patches.map((patch, index) => ({ ...patch, index }));
  for (const patch of ordered) {
    if (patch.byteOffset < 0 || patch.byteOffset + patch.bytes.byteLength > original.size) {
      throw new Error(`تجاوزت تجربة الكتابة حدود ${original.name}؛ لم يُنشأ أي ملف.`);
    }
  }
  const boundaries = [...new Set([
    0,
    original.size,
    ...ordered.flatMap((patch) => [patch.byteOffset, patch.byteOffset + patch.bytes.byteLength]),
  ])].sort((left, right) => left - right);
  const parts: BlobPart[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const active = ordered
      .filter((patch) => patch.byteOffset <= start && patch.byteOffset + patch.bytes.byteLength >= end)
      .sort((left, right) => (left.priority ?? 1) - (right.priority ?? 1) || left.index - right.index)
      .at(-1);
    if (active) {
      parts.push(active.bytes.slice(start - active.byteOffset, end - active.byteOffset));
    } else {
      parts.push(original.slice(start, end));
    }
  }
  const output = new Blob(parts, { type: "application/octet-stream" });
  if (output.size !== original.size) throw new Error(`توقفت التجربة لأن حجم ${original.name} تغيّر؛ لم يُنشأ أي ملف.`);
  return output;
}

export function clearKHBbsBbsWorkspace(): void {
  activeWorkspace = null;
}

export function setKHBbsBbsWorkspace(archive: BbsArchiveIndex): void {
  activeWorkspace = { archive, font: null };
}

export function hasKHBbsBbsWorkspace(): boolean {
  return activeWorkspace !== null;
}

export function getKHBbsBbsWorkspace(): KHBbsBbsWorkspace | null {
  return activeWorkspace;
}

export function makeKHBbsResourceReference(entry: BbsArchiveEntry): KHBbsResourceReference {
  return toSource(entry);
}

export async function readKHBbsCtdSelection(entries: BbsArchiveEntry[]): Promise<KHBbsCtdEditorInput[]> {
  const workspace = activeWorkspace;
  if (!workspace) throw new Error("افتح ملفات BBS من مدير Kingdom Hearts أولاً.");
  const selected = entries.filter((entry) => entry.isVerifiedCtd && entry.downloadAvailable && !entry.isStreamed);
  if (selected.length === 0) throw new Error("اختر ملفات CTD مؤكدة بالترويسة أولاً.");
  return Promise.all(selected.map(async (entry) => {
    const blob = await readBbsArchiveEntry(entry, workspace.archive.archives);
    return {
      file: new File([blob], getBbsEntryFilename(entry), { type: "application/octet-stream" }),
      bbsSource: toSource(entry),
    };
  }));
}

export async function setKHBbsFontReplacement(upload: File): Promise<KHBbsResourceReference[]> {
  const workspace = activeWorkspace;
  if (!workspace) throw new Error("افتح ملفات BBS من مدير Kingdom Hearts أولاً.");
  if (!upload.name.toLowerCase().endsWith(".arc")) throw new Error("اختر ملف Font.arabic.arc بصيغة ARC.");
  const candidates: BbsArchiveEntry[] = [];
  for (const entry of workspace.archive.entries) {
    if (await isKHBbsFontArchive(entry, workspace.archive.archives)) candidates.push(entry);
  }
  if (candidates.length === 0) throw new Error("لم تعثر الأداة على Font.arc الذي يحتوي mesfont وcmdfont داخل BBS المفتوحة.");
  const sources = candidates.map(toSource);
  const bytes = new Uint8Array(await upload.arrayBuffer());
  for (const source of sources) assertReplacement(source, bytes, upload.name);
  workspace.font = { sources, bytes, filename: upload.name };
  return sources;
}

/**
 * يجلب ملف الخط العربي المصحح فقط بعد اختيار المستخدم له في الواجهة، ثم يمرره
 * إلى نفس فحص أرشيف الخط الذي يستعمله الملف اليدوي. لا يبني BBS ولا ISO هنا.
 */
export async function setKHBbsBuiltInArabicFontReplacement(): Promise<KHBbsResourceReference[]> {
  const response = await fetch(KHBBS_BUILT_IN_ARABIC_FONT_URL);
  if (!response.ok) throw new Error("تعذر تحميل Font.arabic.arc المضمّن. تحقق من اتصالك ثم أعد المحاولة.");
  const upload = new File([await response.blob()], KHBBS_BUILT_IN_ARABIC_FONT_FILENAME, { type: "application/octet-stream" });
  return setKHBbsFontReplacement(upload);
}

export function getKHBbsFontReplacement(): KHBbsFontReplacement | null {
  return activeWorkspace?.font ?? null;
}

export async function buildKHBbsDatOutput(replacements: Array<{ source: KHBbsResourceReference; bytes: Uint8Array }>): Promise<KHBbsDatOutput> {
  const workspace = activeWorkspace;
  if (!workspace) throw new Error("افتح BBS0.DAT إلى BBS3.DAT من مدير Kingdom Hearts أولاً قبل البناء.");
  const requiredArchives: [0, 1, 2, 3] = [0, 1, 2, 3];
  const missingArchives = requiredArchives.filter((archiveIndex) => !workspace.archive.archives.has(archiveIndex));
  if (missingArchives.length > 0) {
    throw new Error(`اختر ${missingArchives.map((archiveIndex) => `BBS${archiveIndex}.DAT`).join("، ")} أيضاً. البناء ينزّل BBS0–BBS3 كاملة؛ BBS2 وBBS3 يُمران كما هما.`);
  }
  const all = [...replacements];
  if (workspace.font) {
    for (const source of workspace.font.sources) all.push({ source, bytes: workspace.font.bytes });
  }
  const unique = new Map<string, { source: KHBbsResourceReference; bytes: Uint8Array }>();
  for (const replacement of all) unique.set(replacement.source.entryId, replacement);
  const updates = [...unique.values()];
  if (updates.length === 0) throw new Error("لا توجد ترجمة أو خط معدّل لإدخاله في BBS.");

  const claimedBbs0Ranges: Array<{ start: number; end: number }> = [];
  const prepared: KHBbsPreparedReplacement[] = [];
  for (const replacement of updates) prepared.push(await prepareReplacement(replacement.source, replacement.bytes, claimedBbs0Ranges));
  const changed = prepared.filter((replacement) => replacement.changed);
  if (changed.length === 0) throw new Error("الملفات المختارة مطابقة للأصل؛ لا يوجد مورد جديد للكتابة.");

  const byArchive = new Map<number, KHBbsArchivePatch[]>();
  for (const replacement of changed) {
    const archiveIndex = replacement.source.archiveIndex;
    byArchive.set(archiveIndex, [...(byArchive.get(archiveIndex) ?? []), ...replacement.patches]);
  }
  const zip = new JSZip();
  const archives = new Map<number, Blob>();
  for (const archiveIndex of requiredArchives) {
    const original = workspace.archive.archives.get(archiveIndex);
    if (!original) throw new Error(`BBS${archiveIndex}.DAT غير متاح لإخراج النسخة المعدلة.`);
    const archiveUpdates = byArchive.get(archiveIndex) ?? [];
    if (archiveUpdates.length === 0) {
      zip.file(`BBS${archiveIndex}.DAT`, original);
      archives.set(archiveIndex, original);
      continue;
    }
    const patched = patchArchiveKeepingSize(original, archiveUpdates);
    zip.file(`BBS${archiveIndex}.DAT`, patched);
    archives.set(archiveIndex, patched);
  }
  return {
    archive: await zip.generateAsync({ type: "blob", compression: "STORE" }),
    archives,
    includedArchives: requiredArchives,
    changedArchives: [...byArchive.keys()].sort((left, right) => left - right),
    changedResources: changed.length,
    warnings: prepared.flatMap((replacement) => replacement.warnings),
  };
}
