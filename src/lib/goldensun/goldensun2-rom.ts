/**
 * Golden Sun: The Lost Age (AGFE) ROM recognition and non-destructive audit.
 * IMPORTANT: GS2 has different text tables from Golden Sun 1 (AGSE).
 * Do NOT pass an AGFE ROM to goldensun-rom.ts's GS1 Huffman codec.
 */
export const GS2_GAME_CODE = "AGFE";
export const GS2_EXPECTED_SIZE = 0x1000000;

export interface GoldenSun2Audit {
  code: string;
  title: string;
  romSize: number;
  expectedSize: number;
  sizeMatches: boolean;
  samplePlainStrings: Array<{ offset: number; text: string }>;
  status: "inspection-only";
}

export function looksLikeGoldenSun2Rom(rom: Uint8Array): boolean {
  if (rom.length < 0xb0) return false;
  return String.fromCharCode(...rom.subarray(0xac, 0xb0)) === GS2_GAME_CODE;
}

export function auditGoldenSun2Rom(rom: Uint8Array): GoldenSun2Audit {
  if (!looksLikeGoldenSun2Rom(rom)) throw new Error("هذا الملف ليس Golden Sun: The Lost Age (AGFE)");
  const title = String.fromCharCode(...rom.subarray(0xa0, 0xac)).replace(/\0/g, "").trim();
  // Only inspect directly stored null-terminated ASCII runs as diagnostic
  // evidence. Most story dialogue is compressed and will not appear here.
  const strings: Array<{ offset: number; text: string }> = [];
  const limit = Math.min(rom.length, 0x800000);
  let start = -1;
  for (let i = 0; i < limit; i++) {
    const b = rom[i];
    if (b >= 0x20 && b <= 0x7e) {
      if (start < 0) start = i;
    } else {
      if (b === 0 && start >= 0 && i - start >= 12 && i - start <= 160) {
        const text = String.fromCharCode(...rom.subarray(start, i));
        if (/[A-Za-z]{3}/.test(text) && !/^\s+$/.test(text)) {
          strings.push({ offset: start, text });
        }
      }
      start = -1;
    }
    if (strings.length >= 60) break;
  }
  return {
    code: GS2_GAME_CODE, title, romSize: rom.length,
    expectedSize: GS2_EXPECTED_SIZE,
    sizeMatches: rom.length === GS2_EXPECTED_SIZE,
    samplePlainStrings: strings,
    status: "inspection-only",
  };
}

/** Reject unsupported builds rather than corrupting 16MB of game data. */
export function buildGoldenSun2Rom(): never {
  throw new Error(
    "بناء Golden Sun: The Lost Age غير مفعّل بعد: يجب أولاً التحقق من جداول النصوص المضغوطة ومؤشراتها وترميز الخط الخاص بـ AGFE. لن تُستخدم جداول الجزء الأول."
  );
}
