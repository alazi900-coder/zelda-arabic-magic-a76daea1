/* Style reminder: بيانات Reshef تتعامل مع ROM محلياً فقط؛ لا تُخفِ رموز التحكم ولا تُرسل الملف خارج المتصفح. */
export type ReshefDialogueRow = {
  id: string;
  recordOffset: number;
  englishOffset: number;
  byteCapacity: number;
  recordByteCapacity: number;
  sourceRaw: string;
  sourceDisplay: string;
  translationAr: string;
};

const START_OFFSET = 0x0a0000;
const LANGUAGE_MARKER = 0x24;

function isPrintable(value: number) { return value >= 0x20 && value <= 0x7e; }

/**
 * بعض حوارات القصة تبدأ بعد $0 ببادئة عرض: مسافة ثم 0x81 0x84.
 * البادئة ليست نصاً؛ إنما تحدد نمط نافذة الحوار، ولذلك نتجاوزها عند العرض
 * ونُبقيها في ROM عند بناء الترجمة.
 */
function dialogueTextStart(rom: Uint8Array, languageStart: number) {
  const candidate = languageStart + 2;
  return rom[candidate] === 0x20 && rom[candidate + 1] === 0x81 && rom[candidate + 2] === 0x84
    ? candidate + 3
    : candidate;
}

export function displayReshefText(raw: string) {
  return raw
    .replace(/#([0-4])/g, "\n")
    .replace(/#5/g, "{PLAYER}")
    .replace(/%/g, "{PAUSE}");
}

export function extractReshefEnglishDialogues(rom: Uint8Array): ReshefDialogueRow[] {
  const rows: ReshefDialogueRow[] = [];
  for (let start = START_OFFSET; start < rom.length - 4; start += 1) {
    if (rom[start] !== LANGUAGE_MARKER || rom[start + 1] !== 0x30) continue;
    const englishOffset = dialogueTextStart(rom, start);
    let cursor = englishOffset;
    let languageEnd = -1;
    while (cursor < rom.length && cursor < start + 2048) {
      if (rom[cursor] === LANGUAGE_MARKER && rom[cursor + 1] === 0x31) { languageEnd = cursor; break; }
      if (rom[cursor] === 0) break;
      cursor += 1;
    }
    if (languageEnd < englishOffset + 3) continue;
    const englishBytes = rom.slice(englishOffset, languageEnd);
    if (!Array.from(englishBytes).every(isPrintable)) continue;
    const sourceRaw = new TextDecoder("latin1").decode(englishBytes);
    if (!/[A-Za-z]{2}/.test(sourceRaw)) continue;
    rows.push({
      id: `RESHEF_${englishOffset.toString(16).toUpperCase().padStart(6, "0")}`,
      recordOffset: start,
      englishOffset,
      byteCapacity: englishBytes.length,
      recordByteCapacity: languageEnd - englishOffset,
      sourceRaw,
      sourceDisplay: displayReshefText(sourceRaw),
      translationAr: "",
    });
    start = languageEnd + 1;
  }
  return rows;
}

export function translationTemplate(rows: ReshefDialogueRow[]) {
  return {
    format: "yugioh-reshef-arabic-translation-v1",
    notes: "احفظ رموز التحكم #0 إلى #5 و% كما تظهر في المصدر. لا تحوّل النص إلى Unicode presentation forms يدوياً؛ ستشكّلها الأداة عند بناء ROM.",
    entries: rows.map(({ id, recordOffset, englishOffset, byteCapacity, recordByteCapacity, sourceRaw, translationAr }) => ({
      id, record_rom_offset: `0x${recordOffset.toString(16).toUpperCase()}`,
      english_rom_offset: `0x${englishOffset.toString(16).toUpperCase()}`,
      byte_capacity: byteCapacity,
      record_byte_capacity: recordByteCapacity,
      source: sourceRaw,
      translation_ar: translationAr,
    })),
  };
}

export function controlMarkers(text: string) { return text.match(/#[0-5]|%/g) ?? []; }

export function sameControls(source: string, translation: string) {
  const required = controlMarkers(source);
  const supplied = controlMarkers(translation);
  return required.every((marker) => supplied.filter((item) => item === marker).length >= required.filter((item) => item === marker).length);
}
