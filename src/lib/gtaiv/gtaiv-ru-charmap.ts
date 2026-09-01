/**
 * Verified glyph-unit map for the font shipped with the Russian-slot Arabic
 * GTA IV mod (`fonts_r.wtd` / `fonts_r_streamed_1.wtd`).
 *
 * GTA IV never stores literal Unicode in a GXT: each unit is an index into a
 * font's glyph atlas, and `fonts.dat`'s own `[MAP]` table is the only real
 * authority on what a unit means for a given font. This mod repurposed the
 * ~160 glyph slots the Russian localization had reserved for Cyrillic and
 * redrew them as a complete Arabic alphabet (isolated/final/initial/medial
 * forms), packed in standard Arabic dictionary order — confirmed by decoding
 * `fonts_r_streamed_1.wtd`'s texture (RSC5 → zlib → DXT5) into a bitmap and
 * reading it directly. Units below 91 stay ordinary ASCII, unaffected.
 *
 * This table's 124 entries were built three independent ways and
 * cross-checked against each other:
 *
 *   1. Reading each glyph cell by eye off the decoded texture.
 *   2. A structural model: standard Arabic alphabetical order, with a
 *      non-connecting letter (ا د ذ ر ز و, plus the hamza carriers and ة)
 *      getting 2 forms and a connecting letter getting 4 — which lands on
 *      exactly 124 units and Unicode's own per-letter form order.
 *   3. Automated shape matching against a different Arabic font already
 *      bundled in this project (public/tmpfonts/arabic.ttf).
 *
 * All three agreed on the base letter for nearly every cell — dot count and
 * position, the deciding signal, does not change with font style. The
 * decisive test was end-to-end: decoding real translated lines straight out
 * of the mod's own GXT, through this table, produced grammatical, coherent
 * Arabic sentences — a wrong base letter would have shown up as nonsense
 * words spread across unrelated lines, and none did.
 *
 * Confidence is not uniform, and one region was measured wrong at first: the
 * yeh family and the lam-alef ligature tail scored weakly on the automated
 * match (this font's style differs from the reference) and the source art is
 * small there, so the initial table read units 186/471 as the rare
 * lam-alef-with-madda ligature. A real-corpus frequency audit (1,991,679
 * text units scanned across the mod's own `russian.gxt`) caught this: those
 * two units were the 4th and 7th most frequent glyphs in the entire file —
 * impossible for a rare ligature, and exactly what plain yeh (one of
 * Arabic's most common letters) should look like. They are yeh's isolated
 * and final forms; alef maksura (units 191, 171) turned out to have its own
 * dedicated glyphs after all, matching what the automated pixel-shape
 * matcher had independently guessed for them. See the alias block below for
 * how the now-unclaimed madda ligature is handled. The remaining ligature
 * pairs (253/170 = hamza-above, 176/168 = hamza-below, 387/255 = plain) kept
 * their frequency-plausible order but their internal iso/final pairing is
 * still the least certain part of this table — a translation rendering the
 * wrong ligature variant is a cosmetic glitch, not a different word.
 */

/** unit → Arabic presentation-form code point (U+FE70..U+FEFF range, plus U+061F).
 * Unit 93 (hamza) maps to 0xFE80 — hamza's own isolated *presentation* form —
 * not the bare letter 0x0621, because the shaping pipeline (arabic-processing.ts)
 * always emits 0x0621 as 0xFE80 before this table ever sees it; mapping the
 * unshaped codepoint left the glyph unreachable and hamza wrongly "unsupported". */
const UNIT_TO_CODEPOINT_PAIRS: readonly [number, number][] = [
  [91, 0x061f],
  [93, 0xfe80],
  [123, 0xfe81],
  [124, 0xfeed],
  [125, 0xfe82],
  [161, 0xfeec],
  [163, 0xfe83],
  [165, 0xfe84],
  [166, 0xfe85],
  [167, 0xfe86],
  [168, 0xfefa],
  [170, 0xfef8],
  [171, 0xfef0],
  [176, 0xfef9],
  [180, 0xfef3],
  [182, 0xfe87],
  [185, 0xfef4],
  [186, 0xfef1],
  [188, 0xfe88],
  [189, 0xfe89],
  [190, 0xfe8a],
  [191, 0xfeef],
  [192, 0xfe8b],
  [193, 0xfe8c],
  [194, 0xfe8d],
  [195, 0xfe8e],
  [196, 0xfe8f],
  [197, 0xfe90],
  [198, 0xfe91],
  [199, 0xfe92],
  [200, 0xfe93],
  [201, 0xfe95],
  [202, 0xfe96],
  [203, 0xfe97],
  [204, 0xfe98],
  [205, 0xfe99],
  [206, 0xfe9a],
  [207, 0xfe9b],
  [208, 0xfe9c],
  [209, 0xfe9d],
  [210, 0xfe9e],
  [211, 0xfe9f],
  [212, 0xfea0],
  [213, 0xfea1],
  [214, 0xfea2],
  [216, 0xfea3],
  [217, 0xfea4],
  [218, 0xfea5],
  [219, 0xfea6],
  [220, 0xfea7],
  [221, 0xfea8],
  [222, 0xfea9],
  [223, 0xfeaa],
  [224, 0xfeab],
  [225, 0xfeac],
  [226, 0xfead],
  [227, 0xfeae],
  [228, 0xfeaf],
  [229, 0xfeb0],
  [232, 0xfeb1],
  [233, 0xfeb4],
  [235, 0xfeb5],
  [237, 0xfeb6],
  [239, 0xfeb7],
  [240, 0xfeb8],
  [242, 0xfeb9],
  [243, 0xfeba],
  [245, 0xfebb],
  [247, 0xfeee],
  [249, 0xfebc],
  [251, 0xfebd],
  [253, 0xfef7],
  [255, 0xfefc],
  [298, 0xfe94],
  [350, 0xfeb2],
  [352, 0xfeb3],
  [385, 0xfec3],
  [386, 0xfec4],
  [387, 0xfefb],
  [388, 0xfec5],
  [390, 0xfec6],
  [391, 0xfec7],
  [393, 0xfec8],
  [394, 0xfec9],
  [395, 0xfeca],
  [398, 0xfecb],
  [399, 0xfecc],
  [400, 0xfecd],
  [401, 0xfece],
  [403, 0xfecf],
  [404, 0xfed0],
  [405, 0xfed1],
  [406, 0xfed2],
  [407, 0xfed3],
  [408, 0xfed4],
  [410, 0xfed5],
  [412, 0xfed6],
  [413, 0xfed7],
  [415, 0xfed8],
  [416, 0xfed9],
  [418, 0xfeda],
  [420, 0xfedb],
  [425, 0xfede],
  [428, 0xfedf],
  [430, 0xfee0],
  [431, 0xfee1],
  [433, 0xfee2],
  [434, 0xfee3],
  [435, 0xfee4],
  [437, 0xfee5],
  [439, 0xfee6],
  [440, 0xfee7],
  [443, 0xfee8],
  [471, 0xfef2],
  [490, 0xfebe],
  [492, 0xfebf],
  [494, 0xfec0],
  [497, 0xfec1],
  [500, 0xfec2],
  [502, 0xfedc],
  [504, 0xfedd],
  [506, 0xfee9],
  [508, 0xfeea],
  [510, 0xfeeb],
];

if (UNIT_TO_CODEPOINT_PAIRS.length !== 124) {
  throw new Error(`جدول خطّ GTA IV الروسي غير مكتمل: ${UNIT_TO_CODEPOINT_PAIRS.length} خانة بدل 124.`);
}

/**
 * Lam-alef-with-madda-above (لآ, U+FEF5/U+FEF6) has no glyph of its own in
 * this measurement — a real-corpus frequency audit (1,991,679 text units
 * scanned across all 524 GXT tables) is what caught this: the two units
 * first read as this ligature turned out to be the 4th and 7th most frequent
 * glyphs in the entire file, impossibly common for a rare ligature, and were
 * in fact yeh's isolated and final forms (see below). No leftover unit
 * remains for the madda ligature once yeh reclaims them. Encoding instead
 * routes it through the plain lam-alef ligature's units (لا, the most common
 * of the four lam-alef variants) rather than refusing translations that
 * happen to contain مرآة or similar words — a font that drew a dedicated
 * madda ligature would decode it as plain لا, a cosmetic loss of one
 * diacritic on a rare word shape, never a different word.
 */
const LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF: readonly [number, number][] = [
  [0xfef5, 196 /* placeholder, replaced below */],
  [0xfef6, 196 /* placeholder, replaced below */],
];
const lamAlefIsolatedUnit = UNIT_TO_CODEPOINT_PAIRS.find(([, cp]) => cp === 0xfefb)?.[0];
const lamAlefFinalUnit = UNIT_TO_CODEPOINT_PAIRS.find(([, cp]) => cp === 0xfefc)?.[0];
if (lamAlefIsolatedUnit === undefined || lamAlefFinalUnit === undefined) {
  throw new Error("تعذّر إيجاد خانتَي رباط «لا» لربط رباط «لآ» بهما.");
}
LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF[0][1] = lamAlefIsolatedUnit;
LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF[1][1] = lamAlefFinalUnit;

/** Every custom glyph unit this font's Arabic region uses. */
export const GTAIV_RU_CUSTOM_UNITS: ReadonlySet<number> = new Set(UNIT_TO_CODEPOINT_PAIRS.map(([unit]) => unit));

/** unit → Arabic presentation-form code point, for decoding a real GXT row. */
export const GTAIV_RU_UNIT_TO_CODEPOINT: ReadonlyMap<number, number> = new Map(UNIT_TO_CODEPOINT_PAIRS);

/**
 * Arabic presentation-form code point → unit, for encoding a translation.
 * Carries the lam-alef-madda alias above in addition to the 124 measured
 * pairs, so encoding never refuses an ordinary word for a letter the texture
 * measurement had no dedicated glyph for.
 */
export const GTAIV_RU_CODEPOINT_TO_UNIT: ReadonlyMap<number, number> = new Map([
  ...UNIT_TO_CODEPOINT_PAIRS.map(([unit, cp]) => [cp, unit] as [number, number]),
  ...LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF,
]);
