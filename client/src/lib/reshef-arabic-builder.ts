/* Style reminder: باني Reshef محلي وحتمي؛ يحقن خط Pokémon المثبت ويوقف البناء قبل أي تجاوز لسعة السجل. */
import { RESHEF_ARABIC_CODEPOINTS, RESHEF_ARABIC_GLYPHS_B64, RESHEF_ARABIC_GLYPH_START, RESHEF_GLYPH_BYTES, RESHEF_GLYPH_TABLE_OFFSET } from "@/lib/reshef-arabic-font";
import { sameControls, type ReshefDialogueRow } from "@/lib/reshef-text";

type ArabicForms = [number, number, number | null, number | null];
type BuildResult = { rom: Uint8Array; applied: number; encodedBytes: number };

const ARABIC_FORMS: Record<number, ArabicForms> = {
  0x0621: [0xFE80, 0xFE80, null, null], 0x0622: [0xFE81, 0xFE82, null, null], 0x0623: [0xFE83, 0xFE84, null, null], 0x0624: [0xFE85, 0xFE86, null, null], 0x0625: [0xFE87, 0xFE88, null, null],
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C], 0x0627: [0xFE8D, 0xFE8E, null, null], 0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92], 0x0629: [0xFE93, 0xFE94, null, null],
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98], 0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C], 0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0], 0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8], 0x062F: [0xFEA9, 0xFEAA, null, null], 0x0630: [0xFEAB, 0xFEAC, null, null], 0x0631: [0xFEAD, 0xFEAE, null, null],
  0x0632: [0xFEAF, 0xFEB0, null, null], 0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4], 0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8], 0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC],
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0], 0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4], 0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8], 0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC],
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0], 0x0640: [0x0640, 0x0640, 0x0640, 0x0640], 0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4], 0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8],
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC], 0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0], 0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4], 0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC], 0x0648: [0xFEED, 0xFEEE, null, null], 0x0649: [0xFEEF, 0xFEF0, null, null], 0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],
};

const LAM_ALEF: Record<number, [number, number]> = { 0x0622: [0xFEF5, 0xFEF6], 0x0623: [0xFEF7, 0xFEF8], 0x0625: [0xFEF9, 0xFEFA], 0x0627: [0xFEFB, 0xFEFC] };

function base64Bytes(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function pokemon4bppToReshef1bpp(source: Uint8Array) {
  if (source.length !== 64) throw new Error("بيانات glyph Pokémon غير صالحة.");
  const rows = new Uint8Array(16);
  for (let y = 0; y < 16; y += 1) {
    let row = 0;
    for (let x = 0; x < 8; x += 1) {
      const packed = source[y * 4 + (x >> 1)];
      const pixel = (packed >> (4 * (x & 1))) & 0xF;
      if (pixel === 14 || pixel === 15) row |= 0x80 >> x;
    }
    rows[y] = row;
  }
  return rows;
}

function canConnectAfter(code: number) { return ARABIC_FORMS[code]?.[2] !== null && ARABIC_FORMS[code] !== undefined; }
function canConnectBefore(code: number) { const forms = ARABIC_FORMS[code]; return forms !== undefined && forms[1] !== forms[0]; }
function isArabicFlow(code: number) { return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFE70 && code <= 0xFEFF); }
function isLatinDigit(char: string) { return /^[A-Za-z0-9]$/.test(char); }

function shapeLetters(logical: string) {
  const chars = Array.from(logical);
  const shaped: string[] = [];
  for (let index = 0; index < chars.length; index += 1) {
    const code = chars[index].codePointAt(0)!;
    const forms = ARABIC_FORMS[code];
    if (!forms) { shaped.push(chars[index]); continue; }
    if (code === 0x0644 && index + 1 < chars.length) {
      const ligature = LAM_ALEF[chars[index + 1].codePointAt(0)!];
      if (ligature) {
        const previous = index > 0 ? chars[index - 1].codePointAt(0)! : 0;
        shaped.push(String.fromCodePoint(canConnectAfter(previous) ? ligature[1] : ligature[0]));
        index += 1;
        continue;
      }
    }
    const previous = index > 0 ? chars[index - 1].codePointAt(0)! : 0;
    const next = index + 1 < chars.length ? chars[index + 1].codePointAt(0)! : 0;
    const joinsPrevious = canConnectAfter(previous) && canConnectBefore(code);
    const joinsNext = canConnectAfter(code) && canConnectBefore(next);
    const form = joinsPrevious && joinsNext && forms[3] !== null ? forms[3] : joinsPrevious ? forms[1] : joinsNext && forms[2] !== null ? forms[2] : forms[0];
    shaped.push(String.fromCodePoint(form));
  }
  return shaped.join("");
}

function reverseForLtrRenderer(shaped: string) {
  const runs: { value: string; rtl: boolean }[] = [];
  let value = "";
  let rtl: boolean | null = null;
  for (const char of shaped) {
    const code = char.codePointAt(0)!;
    const nextRtl: boolean | null = isArabicFlow(code) ? true : isLatinDigit(char) ? false : rtl;
    if (rtl !== null && nextRtl !== null && nextRtl !== rtl && value) { runs.push({ value, rtl }); value = ""; }
    rtl = nextRtl ?? rtl ?? false;
    value += char;
  }
  if (value) runs.push({ value, rtl: rtl ?? false });
  return runs.reverse().map((run) => run.rtl ? Array.from(run.value).reverse().join("") : run.value).join("").replace(/ {2,}/g, " ");
}

function shapeForReshef(logical: string) {
  return logical.split(/(#[0-5]|%)/g).map((part) => /^(#[0-5]|%)$/.test(part) ? part : reverseForLtrRenderer(shapeLetters(part))).join("");
}

function decodeToken(token: number) {
  let current = (token + 0x7EC0) & 0xFFFF;
  const original = current;
  if (current > 0x0400) current = (current - 0x0200) & 0xFFFF;
  if (original > 0x0700) current = (current - 0x0100) & 0xFFFF;
  if (original > 0x5F00) current = (current - 0xC000) & 0xFFFF;
  let index = (current - (current >> 8) * 68) & 0xFFFF;
  if ((current & 0xFF) > 0x3F) index = (index - 1) & 0xFFFF;
  return index;
}

function tokenForGlyph(index: number) {
  for (let token = 0x8140; token <= 0xFFFF; token += 1) if (decodeToken(token) === index) return token;
  throw new Error(`لا يوجد رمز نص قابل للوصول لـ glyph 0x${index.toString(16).toUpperCase()}.`);
}

function encodeArabicText(logical: string) {
  const glyphPosition = new Map<number, number>(RESHEF_ARABIC_CODEPOINTS.map((code, index) => [code, index]));
  const bytes: number[] = [];
  for (const char of shapeForReshef(logical)) {
    const code = char.codePointAt(0)!;
    const position = glyphPosition.get(code);
    if (position !== undefined) {
      const token = tokenForGlyph(RESHEF_ARABIC_GLYPH_START + position);
      bytes.push(token >> 8, token & 0xFF); // ترتيب Reshef المثبت: 0x83 ثم 0x05 لـ glyph 0x180.
    } else if (code >= 0x20 && code <= 0x7E) {
      bytes.push(code);
    } else if (code === 0x0A || code === 0x0D) {
      throw new Error("استخدم #0 للفصل بين أسطر الحوار بدلاً من Enter.");
    } else {
      throw new Error(`الحرف «${char}» غير موجود في خط Reshef العربي الحالي.`);
    }
  }
  return Uint8Array.from(bytes);
}

function injectPokemonArabicFont(rom: Uint8Array) {
  const glyphs = base64Bytes(RESHEF_ARABIC_GLYPHS_B64);
  const required = RESHEF_ARABIC_CODEPOINTS.length * 64;
  if (glyphs.length !== required) throw new Error("بيانات خط Pokémon العربية غير مكتملة؛ أُلغي البناء لحماية ROM.");
  RESHEF_ARABIC_CODEPOINTS.forEach((_, index) => {
    const glyphOffset = RESHEF_GLYPH_TABLE_OFFSET + (RESHEF_ARABIC_GLYPH_START + index) * RESHEF_GLYPH_BYTES;
    const pokemonGlyph = glyphs.slice(index * 64, index * 64 + 64);
    rom.set(pokemon4bppToReshef1bpp(pokemonGlyph), glyphOffset);
  });
}

export function buildReshefArabicRom(source: Uint8Array, rows: ReshefDialogueRow[]): BuildResult {
  const translatedRows = rows.filter((row) => row.translationAr.trim());
  if (!translatedRows.length) throw new Error("أدخل ترجمة عربية واحدة على الأقل قبل بناء ROM.");
  const prepared = translatedRows.map((row) => {
    if (!sameControls(row.sourceRaw, row.translationAr)) throw new Error(`${row.id}: رموز التحكم لا تطابق النص الأصلي.`);
    const payload = encodeArabicText(row.translationAr.trim());
    if (payload.length + 2 > row.recordByteCapacity) throw new Error(`${row.id}: تحتاج الترجمة ${payload.length + 2} بايت، بينما السعة الآمنة للسجل ${row.recordByteCapacity} بايت.`);
    return { row, payload };
  });
  const rom = source.slice();
  injectPokemonArabicFont(rom);
  for (const { row, payload } of prepared) {
    rom.fill(0, row.englishOffset, row.englishOffset + row.recordByteCapacity);
    rom.set(payload, row.englishOffset);
    rom.set([0x24, 0x31], row.englishOffset + payload.length); // $1 ثم NUL: بقية سعات اللغة تتوقف بأمان.
  }
  return { rom, applied: prepared.length, encodedBytes: prepared.reduce((total, entry) => total + entry.payload.length, 0) };
}
