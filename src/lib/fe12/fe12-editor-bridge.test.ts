import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFE12MenuImageRom, buildFE12RomFromState, decodeFE12MenuImage, extractFE12Entries, looksLikeFE12Rom, verifyFE12Rom } from "./fe12-editor-bridge";

const ROM_PATH = "/home/ubuntu/fire-emblem-ds-lab/input/fe12-english-beta2-user.nds";
const CURRENT_DIALOGUE_TEST_ROM = "/home/ubuntu/fire-emblem-ds-lab/artifacts/fe12-english-beta2-arabic-build.nds";

describe("FE12 English Beta 2 bridge", () => {
  it.runIf(existsSync(ROM_PATH))("reads the verified English Beta 2 ROM and exposes English dialogue resources", async () => {
    const rom = new Uint8Array(readFileSync(ROM_PATH));
    expect(looksLikeFE12Rom(rom)).toBe(true);
    expect((await verifyFE12Rom(rom)).valid).toBe(true);
    const result = extractFE12Entries(rom);
    expect(result.entries.length).toBeGreaterThan(1400);
    expect(result.entries.some((entry) => /[A-Za-z]{3,}/.test(entry.original))).toBe(true);
    expect(result.entries.some((entry) => entry.msbtFile === "m/BaseTalk")).toBe(true);
    expect(result.entries.some((entry) => entry.msbtFile === "m/PlayerMake")).toBe(true);
  }, 120_000);

  it.runIf(existsSync(ROM_PATH))("preserves known English dialogue while decoding LZ11 back-references", () => {
    const rom = new Uint8Array(readFileSync(ROM_PATH));
    const opening = extractFE12Entries(rom).entries.find((item) => item.msbtFile === "m/001" && item.index === 0);
    const entry = extractFE12Entries(rom).entries.find((item) => item.msbtFile === "m/002" && item.index === 0);
    expect(opening?.original).toContain("This is your first real battle, is it not?");
    expect(opening?.original).not.toContain("This s syour first rea beattle");
    expect(entry?.original).toContain("Macedon's main force consists of");
    expect(entry?.original).toContain("pegasus knights and dracoknights");
    expect(entry?.original).toContain("Both are fast and highly mobile units.");
    expect(entry?.original).not.toContain("pegasus knighs o");
  }, 120_000);

  it.runIf(existsSync(ROM_PATH))("exposes and rebuilds main-menu text through its actual message table", () => {
    const original = new Uint8Array(readFileSync(ROM_PATH));
    const extracted = extractFE12Entries(original);
    expect(extracted.entries.find((item) => item.msbtFile === "m/MM" && item.index === 15)?.original).toBe("Start a new game.");
    const result = buildFE12RomFromState(original, { "m/MM:15": "Begin a new game." });
    if ("error" in result) throw new Error(result.error);
    expect(result.translatedLines).toBe(1);
    expect(extractFE12Entries(result.rom).entries.find((item) => item.msbtFile === "m/MM" && item.index === 15)?.original).toBe("Begin a new game.");
  }, 120_000);

  it.runIf(existsSync(ROM_PATH))("decodes and rebuilds the NEW GAME menu tiles through their LZ10 resource", () => {
    const original = new Uint8Array(readFileSync(ROM_PATH));
    const menu = decodeFE12MenuImage(original, "title/mainsave.cg");
    expect(menu.width).toBe(64);
    expect(menu.height).toBeGreaterThan(0);
    const rebuilt = buildFE12MenuImageRom(original, "title/mainsave.cg", menu);
    const reread = decodeFE12MenuImage(rebuilt.rom, "title/mainsave.cg");
    expect(reread).toEqual(menu);
  }, 120_000);

  it.runIf(existsSync(ROM_PATH))("builds Arabic from English dialogue with a fixed-size TTF font injection report", () => {
    const original = new Uint8Array(readFileSync(ROM_PATH));
    const result = buildFE12RomFromState(original, { "m/201:1": "مرحبا" });
    if ("error" in result) throw new Error(result.error);
    expect(result.translatedLines).toBe(1);
    expect(result.modifiedResources.map((item) => item.path)).toEqual(expect.arrayContaining(["fonts/talk", "m/201"]));
    expect(result.fontReport?.source.type).toBe("TTF");
    expect(result.fontReport?.glyphs.injected).toBeGreaterThanOrEqual(120);
    expect(result.fontReport?.resource.sizeChanged).toBe(false);
    expect(result.fontReport?.slots.usedCodes.length).toBe(result.fontGlyphs);
    writeFileSync(CURRENT_DIALOGUE_TEST_ROM, result.rom);
    expect(extractFE12Entries(result.rom).entries.length).toBeGreaterThan(1400);
  }, 120_000);
});
