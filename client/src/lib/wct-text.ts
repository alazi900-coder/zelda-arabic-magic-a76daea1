/* Style reminder: يفحص مستخرج WCT ROM كاملاً محلياً؛ يحتفظ بالسعة والإزاحة ولا يقدّم السلاسل المرشحة على أنها ترجمة جاهزة للبناء. */

export type WctTextRow = {
  id: string;
  offset: number;
  byteCapacity: number;
  sourceRaw: string;
  sourceDisplay: string;
  pointerCount: number;
  translationAr: string;
};

const GBA_ROM_START = 0x08000000;

function isPrintableAscii(value: number) {
  return value >= 0x20 && value <= 0x7e;
}

function isLatinLetter(value: number) {
  return (value >= 0x41 && value <= 0x5a) || (value >= 0x61 && value <= 0x7a);
}

/**
 * فهرس مؤشرات ROM المباشرة. المؤشر ليس شرطاً لاستخراج النص لأن WCT قد يمرر
 * بعض السلاسل عبر جداول أو حسابات، لكنه دليل قوي لتصنيف السطر.
 */
function directPointerCounts(rom: Uint8Array) {
  const counts = new Map<number, number>();
  const view = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  for (let offset = 0; offset + 4 <= rom.length; offset += 4) {
    const value = view.getUint32(offset, true);
    if (value < GBA_ROM_START || value >= GBA_ROM_START + rom.length) continue;
    const target = value - GBA_ROM_START;
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return counts;
}

/**
 * يمسح ROM بكامله للإنجليزية ASCII المخزنة بصورة مباشرة والمنتهية بـ NUL.
 * تحفظ السعة كما هي في الملف؛ لا توجد هنا إعادة توطين أو تخمين لمساحة جديدة.
 */
export function extractWctEnglishStrings(rom: Uint8Array): WctTextRow[] {
  const pointers = directPointerCounts(rom);
  const rows: WctTextRow[] = [];
  let cursor = 0;

  while (cursor < rom.length) {
    if (!isPrintableAscii(rom[cursor])) {
      cursor += 1;
      continue;
    }

    const start = cursor;
    let letters = 0;
    while (cursor < rom.length && isPrintableAscii(rom[cursor]) && cursor - start < 768) {
      if (isLatinLetter(rom[cursor])) letters += 1;
      cursor += 1;
    }

    const terminated = cursor < rom.length && rom[cursor] === 0;
    const length = cursor - start;
    const pointed = pointers.get(start) ?? 0;
    const densityOk = letters >= 2 && letters * 2 >= length;
    const shortPointed = pointed > 0 && letters >= 1;

    if (terminated && length >= 2 && (densityOk || shortPointed)) {
      const sourceRaw = String.fromCharCode(...Array.from(rom.subarray(start, cursor)));
      rows.push({
        id: `WCT_${start.toString(16).toUpperCase().padStart(6, "0")}`,
        offset: start,
        byteCapacity: length,
        sourceRaw,
        sourceDisplay: sourceRaw,
        pointerCount: pointed,
        translationAr: "",
      });
      cursor += 1;
      continue;
    }

    cursor = start + 1;
  }

  return rows;
}

export function wctTranslationTemplate(rows: WctTextRow[]) {
  return {
    format: "yugioh-wct2004-arabic-translation-v1",
    notes: "هذه قائمة السلاسل الإنجليزية ASCII المرشحة والمخزنة مباشرة في ROM. لا تستخدم بناء حوار WCT قبل اكتمال توثيق محرك النص وترميز الأشكال العربية. السعة هي عدد بايتات النص الأصلي من دون بايت النهاية 00.",
    entries: rows.map(({ id, offset, byteCapacity, sourceRaw, pointerCount, translationAr }) => ({
      id,
      rom_offset: `0x${offset.toString(16).toUpperCase()}`,
      byte_capacity: byteCapacity,
      direct_pointer_count: pointerCount,
      source: sourceRaw,
      translation_ar: translationAr,
    })),
  };
}
