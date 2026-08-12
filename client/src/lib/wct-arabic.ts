/* Style reminder: باني WCT يحافظ على اختبار تسميات اللغة المثبت؛ لا يوسّع إلى حوار غير موثق ولا يلمس رسومات الأعلام. */

export const WCT_ROM_SIZE_MINIMUM = 0x6f8200;
export const WCT_FONT_BASE = 0x6f7ba8;

export type ArabicForms = { isolated: string; final: string; initial?: string; medial?: string; joinsLeft: boolean };
export type WctLabelField = { id: string; flag: string; offset: number; max: number; text: string };

const LETTERS: Record<string, ArabicForms> = {
  "أ": { isolated: "FE83", final: "FE84", joinsLeft: false },
  "إ": { isolated: "FE87", final: "FE88", joinsLeft: false },
  "ا": { isolated: "FE8D", final: "FE8E", joinsLeft: false },
  "ب": { isolated: "FE8F", final: "FE90", initial: "FE91", medial: "FE92", joinsLeft: true },
  "ج": { isolated: "FE9D", final: "FE9E", initial: "FE9F", medial: "FEA0", joinsLeft: true },
  "ر": { isolated: "FEAD", final: "FEAE", joinsLeft: false },
  "ز": { isolated: "FEAF", final: "FEB0", joinsLeft: false },
  "س": { isolated: "FEB1", final: "FEB2", initial: "FEB3", medial: "FEB4", joinsLeft: true },
  "ط": { isolated: "FEC1", final: "FEC2", initial: "FEC3", medial: "FEC4", joinsLeft: true },
  "ف": { isolated: "FED1", final: "FED2", initial: "FED3", medial: "FED4", joinsLeft: true },
  "ل": { isolated: "FEDD", final: "FEDE", initial: "FEDF", medial: "FEE0", joinsLeft: true },
  "م": { isolated: "FEE1", final: "FEE2", initial: "FEE3", medial: "FEE4", joinsLeft: true },
  "ن": { isolated: "FEE5", final: "FEE6", initial: "FEE7", medial: "FEE8", joinsLeft: true },
  "ه": { isolated: "FEE9", final: "FEEA", initial: "FEEB", medial: "FEEC", joinsLeft: true },
  "ي": { isolated: "FEF1", final: "FEF2", initial: "FEF3", medial: "FEF4", joinsLeft: true },
};

const TILES: Record<string, string> = {
  FE83:"000000608060804040404040", FE84:"000000608060C04040407F00", FE87:"004040404040400060806080", FE88:"0080808080807F0060806080", FE8D:"000000000080808080808000", FE8E:"000000000080808080807F00", FE8F:"000000000000008484780020", FE90:"0000000000000084847B0020", FE91:"000000000000001010E00020", FE92:"000000000000002020DF0020", FE9D:"0000000000F0182040908078", FE9E:"00000000E018304F80908070", FE9F:"000000000000601008F00020", FEA0:"000000000000601008FF0020", FEAD:"00000000000020101010A040", FEAE:"000000000000201F1010A040", FEAF:"00000000200020101010A040", FEB0:"000000002000201F1010A040", FEB1:"0000000000000115559A9060", FEB2:"0000000000000115559A9060", FEB3:"00000000000000045454A800", FEB4:"00000000000000045454AB00", FEC1:"00000000404040586444F800", FEC2:"00000000404040586444FA00", FEC3:"00000000404040586444F800", FEC4:"00000000404040586444FA00", FED1:"0000000008000C144C848478", FED2:"0000000008000C144C848778", FED3:"00000000200030503010E000", FED4:"00000000200030503010EF00", FEDD:"000000000008080848888870", FEDE:"000000000008080848888F70", FEDF:"00000000002020202020C000", FEE0:"00000000002020202020DF00", FEE1:"0000000000304848B0808080", FEE2:"0000000000304848B7808080", FEE3:"00000000000000001824E418", FEE4:"00000000000000001824E718", FEE5:"000000000000002088888870", FEE6:"000000000000002088888F70", FEE7:"00000000000010001010E000", FEE8:"00000000000020002020DF00", FEE9:"0000000000A0006090906000", FEEA:"0000000000002060A0E03F00", FEEB:"000000000000001824D42818", FEEC:"00000000000000001824D738", FEF1:"000000000C52908884780050", FEF2:"000000000C52938884780050", FEF3:"000000000000001010E00050", FEF4:"000000000000002020DF0050",
};

export const DEFAULT_WCT_LABELS: WctLabelField[] = [
  { id: "japan", flag: "اليابان", offset: 0x6852a6, max: 8, text: "ياباني" },
  { id: "uk", flag: "إنجلترا", offset: 0x6852b0, max: 7, text: "إنجليزي" },
  { id: "germany", flag: "ألمانيا", offset: 0x6852b8, max: 6, text: "ألماني" },
  { id: "france", flag: "فرنسا", offset: 0x6852c0, max: 6, text: "فرنسي" },
  { id: "italy", flag: "إيطاليا", offset: 0x6852c8, max: 7, text: "إيطالي" },
  { id: "spain", flag: "إسبانيا", offset: 0x6852d0, max: 7, text: "إسباني" },
];

export function wctFormsFor(text: string): string[] {
  const letters = Array.from(text.replace(/\s/g, ""));
  if (!letters.length) throw new Error("أدخل تسمية عربية.");
  letters.forEach((letter) => { if (!LETTERS[letter]) throw new Error(`الحرف «${letter}» غير مدعوم في خط WCT الحالي.`); });
  const logical = letters.map((letter) => LETTERS[letter]);
  return letters.map((letter, index) => {
    const char = LETTERS[letter];
    const previous = logical[index - 1];
    const next = logical[index + 1];
    const joinsPrevious = Boolean(previous?.joinsLeft);
    const joinsNext = char.joinsLeft && Boolean(next);
    if (joinsPrevious && joinsNext && char.medial) return char.medial;
    if (joinsPrevious) return char.final;
    if (joinsNext && char.initial) return char.initial;
    return char.isolated;
  }).reverse();
}

export function wctTileBytes(codepoint: string) {
  const hex = TILES[codepoint];
  if (!hex) throw new Error(`لا توجد بلاطة للحرف U+${codepoint}`);
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((value) => Number.parseInt(value, 16)));
}

export function buildWctLabelRom(original: Uint8Array, fields: WctLabelField[]) {
  if (original.length < WCT_ROM_SIZE_MINIMUM) throw new Error("الملف أصغر من ROM Yu-Gi-Oh! World Championship Tournament 2004 المدعوم.");
  const prepared = fields.map((field) => ({ ...field, forms: wctFormsFor(field.text) }));
  prepared.forEach((field) => { if (field.forms.length > field.max) throw new Error(`${field.flag}: الحد المتاح هو ${field.max} حروف.`); });
  const glyphs = Array.from(new Set(prepared.flatMap((field) => field.forms)));
  if (glyphs.length > 46) throw new Error("عدد أشكال الحروف يتجاوز الخانات الآمنة في اختبار WCT.");
  const codeFor = new Map(glyphs.map((glyph, index) => [glyph, 0x41 + index]));
  const result = new Uint8Array(original);
  glyphs.forEach((glyph) => result.set(wctTileBytes(glyph), WCT_FONT_BASE + codeFor.get(glyph)! * 12));
  prepared.forEach((field) => {
    const bytes = field.forms.map((glyph) => codeFor.get(glyph)!);
    result.fill(0, field.offset, field.offset + field.max + 1);
    result.set(bytes, field.offset);
  });
  return { rom: result, glyphCount: glyphs.length, labelCount: prepared.length };
}
