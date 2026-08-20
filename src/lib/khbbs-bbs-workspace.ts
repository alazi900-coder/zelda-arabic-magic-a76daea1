/**
 * STYLE: مساحة عمل Kingdom Hearts هادئة ومباشرة. لا تنقل مورداً ولا تغيّر
 * فهرس BBSA؛ كل إدخال يستبدل بايتات المورد نفسه ضمن حجزه القطاعي الأصلي.
 */

import JSZip from "jszip";
import {
  getBbsEntryFilename,
  isKHBbsFontArchive,
  readBbsArchiveEntry,
  type BbsArchiveEntry,
  type BbsArchiveIndex,
} from "@/lib/khbbs-bbsa";
import {
  getKHBbsDatWritableWorkspace,
  hasKHBbsDatWritableWorkspace,
  writeKHBbsDatResource,
  type KHBbsDatResourceSource,
} from "@/lib/khbbs-dat-workspace";

export interface KHBbsResourceReference extends KHBbsDatResourceSource {
  filename: string;
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
  kind: "direct" | "zip";
  archive?: Blob;
  changedArchives: number[];
  changedResources: number;
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

async function fullReplacement(source: KHBbsResourceReference, nextBytes: Uint8Array): Promise<{ next: Uint8Array; previous: Uint8Array }> {
  const workspace = activeWorkspace;
  if (!workspace) throw new Error("افتح BBS0–BBS3 من مدير Kingdom Hearts أولاً.");
  const entry = workspace.archive.entries.find((item) => item.id === source.entryId);
  const archive = workspace.archive.archives.get(source.archiveIndex);
  if (!entry || !archive || entry.allocatedBytes !== source.allocatedBytes) throw new Error(`فُقد مرجع المورد ${source.filename}. أعد فتح ملفات BBS.`);
  assertReplacement(source, nextBytes, source.filename);
  const previous = new Uint8Array(await archive.slice(source.byteOffset, source.byteOffset + source.allocatedBytes).arrayBuffer());
  const next = previous.slice();
  next.set(nextBytes, 0);
  return { next, previous };
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

export function getKHBbsFontReplacement(): KHBbsFontReplacement | null {
  return activeWorkspace?.font ?? null;
}

export async function buildKHBbsDatOutput(replacements: Array<{ source: KHBbsResourceReference; bytes: Uint8Array }>): Promise<KHBbsDatOutput> {
  const workspace = activeWorkspace;
  if (!workspace) throw new Error("افتح BBS0–BBS4 من مدير Kingdom Hearts أولاً قبل بناء DAT.");
  const all = [...replacements];
  if (workspace.font) {
    for (const source of workspace.font.sources) all.push({ source, bytes: workspace.font.bytes });
  }
  const unique = new Map<string, { source: KHBbsResourceReference; bytes: Uint8Array }>();
  for (const replacement of all) unique.set(replacement.source.entryId, replacement);
  const updates = [...unique.values()];
  if (updates.length === 0) throw new Error("لا توجد ترجمة أو خط معدّل لإدخاله في BBS.");

  const exact = await Promise.all(updates.map(async (replacement) => ({
    ...replacement,
    ...(await fullReplacement(replacement.source, replacement.bytes)),
  })));
  const changed = exact.filter(({ next, previous }) => !equalBytes(next, previous));
  if (changed.length === 0) throw new Error("الملفات المختارة مطابقة للأصل؛ لا يوجد مورد جديد للكتابة.");

  if (hasKHBbsDatWritableWorkspace()) {
    const writable = getKHBbsDatWritableWorkspace();
    if (!writable) throw new Error("تعذرت قراءة صلاحية DAT القابلة للكتابة.");
    for (const replacement of changed) {
      if (!writable.handles.has(replacement.source.archiveIndex)) {
        throw new Error(`افتح BBS${replacement.source.archiveIndex}.DAT أيضاً بصلاحية الكتابة؛ يحتوي مورداً مترجماً.`);
      }
    }
    for (const replacement of changed) {
      await writeKHBbsDatResource(replacement.source, replacement.next, replacement.previous);
    }
    return {
      kind: "direct",
      changedArchives: [...new Set(changed.map((item) => item.source.archiveIndex))].sort((left, right) => left - right),
      changedResources: changed.length,
    };
  }

  const byArchive = new Map<number, typeof changed>();
  for (const replacement of changed) byArchive.set(replacement.source.archiveIndex, [...(byArchive.get(replacement.source.archiveIndex) ?? []), replacement]);
  const zip = new JSZip();
  for (const [archiveIndex, archiveUpdates] of byArchive) {
    const original = workspace.archive.archives.get(archiveIndex);
    if (!original) throw new Error(`BBS${archiveIndex}.DAT غير متاح لإخراج النسخة المعدلة.`);
    const ordered = [...archiveUpdates].sort((left, right) => left.source.byteOffset - right.source.byteOffset);
    const parts: BlobPart[] = [];
    let cursor = 0;
    for (const replacement of ordered) {
      if (replacement.source.byteOffset < cursor) throw new Error("تعارض غير متوقع بين موردين داخل DAT؛ ألغيت البناء حمايةً للملف.");
      parts.push(original.slice(cursor, replacement.source.byteOffset));
      parts.push(replacement.next);
      cursor = replacement.source.byteOffset + replacement.source.allocatedBytes;
    }
    parts.push(original.slice(cursor));
    zip.file(`BBS${archiveIndex}.DAT`, new Blob(parts, { type: "application/octet-stream" }));
  }
  return {
    kind: "zip",
    archive: await zip.generateAsync({ type: "blob", compression: "STORE" }),
    changedArchives: [...byArchive.keys()].sort((left, right) => left - right),
    changedResources: changed.length,
  };
}
