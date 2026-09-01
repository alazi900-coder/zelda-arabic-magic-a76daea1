/**
 * Nintendo DS ROM header + NitroFS (the cartridge's own file system) reader.
 *
 * Verified against the real "Fire Emblem 12" ROM this session: header
 * capacity (0x14) matched the file's own byte length exactly (128 MiB) —
 * the cartridge is completely full at the format level — but the header's
 * "used ROM size" field (0x80) stops at ~86 MiB, meaning everything after
 * that up to the declared capacity is unused `0xFF` padding that IS inside
 * the addressable cartridge. `findFreeSpace` locates that gap; the ROM
 * builder (`nds-rom-builder.ts`) writes grown files there instead of past
 * the file's end, which is unaddressable and reads back as garbage.
 */

const FNT_OFFSET_PTR = 0x40;
const FNT_SIZE_PTR = 0x44;
const FAT_OFFSET_PTR = 0x48;
const FAT_SIZE_PTR = 0x4c;
const CAPACITY_PTR = 0x14;
const USED_SIZE_PTR = 0x80;

export interface NdsFileEntry {
  id: number;
  path: string;
  offset: number;
  end: number;
  size: number;
}

export interface NdsRomIndex {
  fatOffset: number;
  fatSize: number;
  fileCount: number;
  files: NdsFileEntry[];
  byPath: Map<string, NdsFileEntry>;
}

function readAscii(view: DataView, start: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(start + i));
  return out;
}

/** Parses the FNT/FAT tables into a flat file list with full paths. */
export function indexNitroFs(rom: ArrayBuffer): NdsRomIndex {
  const view = new DataView(rom);
  const fntOffset = view.getUint32(FNT_OFFSET_PTR, true);
  const fatOffset = view.getUint32(FAT_OFFSET_PTR, true);
  const fatSize = view.getUint32(FAT_SIZE_PTR, true);
  const fileCount = fatSize / 8;
  const rootDirectoryCount = view.getUint16(fntOffset + 6, true);

  const files: (NdsFileEntry | undefined)[] = Array.from({ length: fileCount }, () => undefined);
  const pathsById = new Map<number, string>();

  function parseDirectory(directoryId: number, path: string, ancestry: Set<number>): void {
    if (ancestry.has(directoryId)) throw new Error(`مرجعٌ دائريّ في جدول FNT عند 0x${directoryId.toString(16)}.`);
    const tableIndex = directoryId - 0xf000;
    if (tableIndex < 0 || tableIndex >= rootDirectoryCount) throw new Error(`معرّف مجلّد FNT غير صالح: 0x${directoryId.toString(16)}.`);
    const entryOffset = fntOffset + tableIndex * 8;
    let position = fntOffset + view.getUint32(entryOffset, true);
    let fileId = view.getUint16(entryOffset + 4, true);
    const branch = new Set(ancestry).add(directoryId);

    for (;;) {
      const descriptor = view.getUint8(position++);
      if (descriptor === 0) break;
      const isDirectory = (descriptor & 0x80) !== 0;
      const nameLength = descriptor & 0x7f;
      const name = readAscii(view, position, nameLength);
      position += nameLength;
      const childPath = path ? `${path}/${name}` : name;
      if (isDirectory) {
        const childDirectoryId = view.getUint16(position, true);
        position += 2;
        parseDirectory(childDirectoryId, childPath, branch);
      } else {
        pathsById.set(fileId, childPath);
        fileId += 1;
      }
    }
  }
  parseDirectory(0xf000, "", new Set());

  const byPath = new Map<string, NdsFileEntry>();
  for (let id = 0; id < fileCount; id++) {
    const entryOffset = fatOffset + id * 8;
    const offset = view.getUint32(entryOffset, true);
    const end = view.getUint32(entryOffset + 4, true);
    if (end < offset || end > rom.byteLength) throw new Error(`مدى FAT غير صالح للملفّ ${id}.`);
    const path = pathsById.get(id) ?? `__unnamed__/file-${String(id).padStart(5, "0")}`;
    const entry: NdsFileEntry = { id, path, offset, end, size: end - offset };
    files[id] = entry;
    byPath.set(path, entry);
  }

  return { fatOffset, fatSize, fileCount, files: files as NdsFileEntry[], byPath };
}

/** Reads one file's raw (still possibly compressed) bytes from the ROM. */
export function readNitroFsFile(rom: ArrayBuffer, entry: NdsFileEntry): Uint8Array {
  return new Uint8Array(rom, entry.offset, entry.size);
}

export interface NdsFreeSpace {
  /** First free byte, 4-byte aligned. */
  start: number;
  /** One past the last addressable byte (the cartridge's declared capacity). */
  limit: number;
}

/**
 * The cartridge's capacity (0x14) is usually a power-of-two size and, for
 * this game, exactly matches the ROM file's own length — nothing is
 * addressable past it. The header's "used size" (0x80) and the highest
 * NitroFS file end mark where real data actually stops; the gap between
 * that and the capacity is free `0xFF` padding still inside the cartridge.
 */
export function findFreeSpace(rom: ArrayBuffer, index: NdsRomIndex): NdsFreeSpace {
  const view = new DataView(rom);
  const capacityExponent = view.getUint8(CAPACITY_PTR);
  const cartSize = 131072 * 2 ** capacityExponent;
  const limit = Math.min(cartSize, rom.byteLength);

  let cursor = view.getUint32(USED_SIZE_PTR, true);
  for (const file of index.files) cursor = Math.max(cursor, file.end);
  cursor = (cursor + 3) & ~3;

  return { start: cursor, limit };
}

export function readUsedSize(rom: ArrayBuffer): number {
  return new DataView(rom).getUint32(USED_SIZE_PTR, true);
}

export function writeUsedSize(rom: ArrayBuffer, value: number): void {
  new DataView(rom).setUint32(USED_SIZE_PTR, value, true);
}
