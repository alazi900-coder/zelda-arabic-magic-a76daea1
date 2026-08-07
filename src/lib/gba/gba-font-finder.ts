/**
 * إيجاد خطّ لعبة GBA في رومها — بلا افتراضٍ لتخطيطه ولا لألوانه
 *
 * البحث اليدوي عن خطّ Pokémon Emerald استغرق ثماني محاولات وفشلت كلّها،
 * وسبب الفشل واحد في كلّها: كنتُ **أثبّت** شيئاً ثمّ أبحث. أثبّت أنّ
 * الحرف ٨×١٦ فلا أجده لأنّه ١٦×١٦؛ وأثبّت أنّ جسمه اللون ١٥ وظلّه ١٤ —
 * وهو كذلك في Ruby Destiny — فلا أجده في Emerald لأنّها تستعمل ٤ و٥.
 *
 * فهذه الأداة لا تثبّت شيئاً. تجرّب التخطيطات كلّها، ولا تسأل عن قيمة
 * لونٍ بعينه بل عن **بنية**: الخطّ مجموعة أشكال متجاورة تشترك في سطر
 * كتابة واحد، وتترك هامشاً فوقه وتحته، ولا تلمس حافّة خليّتها اليمنى،
 * وتُرسم بألوان قليلة. وهذه أوصافٌ تصدق على خطّ عربي وخطّ ياباني وخطّ
 * لاتيني، وعلى أربعة بتات واثنين وواحد.
 *
 * والحكم النهائي للعين: الأداة تُرتّب المرشّحين وترسمهم، والمترجم ينظر.
 * فهي تختصر ستّة عشر ميغابايت إلى عشرة مواضع، لا تدّعي اليقين.
 */

import { decompressGbaLz77, findGbaLz77Blocks } from "./gba-lz77";

/** تخطيطٌ محتمل لخليّة حرف. */
export interface GbaGlyphLayout {
  width: number;
  height: number;
  /** بتات اللون الواحد: ١ أو ٢ أو ٤. */
  bpp: number;
  /**
   * ترتيب البتّات داخل البايت من الأعلى إلى الأدنى. خطوط البتّ الواحد
   * المرسومة برمجياً (كخطّ Yu-Gi-Oh! WCT 2004) تُخزَّن هكذا، وقراءتها
   * بالترتيب المعتاد تقلب الحرف أفقياً فلا يُعرف.
   */
  msbFirst?: boolean;
  /**
   * جدولٌ مُشرَّك: نصف الحرف الأعلى هنا، ونصفه الأسفل بعد هذا العدد من
   * البلاطات. تُخزَّن خطوط الجيل الثالث هكذا — أنصافٌ علوية متتابعة ثمّ
   * أنصافٌ سفلية — فقراءتها متتابعةً تُلصق نصف حرفٍ بنصف آخر ولا تُرى
   * حروفاً. وهذا ما أخفى خطّ Emerald عن الأداة أوّل مرّة.
   */
  interleaveTiles?: number;
}


export interface GbaFontCandidate {
  /** موضع أوّل خليّة: في الروم للخام، وفي الكتلة المفكوكة للمضغوط. */
  offset: number;
  /** موضع ترويسة الضغط في الروم، إن كان الخطّ مضغوطاً. */
  compressedAt?: number;
  layout: GbaGlyphLayout;
  /** كم خليّة متتابعة تحمل هذه الصفة. */
  glyphs: number;
  score: number;
  /** ما قيسَ عليه الحكم، ليُقرأ في التقرير. */
  detail: { colours: number; inkMedian: number; baselineRows: number; blanks: number; unique: number };
}

/** التخطيطات التي تستعملها ألعاب هذا الجهاز عملياً. */
export const GBA_GLYPH_LAYOUTS: GbaGlyphLayout[] = [
  // بتّان لكل بكسل: ترميز خطّ Pokémon Emerald، وهو التخطيط الوحيد الذي لم
  // تكن الأداة تجرّبه — فكانت تقرأ حرفه بأربعة بتات فتراه ضجيجاً. وُجد
  // بمراقبة الفاكّ في المحاكي: ١٦ بايتاً لكل خليّة ٨×٨، والحرف نصفان.
  { width: 8, height: 8, bpp: 2 },
  { width: 8, height: 8, bpp: 4 },
  { width: 8, height: 16, bpp: 4 },
  { width: 16, height: 16, bpp: 4 },
  { width: 8, height: 12, bpp: 4 },
  { width: 8, height: 16, bpp: 2 },
  { width: 16, height: 16, bpp: 2 },
  { width: 8, height: 8, bpp: 1 },
  { width: 8, height: 16, bpp: 1 },
  { width: 16, height: 16, bpp: 1 },
  // بتٌّ واحد بترتيبٍ مقلوب: خطّ Yu-Gi-Oh! WCT 2004 مخزَّنٌ هكذا، وقراءته
  // بالترتيب المعتاد تعكس كلّ حرفٍ أفقياً فلا يُعرف ولا يُقبل.
  { width: 8, height: 8, bpp: 1, msbFirst: true },
  { width: 8, height: 16, bpp: 1, msbFirst: true },
  { width: 16, height: 16, bpp: 1, msbFirst: true },
  // جداول مُشرَّكة: أنصافٌ علوية ثمّ سفلية، وعدد الحروف بينهما يُجرَّب.
  { width: 8, height: 16, bpp: 4, interleaveTiles: 64 },
  { width: 8, height: 16, bpp: 4, interleaveTiles: 96 },
  { width: 8, height: 16, bpp: 4, interleaveTiles: 128 },
  { width: 8, height: 16, bpp: 4, interleaveTiles: 256 },
  { width: 8, height: 16, bpp: 2, interleaveTiles: 128 },
];

export function gbaGlyphBytes(layout: GbaGlyphLayout): number {
  return (layout.width * layout.height * layout.bpp) / 8;
}

function glyphBytes(layout: GbaGlyphLayout): number {
  return gbaGlyphBytes(layout);
}

/** ما تتقدّمه القراءة من خليّة إلى التي تليها. */
function glyphStride(layout: GbaGlyphLayout): number {
  // في الجدول المُشرَّك تتقدّم القراءة نصف حرفٍ فقط، لأنّ نصفه الآخر بعيد.
  return layout.interleaveTiles ? glyphBytes(layout) / 2 : glyphBytes(layout);
}

export function gbaGlyphStride(layout: GbaGlyphLayout): number {
  return glyphStride(layout);
}

/** موضع البتّات داخل البايت: يختلف بترتيب البتّ. */
function bitShift(index: number, layout: GbaGlyphLayout): number {
  const perByte = 8 / layout.bpp;
  const slot = index % perByte;
  return (layout.msbFirst ? perByte - 1 - slot : slot) * layout.bpp;
}

/** بكسلات خليّة واحدة، صفّاً صفّاً. */
function readGlyph(rom: Uint8Array, at: number, layout: GbaGlyphLayout): Uint8Array {
  const { width, height, bpp } = layout;
  const out = new Uint8Array(width * height);
  const perByte = 8 / bpp;
  const mask = (1 << bpp) - 1;
  const half = (width * (height / 2) * bpp) / 8;
  const apart = layout.interleaveTiles ? layout.interleaveTiles * half : 0;
  for (let i = 0; i < width * height; i++) {
    // النصف الأسفل يُقرأ من موضعه البعيد حين يكون الجدول مُشرَّكاً.
    const lower = apart > 0 && i >= (width * height) / 2;
    const index = lower ? i - (width * height) / 2 : i;
    const base = at + (lower ? apart : 0);
    const byte = rom[base + Math.floor(index / perByte)];
    out[i] = (byte >> bitShift(index, layout)) & mask;
  }
  return out;
}

/** قراءة خليّة بعينها من جدولٍ يبدأ عند `at` — للتحرير والمعاينة. */
export function readGbaGlyph(rom: Uint8Array, at: number, layout: GbaGlyphLayout, index = 0): Uint8Array {
  return readGlyph(rom, at + index * glyphStride(layout), layout);
}

/** كتابة خليّة بعينها في نسخةٍ من البايتات — عكس القراءة تماماً. */
export function writeGbaGlyph(
  rom: Uint8Array,
  at: number,
  layout: GbaGlyphLayout,
  index: number,
  pixels: Uint8Array
): void {
  const { width, height, bpp } = layout;
  const perByte = 8 / bpp;
  const mask = (1 << bpp) - 1;
  const half = (width * (height / 2) * bpp) / 8;
  const apart = layout.interleaveTiles ? layout.interleaveTiles * half : 0;
  const start = at + index * glyphStride(layout);
  for (let i = 0; i < width * height; i++) {
    const lower = apart > 0 && i >= (width * height) / 2;
    const j = lower ? i - (width * height) / 2 : i;
    const byteAt = start + (lower ? apart : 0) + Math.floor(j / perByte);
    const shift = bitShift(j, layout);
    rom[byteAt] = (rom[byteAt] & ~(mask << shift)) | ((pixels[i] & mask) << shift);
  }
}


/**
 * مرشّحٌ سريع على الروم كلّه: أين تقلّ الألوان؟
 *
 * رسمُ حرفٍ يستعمل لوناً أو لونين وظلّاً، لا أكثر — أيّاً كانت أرقامها.
 * وهذا وحده يُسقط الشيفرة والنصّ والبيانات المضغوطة، ولا يفترض أيّ لون
 * بعينه، فينجو خطّ Emerald كما ينجو خطّ Ruby Destiny.
 */
function sparseBlocks(rom: Uint8Array, block: number, maxColours: number): boolean[] {
  const count = Math.floor(rom.length / block);
  const out = new Array<boolean>(count).fill(false);
  for (let b = 0; b < count; b++) {
    const start = b * block;
    let seen = 0;
    let distinct = 0;
    let same = 0;
    const first = rom[start];
    for (let i = 0; i < block; i++) {
      const byte = rom[start + i];
      if (byte === first) same++;
      for (const nibble of [byte & 15, byte >> 4]) {
        const bit = 1 << nibble;
        if ((seen & bit) === 0) {
          seen |= bit;
          distinct++;
        }
      }
      if (distinct > maxColours) break;
    }
    // كتلة كلّها بايت واحد ليست رسماً بل حشو.
    // ويُقبل أيضاً ما قلّت قيَمه البايتيّة: رسمُ البتّين تكثر أنصاف بايتاته
    // (f0، d5، 6a…) فيسقط في عدّ الأنصاف، لكنّ بايتاته نفسها قليلة متكرّرة
    // لأنّ صفوف الخلفية تتكرّر. وبهذا ينجو خطّ Emerald وهو مخزَّن ببتّين.
    let bytes = 0;
    const seenBytes = new Set<number>();
    for (let i = 0; i < block; i++) seenBytes.add(rom[start + i]);
    bytes = seenBytes.size;
    out[b] = (distinct <= maxColours || bytes <= 20) && same < block * 0.94;
  }
  return out;
}

/**
 * مرشّحٌ سريع خاصّ بخطوط البتّ الواحد.
 *
 * عدّ الألوان لا معنى له هنا: البتّ الواحد يجعل كلّ بايتٍ نصفين اعتباطيّين،
 * فتظهر الكتلة كأنّها ستّة عشر لوناً وهي لونان. والوصف الصحيح لها كثافة
 * الحبر: صفحة حروفٍ بالبتّ الواحد يمتلئ منها جزءٌ يسير، لا نصفها كالشيفرة
 * والبيانات المضغوطة. وبهذا يظهر خطّ Yu-Gi-Oh! WCT 2004 الذي كان يسقط.
 */
function inkSparseBlocks(rom: Uint8Array, block: number): boolean[] {
  const bits = new Uint8Array(256);
  for (let i = 0; i < 256; i++) bits[i] = ((i >> 0) & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1) + ((i >> 4) & 1) + ((i >> 5) & 1) + ((i >> 6) & 1) + ((i >> 7) & 1);
  const count = Math.floor(rom.length / block);
  const out = new Array<boolean>(count).fill(false);
  for (let b = 0; b < count; b++) {
    const start = b * block;
    let ink = 0;
    let same = 0;
    const first = rom[start];
    for (let i = 0; i < block; i++) {
      const byte = rom[start + i];
      ink += bits[byte];
      if (byte === first) same++;
    }
    const density = ink / (block * 8);
    out[b] = density > 0.02 && density < 0.42 && same < block * 0.94;
  }
  return out;
}

/** سلاسل الكتل المتجاورة المقبولة. */
function blockRuns(mask: boolean[], block: number): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let from = -1;
  for (let b = 0; b <= mask.length; b++) {
    if (b < mask.length && mask[b]) {
      if (from < 0) from = b;
    } else if (from >= 0) {
      runs.push({ start: from * block, end: b * block });
      from = -1;
    }
  }
  return runs;
}


/** الوسيط، لأنّ حرفاً واحداً ممتلئاً لا ينبغي أن يجرّ الحكم. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * كم يشبه هذا الموضع خطّاً، بهذا التخطيط.
 *
 * الوصف كلّه بنيوي: لا يُسأل عن قيمة لون، بل عن أنّ الأشكال تشترك في
 * سطرٍ تقف عليه، وتترك أعلى الخليّة وأسفلها أفتح من وسطها، وتُبقي عمودها
 * الأخير فارغاً ليفصلها عمّا بعدها.
 */
function scoreRun(rom: Uint8Array, at: number, layout: GbaGlyphLayout, glyphs: number): GbaFontCandidate | null {
  const stride = glyphStride(layout);
  const { width, height } = layout;
  const rows = new Float64Array(height);
  const inks: number[] = [];
  const colours = new Set<number>();
  let blanks = 0;
  let rightMargin = 0;
  const firstInk: number[] = [];
  const shapes = new Set<string>();

  for (let g = 0; g < glyphs; g++) {
    const pixels = readGlyph(rom, at + g * stride, layout);
    let ink = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = pixels[y * width + x];
        colours.add(v);
        if (v !== 0) {
          ink++;
          rows[y]++;
        }
      }
    }
    if (ink === 0) {
      blanks++;
      continue;
    }
    inks.push(ink / (width * height));
    shapes.add(pixels.join(""));
    // أوّل عمودٍ فيه حبر: الخانة تُرصف من اليسار، لكنّ خطوطاً تترك هامشاً
    // يساريّاً ثابتاً (خطّ Yu-Gi-Oh! WCT 2004 يترك عمودين)، فلا يصحّ اشتراط
    // الحبر في العمود الأوّل بعينه، بل أن يبدأ الحرف في النصف الأيسر.
    let first = width;
    for (let x = 0; x < width && first === width; x++) {
      for (let y = 0; y < height; y++) if (pixels[y * width + x] !== 0) { first = x; break; }
    }
    firstInk.push(first);

    let empty = true;
    for (let y = 0; y < height; y++) if (pixels[y * width + width - 1] !== 0) empty = false;
    if (empty) rightMargin++;
  }

  const drawn = glyphs - blanks;
  const unique = shapes.size;
  if (drawn < glyphs * 0.5) return null;
  // الحروف يختلف بعضها عن بعض؛ والنمط المزخرف يتكرّر. وهذا وحده يُسقط
  // البلاطات المكرّرة التي كانت تتصدّر الترتيب وهي ليست خطّاً.
  if (unique / drawn < 0.75) return null;
  // ويبدأ حبر الحرف في النصف الأيسر من خانته، لأنّ الخانة تُرصف من اليسار
  // مهما كانت لغة الخطّ — ولو تركت هامشاً يساريّاً ثابتاً.
  if (median(firstInk) >= width * 0.5) return null;


  const inkMedian = median(inks);
  if (inkMedian < 0.06 || inkMedian > 0.6) return null;
  if (colours.size < 2 || colours.size > 6) return null;

  // سطر الكتابة: أعلى الخليّة وأسفلها أفتح من وسطها بوضوح.
  const peak = Math.max(...rows);
  if (peak === 0) return null;
  const top = rows[0] / peak;
  const bottom = rows[height - 1] / peak;
  if (top > 0.5 || bottom > 0.5) return null;
  const baselineRows = rows.filter((r) => r > peak * 0.6).length;
  if (baselineRows < 2 || baselineRows > height - 2) return null;

  const score =
    (1 - top) * 2 +
    (1 - bottom) * 2 +
    (rightMargin / Math.max(1, drawn)) * 2 +
    (unique / drawn) * 2 +
    (blanks > 0 && blanks < glyphs * 0.4 ? 1 : 0) +
    Math.min(glyphs / 64, 2);

  return {
    offset: at,
    layout,
    glyphs,
    score,
    detail: { colours: colours.size, inkMedian, baselineRows, blanks, unique },
  };
}

export interface GbaFontSearchOptions {
  /** كم خليّة متتابعة يجب أن تتوافر ليُقبل الموضع. */
  minGlyphs?: number;
  /** أقصى عدد ألوان يقبله المرشّح السريع. */
  maxColours?: number;
  /** كم مرشّحاً يُعاد. */
  limit?: number;
  layouts?: GbaGlyphLayout[];
  /** يفكّ الرسوم المضغوطة ويفحصها أيضاً. مُفعَّل. */
  searchCompressed?: boolean;
}

/**
 * يبحث في الروم كلّه ويعيد أفضل المواضع، مرتّبةً.
 *
 * المرور الأوّل يمسح الروم مرّة واحدة ويحدّد الكتل قليلة الألوان؛ ولا
 * يُقيَّم إلا ما وقع في سلسلةٍ منها، فيبقى العمل في حدود ما يحتمله متصفّح.
 */
export function findGbaFonts(rom: Uint8Array, options: GbaFontSearchOptions = {}): GbaFontCandidate[] {
  const minGlyphs = options.minGlyphs ?? 32;
  const maxColours = options.maxColours ?? 5;
  const layouts = options.layouts ?? GBA_GLYPH_LAYOUTS;
  const BLOCK = 64;

  const sparse = sparseBlocks(rom, BLOCK, maxColours);
  // سلاسل الكتل المتجاورة: الخطّ جدولٌ متّصل لا كتلة يتيمة.
  const runs = blockRuns(sparse, BLOCK);
  // ولخطوط البتّ الواحد مصفاةٌ أخرى، لأنّ عدّ الألوان يُسقطها ظلماً.
  const inkRuns = blockRuns(inkSparseBlocks(rom, BLOCK), BLOCK);

  const found: GbaFontCandidate[] = [];
  const seen = new Set<string>();
  const sweep = (run: { start: number; end: number }, layout: GbaGlyphLayout) => {
    const stride = glyphStride(layout);
    const reach = layout.interleaveTiles ? (glyphBytes(layout) / 2) * layout.interleaveTiles : 0;
    const fits = Math.floor((run.end - run.start - reach) / stride);
    if (fits < minGlyphs) return;
    // يُجرّب مبدأ السلسلة وما يليه بخطوة خليّة، فقد تبدأ قبل حدّ الكتلة.
    for (let shift = 0; shift < Math.min(4, fits); shift++) {
      const at = run.start + shift * stride;
      const glyphs = Math.min(Math.floor((run.end - at - reach) / stride), 128);
      if (glyphs < minGlyphs) break;
      const candidate = scoreRun(rom, at, layout, glyphs);
      if (candidate) {
        const key = `${at}-${layout.width}x${layout.height}x${layout.bpp}${layout.msbFirst ? "m" : ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push(candidate);
        }
        break;
      }
    }
  };

  for (const run of runs) for (const layout of layouts) sweep(run, layout);
  for (const run of inkRuns) for (const layout of layouts) if (layout.bpp === 1) sweep(run, layout);


  if (options.searchCompressed !== false) {
    // ألعابٌ تضغط رسومها، ومنها خطّها: لا يُقرأ منها شيء قبل الفكّ.
    for (const block of findGbaLz77Blocks(rom, minGlyphs * 16)) {
      const data = decompressGbaLz77(rom, block.at);
      if (!data) continue;
      for (const layout of layouts) {
        const stride = glyphStride(layout);
        const reach = layout.interleaveTiles ? (glyphBytes(layout) / 2) * layout.interleaveTiles : 0;
        const glyphs = Math.min(Math.floor((data.length - reach) / stride), 128);
        if (glyphs < minGlyphs) continue;
        const candidate = scoreRun(data, 0, layout, glyphs);
        if (candidate) {
          found.push({ ...candidate, compressedAt: block.at });
          break;
        }
      }
    }
  }

  found.sort((a, b) => b.score - a.score || b.glyphs - a.glyphs);
  return found.slice(0, options.limit ?? 20);
}

/** بكسلات معاينةٍ لمرشّح: ورقة حروفٍ بصفوفٍ وأعمدة. */
export function renderGbaFontCandidate(
  rom: Uint8Array,
  candidate: GbaFontCandidate,
  columns = 32
): { width: number; height: number; rgba: Uint8ClampedArray } {
  const { layout } = candidate;
  const stride = glyphStride(layout);
  // المضغوط يُفكّ عند الرسم، فلا تُحمل الكتل المفكوكة كلّها في الذاكرة.
  const source = candidate.compressedAt === undefined ? rom : decompressGbaLz77(rom, candidate.compressedAt);
  if (!source) throw new Error("تعذّر فكّ ضغط هذا المرشّح");
  const rows = Math.ceil(candidate.glyphs / columns);
  const width = columns * (layout.width + 1);
  const height = rows * (layout.height + 1);
  const rgba = new Uint8ClampedArray(width * height * 4);
  // خلفية داكنة، والألوان تدرّجٌ رماديّ حسب رقم اللون لا حسب معناه.
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 20;
    rgba[i * 4 + 1] = 20;
    rgba[i * 4 + 2] = 30;
    rgba[i * 4 + 3] = 255;
  }
  const levels = (1 << layout.bpp) - 1;
  for (let g = 0; g < candidate.glyphs; g++) {
    const pixels = readGlyph(source, candidate.offset + g * stride, layout);
    const gx = (g % columns) * (layout.width + 1);
    const gy = Math.floor(g / columns) * (layout.height + 1);
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        const v = pixels[y * layout.width + x];
        if (v === 0) continue;
        const shade = 120 + Math.round((135 * v) / levels);
        const at = ((gy + y) * width + gx + x) * 4;
        rgba[at] = shade;
        rgba[at + 1] = shade;
        rgba[at + 2] = shade;
      }
    }
  }
  return { width, height, rgba };
}
