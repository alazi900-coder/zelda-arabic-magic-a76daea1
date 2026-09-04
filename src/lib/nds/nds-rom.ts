/**
 * The bare minimum of the Nintendo DS cartridge format: finding one file
 * inside the image, and putting a bigger one back.
 *
 * A DS ROM keeps every file's bytes in one blob, a File Allocation Table of
 * start/end pairs pointing into it, and a File Name Table naming them. The
 * name table is what identifies the file here: this ROM holds dozens of
 * NARCs, and picking one by its magic and size found the wrong archive on the
 * first try -- a bigger one happened to come first.
 *
 * Growing a file is the interesting part. Rewriting it in place would push
 * every later file along and invalidate ~2000 FAT entries; instead the new
 * bytes go into the padding past the end of the image, which a retail ROM
 * carries by the tens of megabytes, and only that one FAT entry moves. The
 * old bytes stay where they were, unreferenced -- wasteful, and the waste is
 * invisible.
 */

const FNT_OFFSET = 0x40;
const FAT_OFFSET = 0x48;
const FAT_SIZE = 0x4c;
const USED_SIZE = 0x80;
/** DS cartridge reads are 512-byte aligned; the header's own sizes are too. */
const ALIGN = 512;

export interface NdsFile {
  /** Index into the FAT, which is how the file is addressed for writing back. */
  id: number;
  start: number;
  end: number;
}

function u16(rom: Uint8Array, at: number): number {
  return rom[at] | (rom[at + 1] << 8);
}

function u32(rom: Uint8Array, at: number): number {
  return (rom[at] | (rom[at + 1] << 8) | (rom[at + 2] << 16) | (rom[at + 3] << 24)) >>> 0;
}

function setU32(rom: Uint8Array, at: number, value: number): void {
  rom[at] = value & 0xff;
  rom[at + 1] = (value >>> 8) & 0xff;
  rom[at + 2] = (value >>> 16) & 0xff;
  rom[at + 3] = (value >>> 24) & 0xff;
}

export function looksLikeNdsRom(rom: Uint8Array): boolean {
  if (rom.length < 0x8000) return false;
  const used = u32(rom, USED_SIZE);
  return used > 0x4000 && used <= rom.length;
}

/** Every entry of the FAT, in order, so a file can be found by its bytes. */
export function ndsFiles(rom: Uint8Array): NdsFile[] {
  const fatOff = u32(rom, FAT_OFFSET);
  const fatSize = u32(rom, FAT_SIZE);
  const files: NdsFile[] = [];
  for (let i = 0; i * 8 + 8 <= fatSize; i++) {
    const at = fatOff + i * 8;
    files.push({ id: i, start: u32(rom, at), end: u32(rom, at + 4) });
  }
  return files;
}

/**
 * Walk the File Name Table, calling back with every file's path and id.
 *
 * A directory's sub-table is a run of length-prefixed names: a high bit clear
 * means a file, taking the next id in that directory's sequence; set means a
 * sub-directory, whose own id follows the name. Nothing recurses -- directory
 * ids index straight into the same table, so the walk is a loop over all of
 * them and the parent link builds each path.
 */
export function ndsFileIdByPath(rom: Uint8Array): Map<string, number> {
  const fnt = u32(rom, FNT_OFFSET);
  const dirCount = u16(rom, fnt + 6);
  const names: string[] = new Array(dirCount).fill("");
  const parents: number[] = new Array(dirCount).fill(0);
  const paths = new Map<string, number>();
  const pending: { dir: number; name: string; id: number }[] = [];

  for (let dir = 0; dir < dirCount; dir++) {
    const entry = fnt + dir * 8;
    let at = fnt + u32(rom, entry);
    let fileId = u16(rom, entry + 4);
    for (;;) {
      const control = rom[at++];
      if (control === 0 || control === 0x80) break;
      const len = control & 0x7f;
      let name = "";
      for (let i = 0; i < len; i++) name += String.fromCharCode(rom[at + i]);
      at += len;
      if (control & 0x80) {
        const sub = u16(rom, at) & 0xfff;
        at += 2;
        if (sub < dirCount) {
          names[sub] = name;
          parents[sub] = dir;
        }
      } else {
        pending.push({ dir, name, id: fileId++ });
      }
    }
  }

  const pathOf = (dir: number): string => {
    const parts: string[] = [];
    for (let d = dir, guard = 0; d > 0 && guard < dirCount; d = parents[d], guard++) {
      parts.unshift(names[d]);
    }
    return parts.join("/");
  };
  for (const { dir, name, id } of pending) {
    const prefix = pathOf(dir);
    paths.set(prefix ? `${prefix}/${name}` : name, id);
  }
  return paths;
}

/** The file at `path` in the ROM's name table, e.g. "text/pl_msg.narc". */
export function findNdsFile(rom: Uint8Array, path: string): NdsFile | null {
  const id = ndsFileIdByPath(rom).get(path);
  if (id === undefined) return null;
  const files = ndsFiles(rom);
  return files[id] ?? null;
}

/**
 * A copy of the ROM with one file replaced, relocated past the used region if
 * it no longer fits where it was.
 *
 * The header's used-size field is what an emulator and a flashcart trust for
 * how much of the image is real, so it moves with the data. The image itself
 * is never shrunk: a DS ROM's declared capacity is a power of two the header
 * also carries, and a file smaller than its capacity is a different kind of
 * file than the one the hardware expects.
 */
export function writeNdsFile(rom: Uint8Array, file: NdsFile, data: Uint8Array): Uint8Array {
  const fatEntry = u32(rom, FAT_OFFSET) + file.id * 8;
  const fits = data.length <= file.end - file.start;

  if (fits) {
    const out = rom.slice();
    out.set(data, file.start);
    // Whatever of the old file the new one does not cover is dead, but the FAT
    // says where the file ends, so leaving it is harmless and avoids a wipe
    // that would have to know the padding byte.
    setU32(out, fatEntry, file.start);
    setU32(out, fatEntry + 4, file.start + data.length);
    return out;
  }

  const start = Math.ceil(u32(rom, USED_SIZE) / ALIGN) * ALIGN;
  const end = start + data.length;
  const out = end <= rom.length ? rom.slice() : (() => {
    const grown = new Uint8Array(Math.ceil(end / ALIGN) * ALIGN).fill(0xff);
    grown.set(rom);
    return grown;
  })();
  out.set(data, start);
  setU32(out, fatEntry, start);
  setU32(out, fatEntry + 4, end);
  setU32(out, USED_SIZE, end);
  return out;
}
