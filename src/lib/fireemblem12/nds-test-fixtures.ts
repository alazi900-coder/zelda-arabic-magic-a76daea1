/** Synthetic NDS ROM builder, for tests only — never embeds real, copyrighted
 * game data. Builds a minimal but format-correct FNT/FAT so nds-rom.ts and
 * nds-rom-builder.ts can be exercised without a real ROM file. */

interface FixtureFile {
  path: string; // e.g. "m/System" or "fonts/talk"
  data: Uint8Array;
}

interface FixtureDirectory {
  name: string;
  id: number; // 0xF000-based
  files: { name: string; id: number }[];
  subdirectories: { name: string; id: number }[];
}

export interface SyntheticRom {
  rom: ArrayBuffer;
  fileIds: Record<string, number>;
}

const HEADER_SIZE = 0x200;

/** Builds a ROM with a `capacityMiB`-sized address space, files packed right after the FAT, and the rest left as 0xFF free space (mirrors the real ROM's own layout). */
export function buildSyntheticRom(files: FixtureFile[], options: { capacityMiB?: number; usedSizePadding?: number } = {}): SyntheticRom {
  const capacityMiB = options.capacityMiB ?? 1;
  const capacityExponent = Math.log2((capacityMiB * 1024 * 1024) / 131072);
  if (!Number.isInteger(capacityExponent)) throw new Error("capacityMiB must be a power-of-two multiple of 128 KiB");

  // Group files into a two-level tree: root files, and files under one
  // subdirectory per distinct top-level path segment (enough to exercise
  // real nested paths like "m/System" without needing arbitrary depth).
  const directoriesByName = new Map<string, FixtureDirectory>();
  const rootFiles: { name: string; id: number }[] = [];
  let nextFileId = 0;
  let nextDirId = 0xf001;
  const fileIds: Record<string, number> = {};

  for (const file of files) {
    const parts = file.path.split("/");
    const id = nextFileId++;
    fileIds[file.path] = id;
    if (parts.length === 1) {
      rootFiles.push({ name: parts[0], id });
    } else {
      const dirName = parts[0];
      let dir = directoriesByName.get(dirName);
      if (!dir) {
        dir = { name: dirName, id: nextDirId++, files: [], subdirectories: [] };
        directoriesByName.set(dirName, dir);
      }
      dir.files.push({ name: parts.slice(1).join("/"), id });
    }
  }
  const directories = [...directoriesByName.values()];
  const rootSubdirectories = directories.map((d) => ({ name: d.name, id: d.id }));

  // Re-derive each directory's firstFileId as the lowest file id it contains
  // (files within one directory are given consecutive ids in this builder).
  function firstFileIdOf(entries: { id: number }[]): number {
    return entries.length > 0 ? Math.min(...entries.map((e) => e.id)) : 0;
  }

  const allDirs: { id: number; firstFileId: number; entries: { type: "dir" | "file"; name: string; id: number }[] }[] = [
    {
      id: 0xf000,
      firstFileId: firstFileIdOf(rootFiles),
      entries: [
        ...rootSubdirectories.map((d) => ({ type: "dir" as const, name: d.name, id: d.id })),
        ...rootFiles.map((f) => ({ type: "file" as const, name: f.name, id: f.id })),
      ],
    },
    ...directories.map((dir) => ({
      id: dir.id,
      firstFileId: firstFileIdOf(dir.files),
      entries: dir.files.map((f) => ({ type: "file" as const, name: f.name, id: f.id })),
    })),
  ];
  // Directory table indices must be contiguous starting at 0 (0xF000 + index).
  const dirIndexById = new Map(allDirs.map((d, i) => [d.id, i]));

  const mainTableSize = allDirs.length * 8;
  const subtables = allDirs.map((dir) => {
    const bytes: number[] = [];
    for (const entry of dir.entries) {
      const nameBytes = Array.from(entry.name).map((c) => c.charCodeAt(0));
      const typeByte = entry.type === "dir" ? 0x80 | nameBytes.length : nameBytes.length;
      bytes.push(typeByte, ...nameBytes);
      if (entry.type === "dir") bytes.push(entry.id & 0xff, (entry.id >> 8) & 0xff);
    }
    bytes.push(0);
    return Uint8Array.from(bytes);
  });

  let cursor = mainTableSize;
  const subtableOffsets = subtables.map((table) => {
    const offset = cursor;
    cursor += table.length;
    return offset;
  });
  const fntSize = cursor;

  const mainTable = new Uint8Array(mainTableSize);
  const mainView = new DataView(mainTable.buffer);
  allDirs.forEach((dir, i) => {
    mainView.setUint32(i * 8, subtableOffsets[i], true);
    mainView.setUint16(i * 8 + 4, dir.firstFileId, true);
    if (dir.id === 0xf000) mainView.setUint16(i * 8 + 6, allDirs.length, true);
    else mainView.setUint16(i * 8 + 6, 0xf000 | dirIndexById.get(dir.id)!, true); // parent id, unused by our reader
  });

  const fnt = new Uint8Array(fntSize);
  fnt.set(mainTable, 0);
  subtables.forEach((table, i) => fnt.set(table, subtableOffsets[i]));

  const fat = new Uint8Array(files.length * 8);
  const fatView = new DataView(fat.buffer);

  const fntOffset = HEADER_SIZE;
  const fatOffset = fntOffset + fnt.length;
  let dataCursor = fatOffset + fat.length;
  const placedData: { offset: number; end: number; data: Uint8Array }[] = [];
  for (const file of files) {
    const id = fileIds[file.path];
    const start = dataCursor;
    const end = start + file.data.length;
    fatView.setUint32(id * 8, start, true);
    fatView.setUint32(id * 8 + 4, end, true);
    placedData.push({ offset: start, end, data: file.data });
    dataCursor = end;
  }
  const usedSize = dataCursor + (options.usedSizePadding ?? 0);

  const capacityBytes = capacityMiB * 1024 * 1024;
  if (usedSize > capacityBytes) throw new Error("fixture data does not fit in the requested capacity");

  const rom = new Uint8Array(capacityBytes).fill(0xff);
  const view = new DataView(rom.buffer);
  view.setUint8(0x14, capacityExponent);
  view.setUint32(0x40, fntOffset, true);
  view.setUint32(0x44, fnt.length, true);
  view.setUint32(0x48, fatOffset, true);
  view.setUint32(0x4c, fat.length, true);
  view.setUint32(0x80, usedSize, true);
  rom.set(fnt, fntOffset);
  rom.set(fat, fatOffset);
  for (const placed of placedData) rom.set(placed.data, placed.offset);

  return { rom: rom.buffer, fileIds };
}
