/** Yu-Gi-Oh! Reshef: bridge to the shared editor. All ROM work stays in-browser. */
import type { ExtractedEntry } from "@/components/editor/types";
import { PKM_ARABIC_GLYPHS_B64 } from "@/lib/pokemon/pkm-font";
import { pkmGlyphCodepoints } from "@/lib/pokemon/pkm-charmap";

export const RESHEF_BUFFER_KEY = "yugiohReshefSourceBuffer";
export const RESHEF_SOURCE_GAME = "yugioh-reshef";
export const RESHEF_ENTRY_FILE = "ygo_reshef_dialogue";

const START_OFFSET = 0x0a0000;
const FONT_TABLE_OFFSET = 0xdf3c00;
const FONT_GLYPH_START = 0x180;
const FONT_GLYPH_BYTES = 18;
const SHADOW_TABLE_OFFSET = 0x183800;
const TWO_LAYER_HOOK_OFFSET = 0x183624;
const TWO_LAYER_CALL_OFFSET = 0x0215e4;
const TWO_LAYER_CALL = Uint8Array.of(0x62, 0xf1, 0x1e, 0xf8);
/**
 * Thumb hook verified in mGBA on the live Joey dialogue. It replaces the sole
 * call at 0x080215E4: normal glyphs branch to Reshef's original 1bpp routine;
 * injected Arabic slots map the 4bpp Pokémon body (15) and shade (14) masks
 * to 4bpp palette indices 1 and 2 without collapsing them into one bitplane.
 */
const TWO_LAYER_HOOK = Uint8Array.of(
  0x15,0x4b,0x98,0x42,0x25,0xd3,0x15,0x4b,0x98,0x42,0x22,0xd2,0xf0,0xb5,0x04,0x00,
  0x0d,0x00,0x11,0x4e,0xa6,0x1b,0x12,0x4f,0xbe,0x19,0x00,0x27,0xe0,0x5d,0xf1,0x5d,
  0x08,0x22,0x00,0x23,0x40,0x08,0x03,0xd2,0x49,0x08,0x05,0xd2,0x1b,0x01,0x05,0xe0,
  0x49,0x08,0x1b,0x01,0x01,0x33,0x01,0xe0,0x1b,0x01,0x02,0x33,0x01,0x3a,0xf1,0xd1,
  0x2b,0x60,0x04,0x35,0x01,0x37,0x08,0x2f,0x00,0xd1,0x20,0x35,0x10,0x2f,0xe5,0xd3,
  0xf0,0xbd,0x04,0x4b,0x18,0x47,0x00,0x00,0x00,0x57,0xdf,0x08,0x12,0x60,0xdf,0x08,
  0x00,0x38,0x18,0x08,0xf5,0x15,0x02,0x08,
);

type Forms = [number, number, number | null, number | null];
interface ReshefRow { offset: number; capacity: number; source: string; }
export interface ReshefBuildOk { rom: Uint8Array; translatedLines: number; encodedBytes: number; fontApplied: boolean; }
export interface ReshefBuildError { error: string; }

const FORMS: Record<number, Forms> = {
  0x0621:[0xfe80,0xfe80,null,null],0x0622:[0xfe81,0xfe82,null,null],0x0623:[0xfe83,0xfe84,null,null],0x0624:[0xfe85,0xfe86,null,null],0x0625:[0xfe87,0xfe88,null,null],
  0x0626:[0xfe89,0xfe8a,0xfe8b,0xfe8c],0x0627:[0xfe8d,0xfe8e,null,null],0x0628:[0xfe8f,0xfe90,0xfe91,0xfe92],0x0629:[0xfe93,0xfe94,null,null],
  0x062a:[0xfe95,0xfe96,0xfe97,0xfe98],0x062b:[0xfe99,0xfe9a,0xfe9b,0xfe9c],0x062c:[0xfe9d,0xfe9e,0xfe9f,0xfea0],0x062d:[0xfea1,0xfea2,0xfea3,0xfea4],
  0x062e:[0xfea5,0xfea6,0xfea7,0xfea8],0x062f:[0xfea9,0xfeaa,null,null],0x0630:[0xfeab,0xfeac,null,null],0x0631:[0xfead,0xfeae,null,null],0x0632:[0xfeaf,0xfeb0,null,null],
  0x0633:[0xfeb1,0xfeb2,0xfeb3,0xfeb4],0x0634:[0xfeb5,0xfeb6,0xfeb7,0xfeb8],0x0635:[0xfeb9,0xfeba,0xfebb,0xfebc],0x0636:[0xfebd,0xfebe,0xfebf,0xfec0],
  0x0637:[0xfec1,0xfec2,0xfec3,0xfec4],0x0638:[0xfec5,0xfec6,0xfec7,0xfec8],0x0639:[0xfec9,0xfeca,0xfecb,0xfecc],0x063a:[0xfecd,0xfece,0xfecf,0xfed0],
  0x0640:[0x0640,0x0640,0x0640,0x0640],0x0641:[0xfed1,0xfed2,0xfed3,0xfed4],0x0642:[0xfed5,0xfed6,0xfed7,0xfed8],0x0643:[0xfed9,0xfeda,0xfedb,0xfedc],
  0x0644:[0xfedd,0xfede,0xfedf,0xfee0],0x0645:[0xfee1,0xfee2,0xfee3,0xfee4],0x0646:[0xfee5,0xfee6,0xfee7,0xfee8],0x0647:[0xfee9,0xfeea,0xfeeb,0xfeec],
  0x0648:[0xfeed,0xfeee,null,null],0x0649:[0xfeef,0xfef0,null,null],0x064a:[0xfef1,0xfef2,0xfef3,0xfef4],
};
const LAM_ALEF: Record<number, [number, number]> = { 0x0622:[0xfef5,0xfef6],0x0623:[0xfef7,0xfef8],0x0625:[0xfef9,0xfefa],0x0627:[0xfefb,0xfefc] };

const printable = (v: number) => v >= 0x20 && v <= 0x7e;
const display = (v: string) => v.replace(/#([0-4])/g, "\n").replace(/#5/g, "{PLAYER}").replace(/%/g, "{PAUSE}");
const keyFor = (offset: number) => `${RESHEF_ENTRY_FILE}:${offset}`;
const controls = (v: string) => v.match(/#[0-5]|%/g)?.join("|") ?? "";

function textStart(rom: Uint8Array, languageStart: number) {
  const candidate = languageStart + 2;
  return rom[candidate] === 0x20 && rom[candidate + 1] === 0x81 && rom[candidate + 2] === 0x84 ? candidate + 3 : candidate;
}

function scanRows(rom: Uint8Array): ReshefRow[] {
  const rows: ReshefRow[] = [];
  for (let start = START_OFFSET; start < rom.length - 4; start++) {
    if (rom[start] !== 0x24 || rom[start + 1] !== 0x30) continue;
    const offset = textStart(rom, start);
    let end = -1;
    for (let p = offset; p < rom.length && p < start + 2048; p++) {
      if (rom[p] === 0x24 && rom[p + 1] === 0x31) { end = p; break; }
      if (rom[p] === 0) break;
    }
    if (end < offset + 3) continue;
    const bytes = rom.slice(offset, end);
    if (!Array.from(bytes).every(printable)) continue;
    const source = new TextDecoder("latin1").decode(bytes);
    if (!/[A-Za-z]{2}/.test(source)) continue;
    rows.push({ offset, capacity: end - offset, source });
    start = end + 1;
  }
  return rows;
}

export function looksLikeReshefRom(rom: Uint8Array) { return rom.length >= 0xe00000 && rom.length <= 0x2000000; }

export function extractReshefEntries(rom: Uint8Array): ExtractedEntry[] {
  return scanRows(rom).map((row) => ({
    msbtFile: RESHEF_ENTRY_FILE,
    index: row.offset,
    label: display(row.source).replace(/\s+/g, " ").trim().slice(0, 60),
    original: row.source,
    maxBytes: row.capacity - 2,
  }));
}

function connectsAfter(code: number) { return FORMS[code]?.[2] !== null && FORMS[code] !== undefined; }
function connectsBefore(code: number) { const f = FORMS[code]; return f !== undefined && f[1] !== f[0]; }
function shape(text: string) {
  const chars = Array.from(text);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0)!;
    const f = FORMS[cp];
    if (!f) { out.push(chars[i]); continue; }
    if (cp === 0x0644 && i + 1 < chars.length && LAM_ALEF[chars[i + 1].codePointAt(0)!]) {
      const ligature = LAM_ALEF[chars[i + 1].codePointAt(0)!];
      out.push(String.fromCodePoint(connectsAfter(i ? chars[i - 1].codePointAt(0)! : 0) ? ligature[1] : ligature[0])); i++; continue;
    }
    const prev = i ? chars[i - 1].codePointAt(0)! : 0;
    const next = i + 1 < chars.length ? chars[i + 1].codePointAt(0)! : 0;
    const before = connectsAfter(prev) && connectsBefore(cp);
    const after = connectsAfter(cp) && connectsBefore(next);
    out.push(String.fromCodePoint(before && after && f[3] !== null ? f[3] : before ? f[1] : after && f[2] !== null ? f[2] : f[0]));
  }
  return out.join("");
}
function rtlRenderer(text: string) {
  const runs: { v: string; rtl: boolean }[] = []; let v = ""; let rtl: boolean | null = null;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!; const next = (cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0xfe70 && cp <= 0xfeff) ? true : /^[A-Za-z0-9]$/.test(ch) ? false : rtl;
    if (rtl !== null && next !== null && next !== rtl && v) { runs.push({ v, rtl }); v = ""; }
    rtl = next ?? rtl ?? false; v += ch;
  }
  if (v) runs.push({ v, rtl: rtl ?? false });
  return runs.reverse().map((r) => r.rtl ? Array.from(r.v).reverse().join("") : r.v).join("");
}
function decodeToken(token: number) { let c = (token + 0x7ec0) & 0xffff; const o = c; if (c > 0x0400) c = (c - 0x0200) & 0xffff; if (o > 0x0700) c = (c - 0x0100) & 0xffff; if (o > 0x5f00) c = (c - 0xc000) & 0xffff; let i = (c - (c >> 8) * 68) & 0xffff; if ((c & 0xff) > 0x3f) i = (i - 1) & 0xffff; return i; }
function tokenFor(index: number) { for (let t = 0x8140; t <= 0xffff; t++) if (decodeToken(t) === index) return t; throw new Error("لم يُعثر على رمز نص صالح لخط Reshef."); }
function sourceGlyphToMasks(source: Uint8Array) {
  const body = new Uint8Array(16);
  const shadow = new Uint8Array(16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 8; x++) {
      const p = (source[y * 4 + (x >> 1)] >> (4 * (x & 1))) & 0xf;
      if (p === 15) body[y] |= 0x80 >> x;
      if (p === 14) shadow[y] |= 0x80 >> x;
    }
  }
  return { body, shadow };
}
function fontBytes() { const bin = atob(PKM_ARABIC_GLYPHS_B64); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); }
function injectFont(rom: Uint8Array) {
  const source = fontBytes();
  pkmGlyphCodepoints().forEach((_, i) => {
    const { body, shadow } = sourceGlyphToMasks(source.slice(i * 64, i * 64 + 64));
    rom.set(body, FONT_TABLE_OFFSET + (FONT_GLYPH_START + i) * FONT_GLYPH_BYTES);
    rom.set(shadow, SHADOW_TABLE_OFFSET + i * 16);
  });
  rom.set(TWO_LAYER_HOOK, TWO_LAYER_HOOK_OFFSET);
  rom.set(TWO_LAYER_CALL, TWO_LAYER_CALL_OFFSET);
}
function encode(logical: string) {
  const codepoints = pkmGlyphCodepoints(); const slot = new Map(codepoints.map((c, i) => [c, i])); const out: number[] = [];
  for (const piece of logical.split(/(#[0-5]|%)/g)) {
    const shaped = /^(#[0-5]|%)$/.test(piece) ? piece : rtlRenderer(shape(piece));
    for (const ch of shaped) { const cp = ch.codePointAt(0)!; const n = slot.get(cp); if (n !== undefined) { const token = tokenFor(FONT_GLYPH_START + n); out.push(token >> 8, token & 0xff); } else if (cp >= 0x20 && cp <= 0x7e) out.push(cp); else throw new Error(`الحرف «${ch}» غير موجود في خط Reshef العربي.`); }
  }
  return Uint8Array.from(out);
}

export function buildReshefRom(source: Uint8Array, translations: Record<string, string>): ReshefBuildOk | ReshefBuildError {
  if (!looksLikeReshefRom(source)) return { error: "الملف لا يبدو ROM Yu-Gi-Oh! Reshef of Destruction (USA) صحيحاً." };
  try {
    const prepared = scanRows(source).flatMap((row) => {
      const translation = translations[keyFor(row.offset)]?.trim();
      if (!translation) return [];
      if (controls(translation) !== controls(row.source)) throw new Error(`السجل 0x${row.offset.toString(16).toUpperCase()}: رموز التحكم #0–#5 و% يجب أن تبقى كما هي.`);
      const bytes = encode(translation);
      if (bytes.length + 2 > row.capacity) throw new Error(`السجل 0x${row.offset.toString(16).toUpperCase()}: الترجمة تحتاج ${bytes.length + 2} بايت، والسعة الآمنة ${row.capacity} بايت.`);
      return [{ row, bytes }];
    });
    if (!prepared.length) return { error: "لا توجد ترجمات محفوظة لبنائها." };
    const rom = source.slice(); injectFont(rom);
    for (const { row, bytes } of prepared) { rom.fill(0, row.offset, row.offset + row.capacity); rom.set(bytes, row.offset); rom.set([0x24, 0x31], row.offset + bytes.length); }
    return { rom, translatedLines: prepared.length, encodedBytes: prepared.reduce((n, v) => n + v.bytes.length, 0), fontApplied: true };
  } catch (error) { return { error: (error as Error).message }; }
}
