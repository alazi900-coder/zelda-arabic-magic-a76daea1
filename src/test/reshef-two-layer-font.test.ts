import { describe, expect, it } from "vitest";
import { buildReshefRom, extractReshefEntries, measureReshefTextBytes } from "@/lib/yugioh/reshef-editor-bridge";
import { measureEntryBytes } from "@/lib/entry-bytes";

const DIALOGUE_START = 0x0A0000;
const FONT_TABLE_ARABIC_START = 0xDF5700;
const SHADOW_TABLE_START = 0x183800;
const HOOK_START = 0x183624;
const HOOK_CALL = 0x0215E4;
const ONE_BYTE_TABLE_START = 0x184100;
const ONE_BYTE_HOOK_START = 0x184400;
const ONE_BYTE_CALL_A = 0x02100A;
const ONE_BYTE_CALL_B = 0x021066;
const ONE_BYTE_DIALOGUE_HOOK_START = 0x184900;
const ONE_BYTE_DIALOGUE_CALL = 0x052EC8;
const TEXT_BANK_START = 0xFE4000;

function decodeReshefToken(token: number) {
  let c = (token + 0x7ec0) & 0xffff;
  const original = c;
  if (c > 0x0400) c = (c - 0x0200) & 0xffff;
  if (original > 0x0700) c = (c - 0x0100) & 0xffff;
  if (original > 0x5f00) c = (c - 0xc000) & 0xffff;
  let index = (c - (c >> 8) * 68) & 0xffff;
  if ((c & 0xff) > 0x3f) index = (index - 1) & 0xffff;
  return index;
}

function tokenForGlyph(index: number) {
  for (let token = 0x8140; token <= 0xffff; token++) {
    if (decodeReshefToken(token) === index) return token;
  }
  throw new Error("لا يوجد token صالح للـglyph المطلوب.");
}

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
    expect(Array.from(result.rom.slice(ONE_BYTE_CALL_A, ONE_BYTE_CALL_A + 4))).toEqual([0x63, 0xF1, 0xF9, 0xF9]);
    expect(Array.from(result.rom.slice(ONE_BYTE_CALL_B, ONE_BYTE_CALL_B + 4))).toEqual([0x63, 0xF1, 0xCD, 0xF9]);
    expect(Array.from(result.rom.slice(ONE_BYTE_DIALOGUE_CALL, ONE_BYTE_DIALOGUE_CALL + 8))).toEqual([0x00, 0x4B, 0x18, 0x47, 0x01, 0x49, 0x18, 0x08]);
    expect(result.rom.slice(ONE_BYTE_TABLE_START, ONE_BYTE_TABLE_START + 258).some(Boolean)).toBe(true);
    const firstArabicToken = tokenForGlyph(0x180);
    expect(Array.from(result.rom.slice(ONE_BYTE_TABLE_START, ONE_BYTE_TABLE_START + 2))).toEqual([
      firstArabicToken & 0xff,
      firstArabicToken >>> 8,
    ]);
    expect(result.rom.slice(ONE_BYTE_HOOK_START, ONE_BYTE_HOOK_START + 88).some(Boolean)).toBe(true);
    expect(result.rom.slice(ONE_BYTE_DIALOGUE_HOOK_START, ONE_BYTE_DIALOGUE_HOOK_START + 76).some(Boolean)).toBe(true);
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
    expect(Array.from(result.rom.slice(offset + 3, offset + 7))).toEqual([0x81, 0x40, 0x81, 0x84]);
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

  it("stores Arabic glyphs in one byte and relocates a long pointed string to the safe text bank", () => {
    const source = new Uint8Array(0x1000000);
    source.fill(0xff, TEXT_BANK_START, 0xfff000);
    const header = 0x75330;
    const offset = header + 2;
    source.set([0x24, 0x30, 0x48, 0x45, 0x4c, 0x4c, 0x4f, 0x24, 0x31], header);
    source.set([header & 0xff, (header >>> 8) & 0xff, (header >>> 16) & 0xff, 0x08], 0x519c);

    const result = buildReshefRom(source, {
      [`ygo_reshef_dialogue:${offset}`]: "ن".repeat(64),
    });
    if ("error" in result) throw new Error(result.error);

    expect(result.relocatedLines).toBe(1);
    expect(result.textBankBytesUsed).toBe(68);
    expect(Array.from(result.rom.slice(0x519c, 0x51a0))).toEqual([0x00, 0x40, 0xfe, 0x08]);
    expect(Array.from(result.rom.slice(TEXT_BANK_START, TEXT_BANK_START + 2))).toEqual([0x24, 0x30]);
    const arabic = result.rom.slice(TEXT_BANK_START + 2, TEXT_BANK_START + 66);
    expect(arabic.length).toBe(64);
    expect(Array.from(arabic).every((byte) => byte !== 0x81)).toBe(true);
    expect(Array.from(result.rom.slice(TEXT_BANK_START + 66, TEXT_BANK_START + 68))).toEqual([0x24, 0x31]);
  });

  it("uses the ROM's one-byte Arabic codec for Reshef editor capacity warnings", () => {
    const translation = "لا نعم سيؤدي الحفظ إلى استبدال البيانات المحفوظة. هل هذا مناسب؟";
    const actualRomBytes = measureReshefTextBytes(translation);

    expect(actualRomBytes).toBeLessThan(new TextEncoder().encode(translation).length);
    expect(measureEntryBytes("ygo_reshef_dialogue", translation)).toBe(actualRomBytes);
    expect(measureEntryBytes("ygo_reshef_dialogue", "ن".repeat(71))).toBe(71);
  });
});
