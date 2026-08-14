import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFE12RomFromState, extractFE12Entries, looksLikeFE12Rom, verifyFE12Rom } from "./fe12-editor-bridge";

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
