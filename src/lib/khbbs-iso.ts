/**
 * Kingdom Hearts ISO writer: PSP ISOs are ISO-9660 images.  BBS0–BBS3 keep
 * their original byte sizes, so we can replace their extents directly without
 * rebuilding the directory, volume descriptors, or any unrelated game data.
 */

const ISO_SECTOR_BYTES = 2048;
const PVD_SECTOR = 16;
const BBS_ARCHIVE_INDEXES = [0, 1, 2, 3] as const;

interface IsoDirectoryRecord {
  name: string;
  extentSector: number;
  byteLength: number;
  isDirectory: boolean;
}

interface IsoDirectory {
  extentSector: number;
  byteLength: number;
}

export interface KHBbsIsoOutput {
  iso: Blob;
  replaced: string[];
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function decodeIsoName(bytes: Uint8Array): string {
  if (bytes.length === 1 && (bytes[0] === 0 || bytes[0] === 1)) return bytes[0] === 0 ? "." : "..";
  const raw = new TextDecoder("ascii").decode(bytes);
  return raw.replace(/;\d+$/, "").replace(/\.$/, "").toUpperCase();
}

async function readIsoBytes(iso: Blob, offset: number, length: number): Promise<Uint8Array> {
  if (offset < 0 || length < 0 || offset + length > iso.size) {
    throw new Error("سجل ISO يشير إلى بيانات خارج حجم الملف.");
  }
  return new Uint8Array(await iso.slice(offset, offset + length).arrayBuffer());
}

async function readPrimaryVolumeDescriptor(iso: Blob): Promise<Uint8Array> {
  const bytes = await readIsoBytes(iso, PVD_SECTOR * ISO_SECTOR_BYTES, ISO_SECTOR_BYTES);
  const standardId = new TextDecoder("ascii").decode(bytes.slice(1, 6));
  if (bytes[0] !== 1 || standardId !== "CD001") {
    throw new Error("هذا ليس ISO-9660 صالحاً للـPSP؛ اختر ملف اللعبة الأصلي بصيغة ISO.");
  }
  return bytes;
}

function parseDirectoryRecord(bytes: Uint8Array, offset: number): IsoDirectoryRecord {
  const recordLength = bytes[offset];
  const nameLength = bytes[offset + 32];
  if (recordLength < 34 || nameLength === 0 || offset + recordLength > bytes.length || 33 + nameLength > recordLength) {
    throw new Error("سجل مجلد ISO غير صالح.");
  }
  return {
    name: decodeIsoName(bytes.slice(offset + 33, offset + 33 + nameLength)),
    extentSector: readU32LE(bytes, offset + 2),
    byteLength: readU32LE(bytes, offset + 10),
    isDirectory: (bytes[offset + 25] & 0x02) !== 0,
  };
}

async function readDirectory(iso: Blob, directory: IsoDirectory): Promise<IsoDirectoryRecord[]> {
  const bytes = await readIsoBytes(iso, directory.extentSector * ISO_SECTOR_BYTES, directory.byteLength);
  const entries: IsoDirectoryRecord[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const recordLength = bytes[offset];
    if (recordLength === 0) {
      offset = (Math.floor(offset / ISO_SECTOR_BYTES) + 1) * ISO_SECTOR_BYTES;
      continue;
    }
    entries.push(parseDirectoryRecord(bytes, offset));
    offset += recordLength;
  }
  return entries;
}

async function findIsoPath(iso: Blob, root: IsoDirectory, parts: string[]): Promise<IsoDirectoryRecord> {
  let current = root;
  let result: IsoDirectoryRecord | undefined;
  for (let index = 0; index < parts.length; index += 1) {
    const wanted = parts[index].toUpperCase();
    const entries = await readDirectory(iso, current);
    result = entries.find((entry) => entry.name === wanted);
    if (!result) throw new Error(`لم يُعثر على ${parts.slice(0, index + 1).join("/")} داخل ISO.`);
    if (index < parts.length - 1 && !result.isDirectory) {
      throw new Error(`المسار ${parts.slice(0, index + 1).join("/")} داخل ISO ليس مجلداً.`);
    }
    current = { extentSector: result.extentSector, byteLength: result.byteLength };
  }
  if (!result) throw new Error("مسار ISO المطلوب فارغ.");
  return result;
}

/**
 * Replaces the four BBS extents in an ISO with equal-sized final BBS blobs.
 * Blob slices keep the original ISO on disk-backed storage instead of copying
 * its full contents into JavaScript memory — essential for Android devices.
 */
export async function injectKHBbsArchivesIntoIso(iso: Blob, archives: ReadonlyMap<number, Blob>): Promise<KHBbsIsoOutput> {
  const missing = BBS_ARCHIVE_INDEXES.filter((index) => !archives.has(index));
  if (missing.length > 0) throw new Error(`لا توجد نسخ BBS كاملة للمؤشرات: ${missing.join("، ")}.`);

  const pvd = await readPrimaryVolumeDescriptor(iso);
  const root = parseDirectoryRecord(pvd, 156);
  const rootDirectory = { extentSector: root.extentSector, byteLength: root.byteLength };
  const replacements: Array<{ start: number; end: number; bytes: Blob; name: string }> = [];

  for (const index of BBS_ARCHIVE_INDEXES) {
    const name = `BBS${index}.DAT`;
    const entry = await findIsoPath(iso, rootDirectory, ["PSP_GAME", "USRDIR", name]);
    if (entry.isDirectory) throw new Error(`${name} داخل ISO هو مجلد وليس ملف DAT.`);
    const bytes = archives.get(index);
    if (!bytes) throw new Error(`${name} غير جاهز للبناء.`);
    if (bytes.size !== entry.byteLength) {
      throw new Error(`${name} الناتج حجمه ${bytes.size.toLocaleString("ar")} بايت، لكن ISO يحجز ${entry.byteLength.toLocaleString("ar")} بايت. لم يُنشأ ISO.`);
    }
    const start = entry.extentSector * ISO_SECTOR_BYTES;
    replacements.push({ start, end: start + entry.byteLength, bytes, name });
  }

  replacements.sort((left, right) => left.start - right.start);
  for (let index = 1; index < replacements.length; index += 1) {
    if (replacements[index - 1].end > replacements[index].start) {
      throw new Error("ملفات BBS داخل ISO تتداخل على نحو غير صالح؛ لم يُنشأ ISO.");
    }
  }

  const parts: BlobPart[] = [];
  let cursor = 0;
  for (const replacement of replacements) {
    parts.push(iso.slice(cursor, replacement.start), replacement.bytes);
    cursor = replacement.end;
  }
  parts.push(iso.slice(cursor));
  return { iso: new Blob(parts, { type: "application/x-iso9660-image" }), replaced: replacements.map((item) => item.name) };
}
