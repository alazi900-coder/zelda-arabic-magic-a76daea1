/**
 * فكّ ضغط LZ77 كما يفعله الجهاز نفسه (BIOS SWI 0x11/0x12).
 *
 * ألعاب GBA تضغط أكثر رسومها بهذه الطريقة، والخطّ منها في بعض الألعاب —
 * وهذا سبب فشل البحث عن خطّ Pokémon Emerald في البايتات الخام: ليس هناك
 * ما يُقرأ حتى يُفكّ الضغط.
 *
 * والترويسة أربعة بايتات: `0x10` ثمّ الطول المفكوك بثلاثة بايتات. ثمّ
 * كتلٌ من تسعة: بايت أعلام، وثمانية عناصر — إمّا بايتٌ يُنسخ كما هو، أو
 * مرجعٌ إلى ما سبق بمقدارٍ وطول.
 */

/** أقصى ما يُقبل فكّه، حتى لا تلتهم ترويسةٌ زائفة الذاكرة. */
const DEFAULT_MAX = 0x20000;

export function decompressGbaLz77(rom: Uint8Array, at: number, maxSize = DEFAULT_MAX): Uint8Array | null {
  if (at + 4 > rom.length || rom[at] !== 0x10) return null;
  const size = rom[at + 1] | (rom[at + 2] << 8) | (rom[at + 3] << 16);
  if (size === 0 || size > maxSize) return null;

  const out = new Uint8Array(size);
  let written = 0;
  let p = at + 4;
  while (written < size) {
    if (p >= rom.length) return null;
    const flags = rom[p++];
    for (let bit = 0; bit < 8 && written < size; bit++) {
      if (flags & (0x80 >> bit)) {
        if (p + 1 >= rom.length) return null;
        const first = rom[p++];
        const second = rom[p++];
        const length = (first >> 4) + 3;
        const back = (((first & 0x0f) << 8) | second) + 1;
        if (back > written) return null;
        for (let i = 0; i < length && written < size; i++) {
          out[written] = out[written - back];
          written++;
        }
      } else {
        if (p >= rom.length) return null;
        out[written++] = rom[p++];
      }
    }
  }
  return out;
}

/**
 * مواضع الترويسات التي يُرجّح أنّها ضغطٌ حقيقي.
 *
 * البايت `0x10` يتكرّر في الروم كثيراً بلا معنى، فيُشترط أن يكون الطول
 * معقولاً وأن ينجح الفكّ إلى آخره — وهذا وحده يُسقط أكثر الترويسات
 * الزائفة، لأنّ بيانات عشوائية لا تُفكّ إلى طولها المذكور بالضبط.
 */
export function findGbaLz77Blocks(
  rom: Uint8Array,
  minSize = 0x100,
  maxSize = DEFAULT_MAX
): { at: number; size: number }[] {
  const out: { at: number; size: number }[] = [];
  for (let at = 0; at + 8 < rom.length; at += 4) {
    if (rom[at] !== 0x10) continue;
    const size = rom[at + 1] | (rom[at + 2] << 8) | (rom[at + 3] << 16);
    if (size < minSize || size > maxSize) continue;
    if (decompressGbaLz77(rom, at, maxSize)) out.push({ at, size });
  }
  return out;
}
