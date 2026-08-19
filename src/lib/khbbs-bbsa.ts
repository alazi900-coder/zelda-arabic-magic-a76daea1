/**
 * STYLE: طبقة تحليل محافظة لملفات Kingdom Hearts BBS؛ تقرأ الفهرس فقط ولا
 * تكتب إلى DAT. تُظهر اسم التجزئة بوضوح إذا لم يكن الاسم الأصلي معروفاً.
 */

export const BBS_SECTOR_SIZE = 0x800;
const MAX_PARTITIONS = 4096;
const MAX_DIRECTORY_COUNT = 64;
const MAX_ENTRIES = 100_000;

export interface BbsArchiveEntry {
  id: string;
  archiveIndex: number;
  sourceArchiveName: string;
  directory: string;
  directoryHash: number;
  fileHash: number;
  extension: string;
  globalSector: number;
  localSector: number;
  allocatedSectors: number;
  allocatedBytes: number;
  byteOffset: number;
  downloadAvailable: boolean;
  isStreamed: boolean;
}

export interface BbsArchiveIndex {
  version: number;
  archives: Map<number, File>;
  entries: BbsArchiveEntry[];
  warnings: string[];
  headerSectors: {
    archive0: number;
    archive1: number;
    archive2: number;
    archive3: number;
    archive4: number;
  };
}

interface BbsaHeader {
  version: number;
  partitionCount: number;
  partitionEntriesCount: number;
  directoryCount: number;
  directoryEntriesCount: number;
  partitionOffset: number;
  directoryOffset: number;
  archive0Sector: number;
  archive1Sector: number;
  archive2Sector: number;
  archive3Sector: number;
  archive4Sector: number;
}

const KNOWN_EXTENSIONS = [
  "arc", "bin", "tm2", "pmo", "pam", "pmp", "pvd", "bcd", "fep", "frr", "ead", "ese", "lub", "lad", "l2d", "pst",
  "epd", "olo", "bep", "txa", "aac", "abc", "scd", "bsd", "seb", "ctd", "ecm", "ept", "mss", "nmd", "ite", "itb",
  "itc", "bdd", "bdc", "ngd", "exb", "gpd", "exa", "esd", "mtx", "inf", "cod", "clu", "pmf", "ese", "ptx", "bin",
] as const;

/** The documented directory hashes needed to make the archive list human-readable. */
const KNOWN_DIRECTORIES: Record<number, string> = {
  0x53534f42: "arc/boss",
  0x45464645: "arc/effect",
  0x4d454e45: "arc/enemy",
  0x00435445: "arc/etc",
  0x4e455645: "arc/event",
  0x4d4d4947: "arc/gimmick",
  0x4d455449: "arc/item",
  0x0050414d: "arc/map",
  0x554e454d: "arc/menu",
  0x0043504e: "arc/npc",
  0x00004350: "arc/pc",
  0x20004350: "arc/pc_aqua",
  0x30004350: "arc/pc_terra",
  0x00535953: "arc/system",
  0x454e454d: "arc/enemy",
};

function toHex(value: number): string {
  return value.toString(16).toUpperCase().padStart(8, "0");
}

function assertRange(offset: number, length: number, total: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > total) {
    throw new Error(`${label} يشير إلى نطاق خارج ملف BBS0.DAT.`);
  }
}

function readHeader(bytes: Uint8Array): BbsaHeader {
  if (bytes.length < 0x30) throw new Error("ملف BBS0.DAT أصغر من ترويسة BBSA.");
  const magic = String.fromCharCode(...bytes.subarray(0, 4)).toLowerCase();
  if (magic !== "bbsa") throw new Error("هذا ليس BBS0.DAT بصيغة BBSA؛ يجب أن يبدأ الملف بتوقيع bbsa.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header: BbsaHeader = {
    version: view.getUint32(4, true),
    partitionCount: view.getUint16(8, true),
    partitionEntriesCount: view.getUint16(10, true),
    directoryCount: view.getUint16(12, true),
    directoryEntriesCount: view.getUint16(14, true),
    partitionOffset: view.getUint32(16, true),
    directoryOffset: view.getUint32(20, true),
    archive0Sector: view.getUint16(26, true),
    archive1Sector: view.getUint32(32, true),
    archive2Sector: view.getUint32(36, true),
    archive3Sector: view.getUint32(40, true),
    archive4Sector: view.getUint32(44, true),
  };
  if (!header.partitionCount || header.partitionCount > MAX_PARTITIONS) throw new Error("عدد أقسام BBSA غير صالح.");
  if (!header.directoryCount || header.directoryCount > MAX_DIRECTORY_COUNT) throw new Error("عدد جداول ملفات BBSA غير صالح.");
  if (header.partitionEntriesCount > MAX_ENTRIES || header.directoryEntriesCount > MAX_ENTRIES) throw new Error("فهرس BBSA أكبر من الحد الآمن للمتصفح.");
  assertRange(0x30, header.partitionCount * 8, bytes.length, "جدول أقسام BBSA");
  assertRange(header.partitionOffset, header.partitionEntriesCount * 8, bytes.length, "جدول ملفات ARC");
  assertRange(header.directoryOffset, header.directoryEntriesCount * 12, bytes.length, "جدول ملفات BBSA");
  return header;
}

function resolveArchiveLocation(header: BbsaHeader, globalSector: number): { archiveIndex: number; localSector: number } {
  if (globalSector >= header.archive4Sector) return { archiveIndex: 4, localSector: globalSector - header.archive4Sector + 1 };
  if (globalSector >= header.archive3Sector) return { archiveIndex: 3, localSector: globalSector - header.archive3Sector + 1 };
  if (globalSector >= header.archive2Sector) return { archiveIndex: 2, localSector: globalSector - header.archive2Sector + 1 };
  if (globalSector >= header.archive1Sector) return { archiveIndex: 1, localSector: globalSector - header.archive1Sector + 1 };
  return { archiveIndex: 0, localSector: globalSector + header.archive0Sector };
}

function archiveIndexFromName(name: string): number | null {
  const match = name.trim().match(/^bbs([0-4])\.dat$/i);
  return match ? Number(match[1]) : null;
}

function directoryName(hash: number): string {
  return KNOWN_DIRECTORIES[hash] ?? `مسار غير معروف · ${toHex(hash)}`;
}

function addEntry(
  entries: BbsArchiveEntry[],
  archives: Map<number, File>,
  header: BbsaHeader,
  directoryHash: number,
  fileHash: number,
  extension: string,
  info: number,
  ordinal: number,
) {
  const globalSector = info >>> 12;
  const allocatedSectors = info & 0xfff;
  const { archiveIndex, localSector } = resolveArchiveLocation(header, globalSector);
  const allocatedBytes = allocatedSectors * BBS_SECTOR_SIZE;
  const archive = archives.get(archiveIndex);
  const byteOffset = localSector * BBS_SECTOR_SIZE;
  const isStreamed = allocatedSectors === 0xfff;
  const downloadAvailable = Boolean(archive) && !isStreamed && allocatedSectors > 0 && byteOffset + allocatedBytes <= (archive?.size ?? 0);
  entries.push({
    id: `${archiveIndex}-${directoryHash}-${fileHash}-${extension}-${ordinal}`,
    archiveIndex,
    sourceArchiveName: archive?.name ?? `BBS${archiveIndex}.DAT غير مرفوع`,
    directory: directoryName(directoryHash),
    directoryHash,
    fileHash,
    extension,
    globalSector,
    localSector,
    allocatedSectors,
    allocatedBytes,
    byteOffset,
    downloadAvailable,
    isStreamed,
  });
}

/**
 * Builds an immutable index over the original BBSA directory in BBS0.DAT.
 * It never decrypts, modifies or re-packs data; downloads are exact allocated
 * sector ranges, including the game's original sector padding.
 */
export async function indexKHBbsDatFiles(uploads: File[]): Promise<BbsArchiveIndex> {
  const archives = new Map<number, File>();
  for (const upload of uploads) {
    const index = archiveIndexFromName(upload.name);
    if (index !== null) archives.set(index, upload);
  }
  const bbs0 = archives.get(0);
  if (!bbs0) throw new Error("ارفع BBS0.DAT أولاً؛ فهو يحتوي فهرس جميع ملفات اللعبة.");
  const headerBytes = new Uint8Array(await bbs0.slice(0, Math.min(bbs0.size, 8 * 1024 * 1024)).arrayBuffer());
  const header = readHeader(headerBytes);
  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
  const entries: BbsArchiveEntry[] = [];
  const warnings: string[] = [];

  for (let partitionIndex = 0; partitionIndex < header.partitionCount; partitionIndex += 1) {
    const partitionOffset = 0x30 + partitionIndex * 8;
    const directoryHash = view.getUint32(partitionOffset, true);
    const entryCount = view.getUint16(partitionOffset + 4, true);
    const entryOffsetSectors = view.getUint16(partitionOffset + 6, true);
    const firstEntryOffset = header.partitionOffset + entryOffsetSectors * 8;
    assertRange(firstEntryOffset, entryCount * 8, headerBytes.length, `ملفات قسم ARC ${partitionIndex + 1}`);
    for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
      const offset = firstEntryOffset + entryIndex * 8;
      addEntry(entries, archives, header, directoryHash, view.getUint32(offset, true), "arc", view.getUint32(offset + 4, true), entries.length);
    }
  }

  // BBSA uses integer division here. A remainder is valid in real BBS0.DAT files;
  // it represents unused trailing slots and must not make the archive fail to open.
  const entriesPerDirectory = Math.floor(header.directoryEntriesCount / header.directoryCount);
  const trailingDirectoryEntries = header.directoryEntriesCount % header.directoryCount;
  if (trailingDirectoryEntries) {
    warnings.push(`يتضمن فهرس BBSA ${trailingDirectoryEntries} مدخل/مداخل امتداد زائدة خارج كتل الجداول المتساوية؛ تم تجاهلها بأمان وفق طريقة قراءة اللعبة.`);
  }
  for (let directoryIndex = 0; directoryIndex < header.directoryCount; directoryIndex += 1) {
    const extension = KNOWN_EXTENSIONS[directoryIndex] ?? "bin";
    const firstEntryOffset = header.directoryOffset + directoryIndex * entriesPerDirectory * 12;
    for (let entryIndex = 0; entryIndex < entriesPerDirectory; entryIndex += 1) {
      const offset = firstEntryOffset + entryIndex * 12;
      const fileHash = view.getUint32(offset, true);
      const info = view.getUint32(offset + 4, true);
      const directoryHash = view.getUint32(offset + 8, true);
      if (fileHash === 0 && info === 0 && directoryHash === 0) continue;
      addEntry(entries, archives, header, directoryHash, fileHash, extension, info, entries.length);
    }
  }

  const unavailableArchives = [0, 1, 2, 3, 4].filter((index) => !archives.has(index));
  if (unavailableArchives.length) warnings.push(`لم تُرفع ${unavailableArchives.map((index) => `BBS${index}.DAT`).join("، ")}؛ ستظهر مراجعها لكن لا يمكن تنزيلها بعد.`);
  const streamedCount = entries.filter((entry) => entry.isStreamed).length;
  if (streamedCount) warnings.push(`${streamedCount} مرجعاً متدفقاً بحجم 0xFFF قطاعاً؛ لا يعرضها المدير للتنزيل لأن حجمها الحقيقي غير مثبت في الفهرس.`);
  return {
    version: header.version,
    archives,
    entries: entries.sort((a, b) => a.directory.localeCompare(b.directory) || a.extension.localeCompare(b.extension) || a.fileHash - b.fileHash),
    warnings,
    headerSectors: { archive0: header.archive0Sector, archive1: header.archive1Sector, archive2: header.archive2Sector, archive3: header.archive3Sector, archive4: header.archive4Sector },
  };
}

export function getBbsEntryFilename(entry: BbsArchiveEntry): string {
  return `BBS${entry.archiveIndex}_${toHex(entry.directoryHash)}_${toHex(entry.fileHash)}.${entry.extension.toLowerCase()}`;
}

export async function readBbsArchiveEntry(entry: BbsArchiveEntry, archives: Map<number, File>): Promise<Blob> {
  const archive = archives.get(entry.archiveIndex);
  if (!archive || !entry.downloadAvailable) throw new Error(`لا يمكن تنزيل هذا الملف قبل رفع BBS${entry.archiveIndex}.DAT كاملاً.`);
  return archive.slice(entry.byteOffset, entry.byteOffset + entry.allocatedBytes);
}

function hasAsciiToken(bytes: Uint8Array, token: string): boolean {
  const tokenBytes = new TextEncoder().encode(token);
  outer: for (let index = 0; index <= bytes.length - tokenBytes.length; index += 1) {
    for (let offset = 0; offset < tokenBytes.length; offset += 1) {
      if (bytes[index + offset] !== tokenBytes[offset]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Detects a font ARC from its internal resource names. This is used only on
 * resources under arc/system and never changes the DAT archive or the ARC.
 */
export async function isKHBbsFontArchive(entry: BbsArchiveEntry, archives: Map<number, File>): Promise<boolean> {
  if (entry.directory !== "arc/system" || entry.extension !== "arc" || !entry.downloadAvailable) return false;
  const blob = await readBbsArchiveEntry(entry, archives);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return hasAsciiToken(bytes, "mesfont.inf") && hasAsciiToken(bytes, "cmdfont.inf");
}

export function formatBbsBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

export function formatBbsHash(hash: number): string {
  return `0x${toHex(hash)}`;
}
