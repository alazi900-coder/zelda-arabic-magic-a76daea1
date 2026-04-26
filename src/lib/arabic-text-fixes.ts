/**
 * Arabic text fix utilities:
 * 1. Taa Marbuta vs Haa (ة vs ه)
 * 2. Yaa vs Alef Maqsura (ي vs ى)
 * 3. Repeated consecutive words
 * 4. AI translation artifacts cleanup
 */

// === Tag protection ===
const TAG_PATTERN = /[\uE000-\uE0FF]+|\[\s*\w+\s*:[^\]]*?\s*\]|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}|[\uFFF9-\uFFFC]+/g;

function shieldTags(text: string): { shielded: string; tags: string[] } {
  const tags: string[] = [];
  const shielded = text.replace(TAG_PATTERN, (m) => { tags.push(m); return `\uE800${tags.length - 1}\uE801`; });
  return { shielded, tags };
}

function unshieldTags(text: string, tags: string[]): string {
  return text.replace(/\uE800(\d+)\uE801/g, (match, i) => {
    const idx = parseInt(i);
    return (idx >= 0 && idx < tags.length) ? tags[idx] : match;
  });
}

// Arabic char class (no word boundary — \b doesn't work with Arabic in JS)
const AR = '[\u0600-\u064A\u066E-\u06FF\u0671-\u06D3]';

// ============================================================
// 1. Taa Marbuta (ة) vs Haa (ه) fix
// ============================================================

const TAA_MARBUTA_WORDS = new Set([
  // === كلمات عامة شائعة ===
  'لعبة', 'مرة', 'قوة', 'مهمة', 'منطقة', 'قطعة', 'شخصية', 'قصة', 'معركة', 'مغامرة',
  'رحلة', 'جزيرة', 'قرية', 'مدينة', 'قلعة', 'غرفة', 'ساحة', 'طريقة', 'حالة', 'نتيجة',
  'مكافأة', 'خريطة', 'وصفة', 'قائمة', 'رسالة', 'مشكلة', 'فكرة', 'ذاكرة', 'صورة', 'نسخة',
  'حركة', 'ضربة', 'هجمة', 'دورة', 'جولة', 'محطة', 'نقطة', 'خطوة', 'كلمة', 'جملة',
  'قدرة', 'مهارة', 'سرعة', 'قفزة', 'لحظة', 'فترة', 'مرحلة', 'بداية', 'نهاية', 'عودة',
  'أداة', 'تجربة', 'ميزة', 'عملية', 'حماية', 'طاقة', 'شجرة', 'صخرة', 'بحيرة', 'كهفة',
  'مساحة', 'مسافة', 'سلسلة', 'حلقة', 'وحدة', 'مجموعة', 'درجة', 'مرتبة', 'رتبة',
  'عائلة', 'ذكرى', 'ثروة', 'جائزة', 'شارة', 'علامة', 'إشارة', 'خزانة', 'حقيبة', 'زجاجة',
  'بوابة', 'نافذة', 'شاشة', 'واجهة', 'لوحة', 'خلفية', 'أمامية', 'جانبية', 'سفلية', 'علوية',
  'ترجمة', 'لغة', 'كتابة', 'قراءة', 'محادثة', 'عبارة', 'حوارية',
  // === مصطلحات المشروع (XC3 glossary) ===
  'مستعمرة', 'قاعدة', 'غابة', 'حفرة', 'ساعة', 'أسطوانة', 'قناة', 'شريحة',
  'فرقة', 'مسيرة', 'يخنة', 'فطيرة', 'وصفة', 'وليمة', 'مأدبة',
  'جوهرة', 'تميمة', 'صدفة', 'أحفورة', 'عملة', 'قافلة',
  'وضعية', 'خانة', 'صناعة', 'زيادة', 'مقاومة', 'كراهية',
  'بعثة', 'خطة', 'مباراة', 'لوحة', 'فطيرة',
  'غريزة', 'براعة', 'رشاقة', 'دقة', 'مساعدة',
  'استقلالية', 'أزمة', 'مراسم', 'حراسة', 'طليعة',
  'ليفنيسترة', 'شعبة', 'فرصة', 'ثغرة', 'خدعة', 'حيلة',
  'تجارة', 'مكتبة', 'مدرسة', 'صفحة', 'محاولة', 'خسارة',
  'سيطرة', 'إدارة', 'قيادة', 'أسطورة', 'حضارة', 'إرادة',
  'حكمة', 'شجاعة', 'قسوة', 'رحمة', 'عزيمة', 'هيبة',
  'نخبة', 'فئة', 'طبقة', 'بيئة', 'طبيعة', 'حياة',
  'سلطة', 'مملكة', 'إمبراطورية', 'أميرة', 'ملكة',
  'حادثة', 'كارثة', 'مجزرة', 'مذبحة', 'خيانة', 'مؤامرة',
  'ذخيرة', 'عربة', 'سفينة', 'طائرة', 'مركبة',
  'وظيفة', 'مناسبة', 'تكلفة', 'فائدة', 'ميزانية',
  'محاضرة', 'مسابقة', 'مكتبة', 'ندوة', 'ورشة',
  'حصة', 'جرعة', 'روحة', 'ضريبة', 'غنيمة',
]);

export function fixTaaMarbutaHaa(text: string): { fixed: string; changes: number } {
  const { shielded, tags } = shieldTags(text);
  let changes = 0;
  
  // Split into words, check each word ending with ه
  const words = shielded.split(/(\s+|[^\u0600-\u06FF\uE800\uE801\d]+)/);
  const fixedParts = words.map(word => {
    if (word.endsWith('ه') && word.length >= 2) {
      const withTaa = word.slice(0, -1) + 'ة';
      if (TAA_MARBUTA_WORDS.has(withTaa)) {
        changes++;
        return withTaa;
      }
    }
    return word;
  });
  
  return { fixed: unshieldTags(fixedParts.join(''), tags), changes };
}

// ============================================================
// 2. Yaa (ي) vs Alef Maqsura (ى) fix
// ============================================================

const ALEF_MAQSURA_WORDS = new Set([
  // === حروف وأدوات ===
  'على', 'إلى', 'حتى', 'متى', 'أنى', 'لدى', 'سوى', 'مدى', 'هدى', 'ندى',
  // === أسماء تفضيل ===
  'أدنى', 'أعلى', 'أقصى', 'أدفى', 'أولى', 'كبرى', 'صغرى', 'إحدى', 'أقوى', 'أغنى',
  // === مصادر ومعانٍ ===
  'رؤى', 'قرى', 'ذكرى', 'أخرى', 'منتهى', 'مستوى', 'مغزى', 'مسمّى', 'مقتنى',
  'مستشفى', 'ملتقى', 'منتدى', 'مأوى', 'مبنى', 'معنى', 'مجرى', 'مرمى', 'ملهى', 'منحنى',
  // === أسماء أعلام ===
  'موسى', 'عيسى', 'يحيى', 'مصطفى', 'مرتضى',
  // === مصطلحات المشروع (XC3 glossary) ===
  'العليا', 'العظمى', 'الكبرى', 'الأقوى', 'الأعلى',
  'فتوى', 'شورى', 'بلوى', 'دعوى', 'شكوى', 'جدوى', 'تقوى',
  'مرعى', 'ملجأ', 'مسعى', 'مرسى', 'منعى', 'مبكى',
]);

export function fixYaaAlefMaqsura(text: string): { fixed: string; changes: number } {
  const { shielded, tags } = shieldTags(text);
  let changes = 0;

  // Use lookaround so the non-Arabic separator chars are NOT consumed —
  // otherwise `g` would swallow the trailing space, leaving the next word
  // with no preceding non-Arabic anchor and never being matched.
  const wordRe = new RegExp(`(?<![\\u0600-\\u06FF])(${AR}+)(?![\\u0600-\\u06FF])`, 'g');
  const fixed = shielded.replace(wordRe, (word) => {
    const lastChar = word[word.length - 1];
    if (lastChar !== 'ي' && lastChar !== 'ى') return word;

    const stem = word.slice(0, -1);

    // ي that should be ى
    if (lastChar === 'ي' && ALEF_MAQSURA_WORDS.has(stem + 'ى')) {
      changes++;
      return stem + 'ى';
    }

    // ى that should be ي — common mistakes
    if (lastChar === 'ى' && (word === 'فى' || word === 'الذى' || word === 'التى')) {
      changes++;
      return stem + 'ي';
    }

    return word;
  });

  return { fixed: unshieldTags(fixed, tags), changes };
}

// ============================================================
// 3. Repeated consecutive words
// ============================================================

export function fixRepeatedWords(text: string): { fixed: string; changes: number } {
  const { shielded, tags } = shieldTags(text);
  let changes = 0;
  
  // Split by whitespace, remove consecutive duplicates
  const words = shielded.split(/(\s+)/);
  const result: string[] = [];
  let lastWord = '';
  
  for (const token of words) {
    if (/^\s+$/.test(token)) {
      result.push(token);
      continue;
    }
    // Only skip if the word is 2+ chars and matches the previous word exactly
    if (token.length >= 2 && token === lastWord) {
      // Remove the preceding whitespace too
      if (result.length > 0 && /^\s+$/.test(result[result.length - 1])) {
        result.pop();
      }
      changes++;
      continue;
    }
    result.push(token);
    lastWord = token;
  }
  
  const fixed = result.join('');
  return { fixed: unshieldTags(fixed, tags), changes };
}

// ============================================================
// 4. AI translation artifacts cleanup
// ============================================================

const AI_ARTIFACT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /^(بالتأكيد[!!\s]*[،,]?\s*)/u, label: 'بالتأكيد' },
  { pattern: /^(بالطبع[!!\s]*[،,]?\s*)/u, label: 'بالطبع' },
  { pattern: /^(حسنا[ً]?[!!\s]*[،,]?\s*)/u, label: 'حسناً' },
  { pattern: /^(إليك الترجمة[:\s]*)/u, label: 'إليك الترجمة' },
  { pattern: /^(الترجمة هي[:\s]*)/u, label: 'الترجمة هي' },
  { pattern: /^(هذه هي الترجمة[:\s]*)/u, label: 'هذه هي الترجمة' },
  { pattern: /^(الترجمة العربية[:\s]*)/u, label: 'الترجمة العربية' },
  { pattern: /^(ها هي الترجمة[:\s]*)/u, label: 'ها هي الترجمة' },
  { pattern: /^(Here'?s? (?:the )?translation[:\s]*)/i, label: 'English prefix' },
  { pattern: /^(Translation[:\s]*)/i, label: 'Translation prefix' },
  { pattern: /^(Sure[!,.\s]*(?:here(?:'s| is)[:\s]*)?)/i, label: 'Sure prefix' },
  { pattern: /(\s*\(ترجمة\)|\s*\(مترجم\)|\s*\(translated\))\s*$/iu, label: 'suffix tag' },
  // Quotation wrapping the entire text
  { pattern: /^["«"](.+)["»"]$/u, label: 'wrapping quotes' },
];

export function cleanAIArtifacts(text: string): { fixed: string; changes: number; removedLabels: string[] } {
  let fixed = text.trim();
  let changes = 0;
  const removedLabels: string[] = [];
  
  for (const { pattern, label } of AI_ARTIFACT_PATTERNS) {
    if (pattern.test(fixed)) {
      const before = fixed;
      if (label === 'wrapping quotes') {
        fixed = fixed.replace(pattern, '$1');
      } else {
        fixed = fixed.replace(pattern, '');
      }
      if (fixed !== before) {
        changes++;
        removedLabels.push(label);
      }
    }
  }
  
  return { fixed: fixed.trim(), changes, removedLabels };
}

// ============================================================
// 5. Lonely Lam fix (ل → لا)
// ============================================================

/**
 * Detects standalone 'ل' that should be 'لا' (negation).
 * In Arabic, 'ل' alone (separated by spaces) is almost never correct —
 * it's usually a broken 'لا' (no/not) from AI translation.
 * The preposition 'ل' is always attached to the next word (لِلذهاب).
 */
export function fixLonelyLam(text: string): { fixed: string; changes: number } {
  const { shielded, tags } = shieldTags(text);
  let changes = 0;

  // Use a loop to handle consecutive standalone 'ل' (regex g flag may skip overlapping matches)
  let result = shielded;
  let prev = '';
  while (prev !== result) {
    prev = result;
    result = result.replace(/(^|\s)ل(\s|$)/g, (_, before, after) => {
      changes++;
      return before + 'لا' + after;
    });
  }

  return { fixed: unshieldTags(result, tags), changes };
}

// ============================================================
// Combined scan
// ============================================================

export interface TextFixResult {
  key: string;
  before: string;
  after: string;
  fixType: 'taa-haa' | 'yaa-alef' | 'repeated' | 'ai-artifact' | 'lonely-lam';
  fixLabel: string;
  details: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export function scanAllTextFixes(translations: Record<string, string>): TextFixResult[] {
  const results: TextFixResult[] = [];
  
  for (const [key, value] of Object.entries(translations)) {
    if (!value?.trim()) continue;
    
    // Apply fixes sequentially so they chain correctly
    let current = value;
    
    // 1. AI artifacts first (may change text structure)
    const aiResult = cleanAIArtifacts(current);
    if (aiResult.changes > 0) {
      results.push({
        key, before: current, after: aiResult.fixed,
        fixType: 'ai-artifact', fixLabel: 'مخلفات AI',
        details: aiResult.removedLabels.join('، '),
        status: 'pending',
      });
      current = aiResult.fixed;
    }
    
    // 2. Repeated words
    const repResult = fixRepeatedWords(current);
    if (repResult.changes > 0) {
      results.push({
        key, before: current, after: repResult.fixed,
        fixType: 'repeated', fixLabel: 'كلمات مكررة',
        details: `${repResult.changes} تكرار`,
        status: 'pending',
      });
      current = repResult.fixed;
    }
    
    // 3. Taa/Haa
    const taaResult = fixTaaMarbutaHaa(current);
    if (taaResult.changes > 0) {
      results.push({
        key, before: current, after: taaResult.fixed,
        fixType: 'taa-haa', fixLabel: 'تاء/هاء',
        details: `${taaResult.changes} إصلاح (ه→ة)`,
        status: 'pending',
      });
      current = taaResult.fixed;
    }
    
    // 4. Lonely Lam (ل → لا)
    const lamResult = fixLonelyLam(current);
    if (lamResult.changes > 0) {
      results.push({
        key, before: current, after: lamResult.fixed,
        fixType: 'lonely-lam', fixLabel: 'ل → لا',
        details: `${lamResult.changes} إصلاح (ل المنفردة)`,
        status: 'pending',
      });
      current = lamResult.fixed;
    }
    
    // 5. Yaa/Alef Maqsura
    const yaaResult = fixYaaAlefMaqsura(current);
    if (yaaResult.changes > 0) {
      results.push({
        key, before: current, after: yaaResult.fixed,
        fixType: 'yaa-alef', fixLabel: 'ياء/ألف مقصورة',
        details: `${yaaResult.changes} إصلاح (ي↔ى)`,
        status: 'pending',
      });
    }
  }
  
  return results;
}

/** Scan only for lonely-lam (ل → لا) fixes */
export function scanLonelyLamFixes(translations: Record<string, string>): TextFixResult[] {
  const results: TextFixResult[] = [];
  for (const [key, value] of Object.entries(translations)) {
    if (!value?.trim()) continue;
    const lamResult = fixLonelyLam(value);
    if (lamResult.changes > 0) {
      results.push({
        key, before: value, after: lamResult.fixed,
        fixType: 'lonely-lam', fixLabel: 'ل → لا',
        details: `${lamResult.changes} إصلاح (ل المنفردة)`,
        status: 'pending',
      });
    }
  }
  return results;
}
