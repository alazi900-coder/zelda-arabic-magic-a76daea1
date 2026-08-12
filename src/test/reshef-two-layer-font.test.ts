import { describe, expect, it } from "vitest";
import { buildReshefRom, extractReshefEntries } from "@/lib/yugioh/reshef-editor-bridge";

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

  it("extracts interface text and preserves paired 0x81 controls exactly", () => {
    const source = new Uint8Array(0xE00000);
    const offset = 0x75332;
    const english = new TextEncoder().encode("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    source.set([0x24, 0x30], offset - 2);
    source.set(english, offset);
    source.set([0x81, 0x40, 0x81, 0x84, 0x24, 0x31], offset + english.length);

    const entry = extractReshefEntries(source).find((row) => row.index === offset);
    expect(entry?.original).toContain("{81:40}{81:84}");

    const result = buildReshefRom(source, {
      [`ygo_reshef_dialogue:${offset}`]: "نسر{81:40}{81:84}",
    });
    if ("error" in result) throw new Error(result.error);
    expect(Array.from(result.rom.slice(offset + 6, offset + 10))).toEqual([0x81, 0x40, 0x81, 0x84]);
  });

  it("encodes all standard Arabic base letters and required punctuation", () => {
    const source = new Uint8Array(0xE00000);
    const english = new TextEncoder().encode("A".repeat(900));
    source.set([0x24, 0x30], DIALOGUE_START);
    source.set(english, DIALOGUE_START + 2);
    source.set([0x24, 0x31], DIALOGUE_START + 2 + english.length);

    const result = buildReshefRom(source, {
      [`ygo_reshef_dialogue:${DIALOGUE_START + 2}`]: "ءآأؤإئابتثجحخدذرزسشصضطظعغفقكلمنهويىة،؛؟",
    });
    expect("error" in result).toBe(false);
  });
});
