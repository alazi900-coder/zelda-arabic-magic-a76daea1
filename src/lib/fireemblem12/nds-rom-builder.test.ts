import { describe, expect, it } from "vitest";
import { findFreeSpace, indexNitroFs, readNitroFsFile, readUsedSize } from "./nds-rom";
import { buildFe12Rom } from "./nds-rom-builder";
import { buildSyntheticRom } from "./nds-test-fixtures";

describe("nds-rom-builder", () => {
  it("writes a same-size replacement in place, leaving other files untouched", () => {
    const { rom } = buildSyntheticRom([
      { path: "m/System", data: Uint8Array.from([1, 2, 3, 4, 5]) },
      { path: "m/Menu", data: Uint8Array.from([9, 9, 9]) },
    ]);
    const index = indexNitroFs(rom);
    const systemId = index.byPath.get("m/System")!.id;
    const result = buildFe12Rom(rom, index, [{ fileId: systemId, data: Uint8Array.from([9, 8, 7, 6, 5]) }]);

    expect(result.edits[0].mode).toBe("in-place");
    const newIndex = indexNitroFs(result.rom);
    expect(Array.from(readNitroFsFile(result.rom, newIndex.byPath.get("m/System")!))).toEqual([9, 8, 7, 6, 5]);
    expect(Array.from(readNitroFsFile(result.rom, newIndex.byPath.get("m/Menu")!))).toEqual([9, 9, 9]);
  });

  it("writes a smaller replacement in place and shrinks the FAT entry", () => {
    const { rom } = buildSyntheticRom([{ path: "m/System", data: Uint8Array.from([1, 2, 3, 4, 5]) }]);
    const index = indexNitroFs(rom);
    const systemId = index.byPath.get("m/System")!.id;
    const result = buildFe12Rom(rom, index, [{ fileId: systemId, data: Uint8Array.from([1, 2]) }]);
    const newIndex = indexNitroFs(result.rom);
    const entry = newIndex.byPath.get("m/System")!;
    expect(entry.size).toBe(2);
    expect(Array.from(readNitroFsFile(result.rom, entry))).toEqual([1, 2]);
  });

  it("relocates an oversized replacement into the cartridge's free space, and updates the used-size header", () => {
    const { rom } = buildSyntheticRom([{ path: "m/System", data: Uint8Array.from([1, 2, 3]) }], { capacityMiB: 1 });
    const index = indexNitroFs(rom);
    const before = findFreeSpace(rom, index);
    const grown = new Uint8Array(50000).fill(0x42);
    const systemId = index.byPath.get("m/System")!.id;

    const result = buildFe12Rom(rom, index, [{ fileId: systemId, data: grown }]);
    expect(result.edits[0].mode).toBe("relocated-into-free-space");

    const newIndex = indexNitroFs(result.rom);
    const entry = newIndex.byPath.get("m/System")!;
    expect(entry.offset).toBeGreaterThanOrEqual(before.start);
    expect(entry.size).toBe(grown.length);
    expect(Array.from(readNitroFsFile(result.rom, entry))).toEqual(Array.from(grown));
    expect(readUsedSize(result.rom)).toBeGreaterThanOrEqual(entry.end);
  });

  it("refuses to write past the cartridge's declared capacity", () => {
    const { rom } = buildSyntheticRom([{ path: "m/System", data: Uint8Array.from([1]) }], { capacityMiB: 1 });
    const index = indexNitroFs(rom);
    const systemId = index.byPath.get("m/System")!.id;
    const tooBig = new Uint8Array(2 * 1024 * 1024);
    expect(() => buildFe12Rom(rom, index, [{ fileId: systemId, data: tooBig }])).toThrow();
  });

  it("does not mutate the source ROM buffer", () => {
    const { rom } = buildSyntheticRom([{ path: "m/System", data: Uint8Array.from([1, 2, 3]) }]);
    const original = new Uint8Array(rom.slice(0));
    const index = indexNitroFs(rom);
    const systemId = index.byPath.get("m/System")!.id;
    buildFe12Rom(rom, index, [{ fileId: systemId, data: Uint8Array.from([9, 9, 9]) }]);
    expect(Array.from(new Uint8Array(rom))).toEqual(Array.from(original));
  });
});
