/**
 * Golden Sun II (AGFE) dialogue text layout safety.
 *
 * The engine uses variable 16x15 glyph advances to choose a dialogue window.
 * Overlong translated lines can create windows wider than the GBA screen.
 * At >30 tiles the experimental RTL hook intentionally falls back, which
 * makes Arabic overflow onto the game scene. Prevent that at build time.
 *
 * Do not insert 0x02 for a "next page": in the title transfer question
 * the engine treats it as END OF DIALOGUE. 0x03 is the verified line break.
 * Only reflow confirmed dialogue-like messages (source contains 0x03 or
 * 0x1E), preserving all other technical codes byte-for-byte and in order.
 */
import { goldensunControlCodeArgBytes } from "./goldensun-tags";

export const GS2_DIALOGUE_LINE_MAX_PX = 176;
export const GS2_DIALOGUE_MAX_LINES = 2;
const GS2_FONT_OFFSET = 0x5a4e0;
const GS2_CELL_SIZE = 32;

export interface GoldenSun2LineLayout {
  bytes: number[];
  insertedLineBreaks: number;
  lineWidths: number[];
  eligible: boolean;
}

const isRenderable = (code: number): boolean => code >= 0x20 && code <= 0xff;

export function goldenSun2LargeGlyphWidth(rom: Uint8Array, code: number): number {
  if (code === 0x20) return 5;
  if (!isRenderable(code)) return 0;
  const offset = GS2_FONT_OFFSET + (code - 0x20) * GS2_CELL_SIZE;
  if (offset + 2 > rom.length) throw new Error("GS2: missing dialogue font data");
  const width = rom[offset] | rom[offset + 1] << 8;
  if (width < 1 || width > 16) {
    throw new Error("GS2: unsupported dialogue glyph width at byte 0x" + code.toString(16));
  }
  return width;
}

export function goldenSun2HasDialogueControls(originalBytes: number[]): boolean {
  // Inspect actual control codes, not their opaque parameter bytes. A 0x1E
  // inside the argument of 0x11 must never turn a menu string into dialogue.
  for (let i = 0; i < originalBytes.length;) {
    const code = originalBytes[i];
    if (code >= 0x20) { i++; continue; }
    if (code === 0x03 || code === 0x1e) return true;
    i += 1 + goldensunControlCodeArgBytes(code);
  }
  return false;
}

/** Reflow a translation without changing a single existing control code.
 * Unknown menu/UI text is NOT automatically rewritten.
 *
 * If a dialogue requires >2 physical rows or contains an indivisible word
 * wider than the box, refuse the build instead of silently omitting glyphs.
 */
export function layoutGoldenSun2Dialogue(
  rom: Uint8Array, originalBytes: number[], translatedBytes: number[],
  maxWidth: number = GS2_DIALOGUE_LINE_MAX_PX,
): GoldenSun2LineLayout {
  const eligible = goldenSun2HasDialogueControls(originalBytes);
  if (!eligible) {
    return { bytes: translatedBytes.slice(), insertedLineBreaks: 0, lineWidths: [], eligible: false };
  }
  if (!Number.isInteger(maxWidth) || maxWidth < 24 || maxWidth > 192) {
    throw new Error("GS2: invalid safe dialogue width");
  }
  // For an ordinary two-line question whose only controls are the
  // existing newline (0x03) and question end (0x1E), we may MOVE that one
  // newline to an earlier word boundary instead of adding a third row.
  // Never apply this to dynamic speaker/name/color controls.
  const controls: number[] = [];
  for (let p = 0; p < translatedBytes.length;) {
    const code = translatedBytes[p];
    if (code < 0x20) {
      controls.push(code);
      p += 1 + goldensunControlCodeArgBytes(code);
    } else p++;
  }
  if (controls.filter(code => code === 0x03).length === 1 &&
      controls.every(code => code === 0x03 || code === 0x1e)) {
    const breakAt = translatedBytes.indexOf(0x03);
    const beforeWidth = translatedBytes.slice(0, breakAt)
      .reduce((total, code) => total + goldenSun2LargeGlyphWidth(rom, code), 0);
    if (beforeWidth > maxWidth) {
      // Replace the existing newline with ONE word-separating space. Never
      // join the last word of the first line to the next word by accident.
      const flattened = [
        ...translatedBytes.slice(0, breakAt),
        0x20,
        ...translatedBytes.slice(breakAt + 1),
      ];
      // A fake terminator keeps eligibility without recursively rebalancing.
      const balanced = layoutGoldenSun2Dialogue(rom, [0x41, 0x1e], flattened, maxWidth);
      if (balanced.insertedLineBreaks === 1) {
        return { ...balanced, insertedLineBreaks: 0 };
      }
    }
  }

  const out: number[] = [];
  const lineWidths: number[] = [];
  let lineWidth = 0;
  let lines = 1;
  let inserted = 0;
  let pendingSpaces = 0;

  const fail = (reason: string): never => {
    throw new Error("GS2: " + reason + " — اختصر الترجمة أو وزّعها على سطرين كحد أقصى");
  };
  const newline = (insertedBreak: boolean) => {
    lineWidths.push(lineWidth);
    lines++;
    if (lines > GS2_DIALOGUE_MAX_LINES) {
      fail("النص يحتاج أكثر من سطرين في صندوق الحوار");
    }
    out.push(0x03);
    lineWidth = 0;
    pendingSpaces = 0;
    if (insertedBreak) inserted++;
  };

  let i = 0;
  while (i < translatedBytes.length) {
    const byte = translatedBytes[i];
    if (byte < 0x20) {
      // Flush spaces only before a printable word, never before control codes.
      pendingSpaces = 0;
      if (byte === 0x03) {
        newline(false);
        i++;
        continue;
      }
      out.push(byte);
      const argCount = goldensunControlCodeArgBytes(byte);
      if (i + 1 + argCount > translatedBytes.length) {
        fail("وسم تحكم تقني ناقص");
      }
      for (let j = 0; j < argCount; j++) out.push(translatedBytes[++i]);
      // Explicit end-of-dialogue starts a new layout context, but never
      // synthesize it ourselves.
      if (byte === 0x02) {
        lineWidths.push(lineWidth);
        lineWidth = 0;
        lines = 1;
      }
      i++;
      continue;
    }
    if (byte === 0x20) {
      pendingSpaces++;
      i++;
      continue;
    }

    const word: number[] = [];
    let wordWidth = 0;
    while (i < translatedBytes.length && translatedBytes[i] > 0x20) {
      const code = translatedBytes[i++];
      word.push(code);
      wordWidth += goldenSun2LargeGlyphWidth(rom, code);
    }
    if (wordWidth > maxWidth) {
      fail("كلمة واحدة أكبر من عرض نافذة الحوار (" + wordWidth + " بكسل)");
    }

    const spaceWidth = lineWidth && pendingSpaces ? pendingSpaces * 5 : 0;
    if (lineWidth > 0 && lineWidth + spaceWidth + wordWidth > maxWidth) {
      // Safe wrapping point: ASCII space between words, NOT a technical tag.
      if (!pendingSpaces) fail("المقطع تجاوز عرض صندوق الحوار بلا مسافة مناسبة");
      newline(true);
    } else if (lineWidth > 0 && pendingSpaces) {
      for (let k = 0; k < pendingSpaces; k++) out.push(0x20);
      lineWidth += spaceWidth;
    }
    out.push(...word);
    lineWidth += wordWidth;
    pendingSpaces = 0;
  }
  lineWidths.push(lineWidth);
  return { bytes: out, insertedLineBreaks: inserted, lineWidths, eligible: true };
}
