/**
 * مساحة عمل DAT قابلة للكتابة لجهاز المستخدم فقط.
 * لا تُرسل ملفات اللعبة إلى خادم ولا تعيد بناء BBSA: تكتب مورداً ثابت الطول
 * في إزاحته الأصلية داخل BBS0–BBS4 بعد التحقق من كل بايت كمسار Risen.
 */

import {
  getBbsEntryFilename,
  indexKHBbsDatFiles,
  type BbsArchiveEntry,
  type BbsArchiveIndex,
} from "@/lib/khbbs-bbsa";

export interface KHBbsDatResourceSource {
  kind: "bbs-dat";
  entryId: string;
  archiveIndex: number;
  byteOffset: number;
  allocatedBytes: number;
}

interface KHBbsDatWorkspace {
  archive: BbsArchiveIndex;
  handles: Map<number, FileSystemFileHandle>;
}

let activeWorkspace: KHBbsDatWorkspace | null = null;

function archiveIndexFromName(name: string): number | null {
  const match = name.trim().match(/^bbs([0-4])\.dat$/i);
  return match ? Number(match[1]) : null;
}

function firstMismatch(left: Uint8Array, right: Uint8Array): number {
  if (left.length !== right.length) return Math.min(left.length, right.length);
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return index;
  return -1;
}

async function writeExact(handle: FileSystemFileHandle, position: number, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable({ keepExistingData: true });
  try {
    await writable.write({ type: "write", position, data: bytes as BufferSource });
  } finally {
    await writable.close();
  }
}

export async function openKHBbsDatWritableWorkspace(handles: FileSystemFileHandle[]): Promise<BbsArchiveIndex> {
  const files = await Promise.all(handles.map((handle) => handle.getFile()));
  const archive = await indexKHBbsDatFiles(files);
  const indexedHandles = new Map<number, FileSystemFileHandle>();
  for (const handle of handles) {
    const index = archiveIndexFromName(handle.name);
    if (index !== null) indexedHandles.set(index, handle);
  }
  if (!indexedHandles.has(0)) throw new Error("اختر BBS0.DAT من نافذة «فتح قابل للكتابة»؛ فهو مطلوب للكتابة المباشرة.");
  activeWorkspace = { archive, handles: indexedHandles };
  return archive;
}

export function clearKHBbsDatWritableWorkspace(): void {
  activeWorkspace = null;
}

export function getKHBbsDatWritableWorkspace(): KHBbsDatWorkspace | null {
  return activeWorkspace;
}

export function hasKHBbsDatWritableWorkspace(): boolean {
  return activeWorkspace !== null;
}

export async function loadKHBbsDatTim2Resources(): Promise<Array<{
  source: KHBbsDatResourceSource;
  path: string;
  bytes: Uint8Array;
}>> {
  const workspace = activeWorkspace;
  if (!workspace) throw new Error("افتح BBS0–BBS4.DAT أولاً من مدير الملفات بزر «فتح قابل للكتابة».");

  const resources: Array<{ source: KHBbsDatResourceSource; path: string; bytes: Uint8Array }> = [];
  for (const entry of workspace.archive.entries) {
    if (entry.extension.toLowerCase() !== "tm2" || !entry.downloadAvailable || entry.isStreamed) continue;
    const archive = workspace.archive.archives.get(entry.archiveIndex);
    if (!archive) continue;
    const bytes = new Uint8Array(await archive.slice(entry.byteOffset, entry.byteOffset + entry.allocatedBytes).arrayBuffer());
    resources.push({
      source: {
        kind: "bbs-dat",
        entryId: entry.id,
        archiveIndex: entry.archiveIndex,
        byteOffset: entry.byteOffset,
        allocatedBytes: entry.allocatedBytes,
      },
      path: `${entry.directory}/${getBbsEntryFilename(entry)}`,
      bytes,
    });
  }
  return resources;
}

/**
 * يكتب المورد في موضعه الأصلي فقط. يجب أن يكون الحجم مساوياً تماماً لحجز BBSA؛
 * لذلك لا يمكن لهذا المسار أن يزحزح المورد التالي أو يغير جدول الملفات.
 */
export async function writeKHBbsDatResource(
  source: KHBbsDatResourceSource,
  nextBytes: Uint8Array,
  previousBytes: Uint8Array,
): Promise<void> {
  const workspace = activeWorkspace;
  if (!workspace) throw new Error("انتهت جلسة ملفات DAT القابلة للكتابة؛ افتح ملفات DAT مرة أخرى قبل الاستبدال.");
  const entry = workspace.archive.entries.find((item) => item.id === source.entryId);
  const handle = workspace.handles.get(source.archiveIndex);
  if (!entry || !handle) throw new Error(`لا تتوفر صلاحية الكتابة في BBS${source.archiveIndex}.DAT لهذا المورد.`);
  if (nextBytes.length !== source.allocatedBytes || previousBytes.length !== source.allocatedBytes || entry.allocatedBytes !== source.allocatedBytes) {
    throw new Error("توقف الاستبدال: حجم TIM2 لا يطابق الحجز الأصلي في DAT، لحماية المورد التالي.");
  }

  const writableHandle = handle as FileSystemFileHandle & {
    queryPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
  };
  if (!writableHandle.queryPermission || !writableHandle.requestPermission) {
    throw new Error("هذا المتصفح لا يدعم طلب صلاحية الكتابة المباشرة لملف DAT.");
  }
  const permission = await writableHandle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted" && await writableHandle.requestPermission({ mode: "readwrite" }) !== "granted") {
    throw new Error("لم تُمنح الأداة صلاحية الكتابة في ملف DAT الأصلي.");
  }

  const beforeArchive = await handle.getFile();
  const beforeBytes = new Uint8Array(await beforeArchive.slice(source.byteOffset, source.byteOffset + source.allocatedBytes).arrayBuffer());
  if (firstMismatch(beforeBytes, previousBytes) !== -1) {
    throw new Error("توقف الاستبدال: المورد الأصلي تغير منذ فتحه في الأداة. أعد فتح ملفات DAT لتجنب الكتابة فوق تعديل أحدث.");
  }

  try {
    await writeExact(handle, source.byteOffset, nextBytes);
  } catch (caught) {
    try { await writeExact(handle, source.byteOffset, previousBytes); } catch { /* تبلغ الرسالة الأصلية عن الفشل؛ لا نخفيها */ }
    throw new Error(`تعذرت كتابة المورد في DAT؛ حُفظت محاولة استعادة النسخة السابقة. ${caught instanceof Error ? caught.message : ""}`.trim());
  }
  const freshArchive = await handle.getFile();
  const written = new Uint8Array(await freshArchive.slice(source.byteOffset, source.byteOffset + source.allocatedBytes).arrayBuffer());
  const mismatch = firstMismatch(written, nextBytes);
  if (mismatch !== -1) {
    // لا نترك كتابة جزئية أو إزاحة خاطئة صامتة: نعيد المورد السابق فوراً.
    await writeExact(handle, source.byteOffset, previousBytes);
    throw new Error(`فشل التحقق بعد الكتابة عند البايت ${mismatch}؛ أُعيد المورد السابق فوراً.`);
  }

  workspace.archive.archives.set(source.archiveIndex, freshArchive);
}
