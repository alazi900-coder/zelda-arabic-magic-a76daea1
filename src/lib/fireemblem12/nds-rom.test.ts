import { describe, expect, it } from "vitest";
import { findFreeSpace, indexNitroFs, readNitroFsFile, readUsedSize, writeUsedSize } from "./nds-rom";
import { buildSyntheticRom } from "./nds-test-fixtures";

describe("nds-rom", () => {
  it("indexes a synthetic ROM's NitroFS files with correct paths and contents", () => {
    const systemData = Uint8Array.from([1, 2, 3, 4, 5]);
    const menuData = Uint8Array.from([9, 9]);
    const fontData = Uint8Array.from([7, 7, 7, 7]);
    const { rom } = buildSyntheticRom([
      { path: "m/System", data: systemData },
      { path: "m/Menu", data: menuData },
      { path: "fonts/talk", data: fontData },
    ]);

    const index = indexNitroFs(rom);
    expect(index.fileCount).toBe(3);
    expect(index.byPath.has("m/System")).toBe(true);
    expect(index.byPath.has("m/Menu")).toBe(true);
    expect(index.byPath.has("fonts/talk")).toBe(true);

    const systemEntry = index.byPath.get("m/System")!;
    expect(Array.from(readNitroFsFile(rom, systemEntry))).toEqual(Array.from(systemData));
    const menuEntry = index.byPath.get("m/Menu")!;
    expect(Array.from(readNitroFsFile(rom, menuEntry))).toEqual(Array.from(menuData));
    const fontEntry = index.byPath.get("fonts/talk")!;
    expect(Array.from(readNitroFsFile(rom, fontEntry))).toEqual(Array.from(fontData));
  });

  it("finds the free space between the used-size marker and the cartridge's declared capacity", () => {
    const { rom } = buildSyntheticRom([{ path: "m/System", data: new Uint8Array(100) }], { capacityMiB: 1 });
    const index = indexNitroFs(rom);
    const free = findFreeSpace(rom, index);
    expect(free.limit).toBe(1024 * 1024);
    expect(free.start).toBeGreaterThan(0);
    expect(free.start).toBeLessThan(free.limit);
    // Everything from free.start onward should still be the fixture's 0xFF padding.
    const bytes = new Uint8Array(rom);
    expect(bytes[free.start]).toBe(0xff);
    expect(bytes[free.limit - 1]).toBe(0xff);
  });

  it("reads and writes the header's used-size field", () => {
    const { rom } = buildSyntheticRom([{ path: "m/System", data: new Uint8Array(10) }]);
    const before = readUsedSize(rom);
    writeUsedSize(rom, before + 500);
    expect(readUsedSize(rom)).toBe(before + 500);
  });
});
