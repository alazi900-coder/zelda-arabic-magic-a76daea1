import { describe, expect, it } from "vitest";
import { buildReshefRom } from "@/lib/yugioh/reshef-editor-bridge";

const DIALOGUE_START = 0x0A0000;
const FONT_TABLE_ARABIC_START = 0xDF5700;
const SHADOW_TABLE_START = 0x183800;
const HOOK_START = 0x183624;
const HOOK_CALL = 0x0215E4;

describe("Reshef two-layer Pokémon Arabic font", () => {
  it("injects separate body and shadow masks plus the tested Thumb hook", () => {
    const source = new Uint8Array(0xE00000);
    const english = new TextEncoder().encode("HELLO WORLD");
    source.set([0x24, 0x30], DIALOGUE_START);
    source.set(english, DIALOGUE_START + 2);
    source.set([0x24, 0x31], DIALOGUE_START + 2 + english.length);

    const result = buildReshefRom(source, {
      [`ygo_reshef_dialogue:${DIALOGUE_START + 2}`]: "نسر",
    });

    if ("error" in result) throw new Error(result.error);
    expect(result.fontApplied).toBe(true);
    expect(Array.from(result.rom.slice(HOOK_CALL, HOOK_CALL + 4))).toEqual([0x62, 0xF1, 0x1E, 0xF8]);
    expect(Array.from(result.rom.slice(HOOK_START, HOOK_START + 4))).toEqual([0x15, 0x4B, 0x98, 0x42]);
    expect(result.rom.slice(FONT_TABLE_ARABIC_START, FONT_TABLE_ARABIC_START + 16).some(Boolean)).toBe(true);
    expect(result.rom.slice(SHADOW_TABLE_START, SHADOW_TABLE_START + 16).some(Boolean)).toBe(true);
  });
});
