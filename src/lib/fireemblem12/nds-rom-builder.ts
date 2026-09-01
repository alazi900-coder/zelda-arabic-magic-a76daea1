/**
 * Builds a ROM copy with one or more NitroFS files replaced, allowing files
 * to grow to any size.
 *
 * The problem this solves: the ROM is exactly 134,217,728 bytes (128 MiB)
 * and its header declares a device capacity of exactly 128 MiB, so the
 * cartridge is completely full at the format level. Anything written past
 * the end of the file is outside the addressable cart — the game reads
 * 0xFF there, decompression produces garbage, and the text engine falls
 * back to printing raw lookup keys ("MPID_ANNA") with corrupted tiles.
 * Verified this session with a real emulator: that failure is not about
 * *which* file moves, it happens to any file placed outside the
 * addressable range, even with byte-identical content.
 *
 * The fix: the ROM is not actually full of data. NitroFS ends around
 * 0x527447C (matching the header's own "total used ROM size" field) and
 * everything from there to the declared capacity is 0xFF padding — real,
 * addressable, unused cartridge space (45.5 MiB on the reference ROM).
 * Grown files are allocated there; the header's used-size field is updated
 * to stay truthful about how far real data now reaches.
 */
import { findFreeSpace, readUsedSize, writeUsedSize, type NdsRomIndex } from "./nds-rom";

export interface Fe12RomEdit {
  fileId: number;
  data: Uint8Array;
}

export interface Fe12RomBuildResult {
  rom: ArrayBuffer;
  edits: { fileId: number; path: string; mode: "in-place" | "relocated-into-free-space"; oldSize: number; newSize: number }[];
}

export function buildFe12Rom(sourceRom: ArrayBuffer, index: NdsRomIndex, edits: Fe12RomEdit[]): Fe12RomBuildResult {
  const rom = sourceRom.slice(0);
  const view = new DataView(rom);
  const bytes = new Uint8Array(rom);
  const free = findFreeSpace(sourceRom, index);
  let cursor = free.start;

  const report: Fe12RomBuildResult["edits"] = [];
  for (const edit of edits) {
    const file = index.files[edit.fileId];
    if (!file) throw new Error(`لا يوجد ملفّ NitroFS بالمعرّف ${edit.fileId}.`);
    const entryOffset = index.fatOffset + file.id * 8;
    const oldStart = view.getUint32(entryOffset, true);
    const oldEnd = view.getUint32(entryOffset + 4, true);
    if (oldEnd - oldStart !== file.size) throw new Error(`إدخال FAT للملفّ ${file.path} غير متطابق مع الفهرس.`);

    if (edit.data.length <= oldEnd - oldStart) {
      bytes.set(edit.data, oldStart);
      view.setUint32(entryOffset + 4, oldStart + edit.data.length, true);
      report.push({ fileId: file.id, path: file.path, mode: "in-place", oldSize: file.size, newSize: edit.data.length });
    } else {
      if (cursor + edit.data.length > free.limit) {
        throw new Error(`لا مساحة كافية في الروم: يحتاج ${edit.data.length} بايت عند 0x${cursor.toString(16)}، الحدّ 0x${free.limit.toString(16)}.`);
      }
      bytes.set(edit.data, cursor);
      view.setUint32(entryOffset, cursor, true);
      view.setUint32(entryOffset + 4, cursor + edit.data.length, true);
      report.push({ fileId: file.id, path: file.path, mode: "relocated-into-free-space", oldSize: file.size, newSize: edit.data.length });
      cursor = (cursor + edit.data.length + 3) & ~3;
    }
  }

  if (cursor > readUsedSize(rom)) writeUsedSize(rom, cursor);

  return { rom, edits: report };
}
