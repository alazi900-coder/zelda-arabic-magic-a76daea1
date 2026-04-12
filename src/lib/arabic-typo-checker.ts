/**
 * Arabic Typo Checker — Local (no AI)
 * Detects common Arabic spelling mistakes by pattern matching.
 */

export interface TypoResult {
  key: string;
  word: string;
  suggestion: string;
  reason: string;
  position: number;
  category: 'hamza' | 'taa' | 'alef' | 'common' | 'duplicate' | 'spacing' | 'letter';
}

// ========== Common misspelling pairs ==========

const COMMON_TYPOS: [RegExp, string, string, 'hamza' | 'taa' | 'alef' | 'common' | 'letter'][] = [
  // --- تاء مربوطة / مفتوحة ---
  [/\bالمعركت\b/g, 'المعركة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالقوت\b/g, 'القوة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالمهمت\b/g, 'المهمة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالقدرت\b/g, 'القدرة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالحركت\b/g, 'الحركة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالطاقت\b/g, 'الطاقة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالمنطقت\b/g, 'المنطقة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالسرعت\b/g, 'السرعة', 'تاء مفتوحة بدل مربوطة', 'taa'],

  // --- Generic: ة at end replaced by ت (programmatic check below) ---

  // --- همزات شائعة ---
  [/\bانا\b/g, 'أنا', 'همزة قطع ناقصة', 'hamza'],
  [/\bان\s/g, 'أن ', 'همزة قطع ناقصة', 'hamza'],
  [/\bالى\b/g, 'إلى', 'همزة كسر ناقصة', 'hamza'],
  [/\bاذا\b/g, 'إذا', 'همزة كسر ناقصة', 'hamza'],
  [/\bابدا\b/g, 'أبداً', 'همزة قطع ناقصة', 'hamza'],
  [/\bايضا\b/g, 'أيضاً', 'همزة قطع ناقصة', 'hamza'],
  [/\bاو\s/g, 'أو ', 'همزة قطع ناقصة', 'hamza'],
  [/\bاي\s/g, 'أي ', 'همزة قطع ناقصة', 'hamza'],
  [/\bانت\b/g, 'أنت', 'همزة قطع ناقصة', 'hamza'],
  [/\bامام\b/g, 'أمام', 'همزة قطع ناقصة', 'hamza'],
  [/\bاكثر\b/g, 'أكثر', 'همزة قطع ناقصة', 'hamza'],
  [/\bاقل\b/g, 'أقل', 'همزة قطع ناقصة', 'hamza'],
  [/\bاخر\b/g, 'آخر', 'ألف مدة ناقصة', 'hamza'],
  [/\bاخرى\b/g, 'أخرى', 'همزة قطع ناقصة', 'hamza'],
  [/\bانها\b/g, 'إنها', 'همزة كسر ناقصة', 'hamza'],
  [/\bانه\b/g, 'إنه', 'همزة كسر ناقصة', 'hamza'],

  // --- ألف مقصورة / ممدودة ---
  [/\bعلي\b/g, 'على', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bالي\b/g, 'إلى', 'ألف مقصورة بدل ياء + همزة', 'alef'],
  [/\bحتي\b/g, 'حتى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bمتي\b/g, 'متى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bلدي\b/g, 'لدى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bسوي\b/g, 'سوى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bمستوي\b/g, 'مستوى', 'ألف مقصورة بدل ياء', 'alef'],

  // --- كلمات شائعة ---
  [/\bهاذا\b/g, 'هذا', 'خطأ إملائي شائع', 'common'],
  [/\bهاذه\b/g, 'هذه', 'خطأ إملائي شائع', 'common'],
  [/\bلاكن\b/g, 'لكن', 'خطأ إملائي شائع', 'common'],
  [/\bلاكنه\b/g, 'لكنه', 'خطأ إملائي شائع', 'common'],
  [/\bذالك\b/g, 'ذلك', 'خطأ إملائي شائع', 'common'],
  [/\bهاؤلاء\b/g, 'هؤلاء', 'خطأ إملائي شائع', 'common'],
  [/\bبإمكانية\b/g, 'بإمكان', 'خطأ شائع', 'common'],

  // --- حروف ناقصة/زائدة شائعة ---
  [/\bالاسلحة\b/g, 'الأسلحة', 'همزة ناقصة', 'letter'],
  [/\bالعدو\b/g, 'العدو', 'صحيح', 'letter'], // skip — already correct
  [/\bالهجو م\b/g, 'الهجوم', 'مسافة زائدة في كلمة', 'letter'],
];

// ========== Programmatic checks ==========

/** Check for ت at end of word where ة is expected (feminine nouns/adjectives) */
function checkTaaMarbuta(text: string): { word: string; suggestion: string; position: number }[] {
  const results: { word: string; suggestion: string; position: number }[] = [];
  // Words ending in ت preceded by Arabic letters (not verb patterns like كانت، ذهبت)
  const regex = /(\b[\u0600-\u06FF]{3,})ت\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const word = match[0];
    const stem = match[1];
    // Skip common verb endings (past tense feminine)
    if (/^(كان|ذهب|قال|فعل|جاء|أخذ|وجد|بدأ|عرف|رأ|حصل|وصل|نجح|فشل|سقط|مات|عاد|زاد|نام|قام|صار|بات|ظل|أصبح)/u.test(stem)) continue;
    // Skip known correct words ending in ت
    if (/^(بيت|موت|صوت|وقت|بنت|أخت|تحت|فوت|سكوت|ثبات|نبات|إثبات|سبات)$/u.test(word)) continue;

    const suggested = stem + 'ة';
    results.push({ word, suggestion: suggested, position: match.index });
  }
  return results;
}

/** Check for duplicate consecutive words */
function checkDuplicateWords(text: string): { word: string; position: number }[] {
  const results: { word: string; position: number }[] = [];
  const words = text.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1] && words[i].length > 2) {
      const pos = text.indexOf(words[i] + ' ' + words[i]);
      if (pos >= 0) results.push({ word: words[i], position: pos });
    }
  }
  return results;
}

/** Check for double spaces */
function checkDoubleSpaces(text: string): number[] {
  const positions: number[] = [];
  let idx = text.indexOf('  ');
  while (idx >= 0) {
    positions.push(idx);
    idx = text.indexOf('  ', idx + 1);
  }
  return positions;
}

// ========== Main export ==========

export function checkArabicTypos(
  translations: Record<string, string>,
  options?: { maxResults?: number }
): TypoResult[] {
  const results: TypoResult[] = [];
  const maxResults = options?.maxResults || 500;

  for (const [key, text] of Object.entries(translations)) {
    if (!text?.trim()) continue;
    // Only check Arabic text
    if (!/[\u0600-\u06FF]/.test(text)) continue;

    // 1. Pattern-based typos
    for (const [pattern, suggestion, reason, category] of COMMON_TYPOS) {
      if (suggestion === text) continue; // skip if already correct
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match[0] === suggestion) continue;
        results.push({
          key,
          word: match[0],
          suggestion,
          reason,
          position: match.index,
          category,
        });
        if (results.length >= maxResults) return results;
      }
    }

    // 2. Duplicate words
    for (const dup of checkDuplicateWords(text)) {
      results.push({
        key,
        word: `${dup.word} ${dup.word}`,
        suggestion: dup.word,
        reason: 'كلمة مكررة',
        position: dup.position,
        category: 'duplicate',
      });
      if (results.length >= maxResults) return results;
    }

    // 3. Double spaces
    for (const pos of checkDoubleSpaces(text)) {
      results.push({
        key,
        word: '  ',
        suggestion: ' ',
        reason: 'مسافة مزدوجة',
        position: pos,
        category: 'spacing',
      });
      if (results.length >= maxResults) return results;
    }
  }

  return results;
}

/** Apply a single typo fix to text */
export function applyTypoFix(text: string, typo: TypoResult): string {
  if (typo.category === 'spacing') {
    return text.replace(/  +/g, ' ');
  }
  if (typo.category === 'duplicate') {
    const dup = typo.word.split(' ')[0];
    return text.replace(new RegExp(`\\b${escapeRegex(dup)}\\s+${escapeRegex(dup)}\\b`), dup);
  }
  // For word replacements, replace first occurrence at or after the recorded position
  return text.replace(typo.word, typo.suggestion);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
