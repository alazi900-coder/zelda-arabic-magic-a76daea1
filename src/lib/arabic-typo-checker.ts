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
  category: 'hamza' | 'taa' | 'alef' | 'common' | 'duplicate' | 'spacing' | 'letter' | 'yaa' | 'waw' | 'haa';
}

// ========== Common misspelling pairs ==========

const COMMON_TYPOS: [RegExp, string, string, 'hamza' | 'taa' | 'alef' | 'common' | 'duplicate' | 'spacing' | 'letter' | 'yaa' | 'waw' | 'haa'][] = [
  // --- تاء مربوطة / مفتوحة ---
  [/\bالمعركت\b/g, 'المعركة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالقوت\b/g, 'القوة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالمهمت\b/g, 'المهمة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالقدرت\b/g, 'القدرة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالحركت\b/g, 'الحركة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالطاقت\b/g, 'الطاقة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالمنطقت\b/g, 'المنطقة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالسرعت\b/g, 'السرعة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالشجاعت\b/g, 'الشجاعة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالحمايت\b/g, 'الحماية', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالرحلت\b/g, 'الرحلة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالمغامرت\b/g, 'المغامرة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالقريت\b/g, 'القرية', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالمدينت\b/g, 'المدينة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالخطيرت\b/g, 'الخطيرة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالكبيرت\b/g, 'الكبيرة', 'تاء مفتوحة بدل مربوطة', 'taa'],
  [/\bالصغيرت\b/g, 'الصغيرة', 'تاء مفتوحة بدل مربوطة', 'taa'],

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
  [/\bانتم\b/g, 'أنتم', 'همزة قطع ناقصة', 'hamza'],
  [/\bامام\b/g, 'أمام', 'همزة قطع ناقصة', 'hamza'],
  [/\bاكثر\b/g, 'أكثر', 'همزة قطع ناقصة', 'hamza'],
  [/\bاقل\b/g, 'أقل', 'همزة قطع ناقصة', 'hamza'],
  [/\bاخر\b/g, 'آخر', 'ألف مدة ناقصة', 'hamza'],
  [/\bاخرى\b/g, 'أخرى', 'همزة قطع ناقصة', 'hamza'],
  [/\bانها\b/g, 'إنها', 'همزة كسر ناقصة', 'hamza'],
  [/\bانه\b/g, 'إنه', 'همزة كسر ناقصة', 'hamza'],
  [/\bاول\b/g, 'أول', 'همزة قطع ناقصة', 'hamza'],
  [/\bاحد\b/g, 'أحد', 'همزة قطع ناقصة', 'hamza'],
  [/\bاصبح\b/g, 'أصبح', 'همزة قطع ناقصة', 'hamza'],
  [/\bارسل\b/g, 'أرسل', 'همزة قطع ناقصة', 'hamza'],
  [/\bاستطيع\b/g, 'أستطيع', 'همزة قطع ناقصة', 'hamza'],
  [/\bاريد\b/g, 'أريد', 'همزة قطع ناقصة', 'hamza'],
  [/\bاعتقد\b/g, 'أعتقد', 'همزة قطع ناقصة', 'hamza'],
  [/\bاعرف\b/g, 'أعرف', 'همزة قطع ناقصة', 'hamza'],
  [/\bاسف\b/g, 'آسف', 'ألف مدة ناقصة', 'hamza'],
  [/\bامل\b/g, 'أمل', 'همزة قطع ناقصة', 'hamza'],
  [/\bاخي\b/g, 'أخي', 'همزة قطع ناقصة', 'hamza'],
  [/\bابي\b/g, 'أبي', 'همزة قطع ناقصة', 'hamza'],
  [/\bامي\b/g, 'أمي', 'همزة قطع ناقصة', 'hamza'],
  [/\bاين\b/g, 'أين', 'همزة قطع ناقصة', 'hamza'],
  [/\bاذن\b/g, 'إذن', 'همزة كسر ناقصة', 'hamza'],
  [/\bاثناء\b/g, 'أثناء', 'همزة قطع ناقصة', 'hamza'],
  [/\bاصلا\b/g, 'أصلاً', 'همزة قطع ناقصة', 'hamza'],
  [/\bاخيرا\b/g, 'أخيراً', 'همزة قطع ناقصة', 'hamza'],
  [/\bاحيانا\b/g, 'أحياناً', 'همزة قطع ناقصة', 'hamza'],

  // --- ألف مقصورة / ممدودة (ي بدل ى) ---
  [/\bعلي\b/g, 'على', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bالي\b/g, 'إلى', 'ألف مقصورة بدل ياء + همزة', 'alef'],
  [/\bحتي\b/g, 'حتى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bمتي\b/g, 'متى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bلدي\b/g, 'لدى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bسوي\b/g, 'سوى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bمستوي\b/g, 'مستوى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bاحدي\b/g, 'إحدى', 'ألف مقصورة بدل ياء + همزة', 'alef'],
  [/\bالاخري\b/g, 'الأخرى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bالكبري\b/g, 'الكبرى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bالصغري\b/g, 'الصغرى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bالقوي\b/g, 'الأقوى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bمعني\b/g, 'معنى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bمبني\b/g, 'مبنى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bمستشفي\b/g, 'مستشفى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bاعلي\b/g, 'أعلى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bادني\b/g, 'أدنى', 'ألف مقصورة بدل ياء', 'alef'],
  [/\bاقصي\b/g, 'أقصى', 'ألف مقصورة بدل ياء', 'alef'],

  // --- ياء (أخطاء الياء) ---
  [/\bالذى\b/g, 'الذي', 'ى بدل ي في اسم موصول', 'yaa'],
  [/\bالتى\b/g, 'التي', 'ى بدل ي في اسم موصول', 'yaa'],
  [/\bاللذى\b/g, 'اللذي', 'ى بدل ي', 'yaa'],
  [/\bفى\b/g, 'في', 'ألف مقصورة بدل ياء في حرف جر', 'yaa'],
  [/\bهى\b/g, 'هي', 'ألف مقصورة بدل ياء في ضمير', 'yaa'],
  [/\bكى\b/g, 'كي', 'ألف مقصورة بدل ياء', 'yaa'],
  [/\bشى\b/g, 'شيء', 'ألف مقصورة بدل ياء + همزة ناقصة', 'yaa'],
  [/\bشئ\b/g, 'شيء', 'همزة على نبرة بدل ياء', 'yaa'],
  [/\bمابين\b/g, 'ما بين', 'مسافة ناقصة', 'yaa'],
  [/\bليالى\b/g, 'ليالي', 'ألف مقصورة بدل ياء', 'yaa'],
  [/\bكراسى\b/g, 'كراسي', 'ألف مقصورة بدل ياء', 'yaa'],
  [/\bمعانى\b/g, 'معاني', 'ألف مقصورة بدل ياء', 'yaa'],
  [/\bأراضى\b/g, 'أراضي', 'ألف مقصورة بدل ياء', 'yaa'],
  [/\bثوانى\b/g, 'ثواني', 'ألف مقصورة بدل ياء', 'yaa'],

  // --- واو (أخطاء الواو) ---
  [/\bأولائك\b/g, 'أولئك', 'ألف زائدة', 'waw'],
  [/\bداءما\b/g, 'دائماً', 'همزة في موضع خاطئ', 'waw'],
  [/\bمسئول\b/g, 'مسؤول', 'همزة على نبرة بدل واو', 'waw'],
  [/\bمسأول\b/g, 'مسؤول', 'همزة على ألف بدل واو', 'waw'],
  [/\bشئون\b/g, 'شؤون', 'همزة على نبرة بدل واو', 'waw'],
  [/\bرأوس\b/g, 'رؤوس', 'همزة على ألف بدل واو', 'waw'],
  [/\bفأوس\b/g, 'فؤوس', 'همزة على ألف بدل واو', 'waw'],
  [/\bسأول\b/g, 'سؤال', 'خطأ في كتابة سؤال', 'waw'],
  [/\bتأوثير\b/g, 'تأثير', 'واو زائدة', 'waw'],
  [/\bالضوء\b/g, 'الضوء', 'صحيح', 'waw'], // skip
  [/\bامور\b/g, 'أمور', 'همزة قطع ناقصة', 'waw'],
  [/\bاوقات\b/g, 'أوقات', 'همزة قطع ناقصة', 'waw'],

  // --- هاء / تاء مربوطة (أخطاء الهاء) ---
  [/\bهذة\b/g, 'هذه', 'تاء مربوطة بدل هاء', 'haa'],
  [/\bفية\b/g, 'فيه', 'تاء مربوطة بدل هاء', 'haa'],
  [/\bمنة\b/g, 'منه', 'تاء مربوطة بدل هاء', 'haa'],
  [/\bعنة\b/g, 'عنه', 'تاء مربوطة بدل هاء', 'haa'],
  [/\bلة\b/g, 'له', 'تاء مربوطة بدل هاء', 'haa'],
  [/\bبة\b/g, 'به', 'تاء مربوطة بدل هاء', 'haa'],
  [/\bالة\b/g, 'آلة', 'همزة + تاء مربوطة بدل هاء', 'haa'],
  [/\bاللة\b/g, 'الله', 'تاء مربوطة بدل هاء في لفظ الجلالة', 'haa'],
  [/\bالالة\b/g, 'الآلة', 'همزة مدة ناقصة', 'haa'],
  [/\bوجة\b/g, 'وجه', 'تاء مربوطة بدل هاء', 'haa'],
  [/\bنفسة\b/g, 'نفسه', 'تاء مربوطة بدل هاء (ضمير)', 'haa'],
  [/\bيدة\b/g, 'يده', 'تاء مربوطة بدل هاء (ضمير)', 'haa'],
  [/\bقلبة\b/g, 'قلبه', 'تاء مربوطة بدل هاء (ضمير)', 'haa'],
  [/\bعقلة\b/g, 'عقله', 'تاء مربوطة بدل هاء (ضمير)', 'haa'],
  [/\bجسمة\b/g, 'جسمه', 'تاء مربوطة بدل هاء (ضمير)', 'haa'],
  [/\bسيفة\b/g, 'سيفه', 'تاء مربوطة بدل هاء (ضمير)', 'haa'],
  [/\bدرعة\b/g, 'درعه', 'تاء مربوطة بدل هاء (ضمير)', 'haa'],
  [/\bاسمة\b/g, 'اسمه', 'تاء مربوطة بدل هاء (ضمير)', 'haa'],

  // --- كلمات شائعة ---
  [/\bهاذا\b/g, 'هذا', 'خطأ إملائي شائع', 'common'],
  [/\bهاذه\b/g, 'هذه', 'خطأ إملائي شائع', 'common'],
  [/\bلاكن\b/g, 'لكن', 'خطأ إملائي شائع', 'common'],
  [/\bلاكنه\b/g, 'لكنه', 'خطأ إملائي شائع', 'common'],
  [/\bذالك\b/g, 'ذلك', 'خطأ إملائي شائع', 'common'],
  [/\bهاؤلاء\b/g, 'هؤلاء', 'خطأ إملائي شائع', 'common'],
  [/\bبإمكانية\b/g, 'بإمكان', 'خطأ شائع', 'common'],
  [/\bانشاء الله\b/g, 'إن شاء الله', 'خطأ شائع (كلمتان)', 'common'],
  [/\bانشاءالله\b/g, 'إن شاء الله', 'خطأ شائع', 'common'],
  [/\bعندما\b/g, 'عندما', 'صحيح', 'common'], // skip
  [/\bلماذا\b/g, 'لماذا', 'صحيح', 'common'], // skip
  [/\bبالتاكيد\b/g, 'بالتأكيد', 'همزة ناقصة', 'common'],
  [/\bتاثير\b/g, 'تأثير', 'همزة ناقصة', 'common'],
  [/\bتاخير\b/g, 'تأخير', 'همزة ناقصة', 'common'],
  [/\bمائة\b/g, 'مئة', 'ألف زائدة (الرسم الحديث)', 'common'],
  [/\bمسائل\b/g, 'مسائل', 'صحيح', 'common'], // skip
  [/\bجائزة\b/g, 'جائزة', 'صحيح', 'common'], // skip
  [/\bضروري\b/g, 'ضروري', 'صحيح', 'common'], // skip

  // --- حروف ناقصة/زائدة ---
  [/\bالاسلحة\b/g, 'الأسلحة', 'همزة ناقصة', 'letter'],
  [/\bالهجو م\b/g, 'الهجوم', 'مسافة زائدة في كلمة', 'letter'],
  [/\bالاعداء\b/g, 'الأعداء', 'همزة ناقصة', 'letter'],
  [/\bالاسلام\b/g, 'الإسلام', 'همزة كسر ناقصة', 'letter'],
  [/\bالامر\b/g, 'الأمر', 'همزة قطع ناقصة', 'letter'],
  [/\bالان\b/g, 'الآن', 'ألف مدة ناقصة', 'letter'],
  [/\bالاخرين\b/g, 'الآخرين', 'ألف مدة ناقصة', 'letter'],
  [/\bالامان\b/g, 'الأمان', 'همزة قطع ناقصة', 'letter'],
  [/\bالابطال\b/g, 'الأبطال', 'همزة قطع ناقصة', 'letter'],
  [/\bالامل\b/g, 'الأمل', 'همزة قطع ناقصة', 'letter'],
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
