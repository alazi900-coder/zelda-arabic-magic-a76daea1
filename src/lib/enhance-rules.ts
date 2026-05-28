// =============================================================================
// قواعد التحسين بالذكاء الاصطناعي
// تعريف موحَّد للقواعد المُرسلة لـ enhance-translations مع إمكانية
// تشغيل/إيقاف كلّ قاعدة من إعدادات اللوحة.
// =============================================================================

export type EnhanceRuleId =
  // Detection — ماذا يبحث الـ AI؟
  | 'detect_missing_char'
  | 'detect_accuracy'
  | 'detect_phrasing'
  | 'detect_word_order'
  | 'detect_consistency'
  | 'detect_terminology'
  | 'detect_untranslated'
  // Protection — ماذا لا يفعل الـ AI؟
  | 'block_tashkeel'
  | 'protect_proper_nouns'
  | 'skip_preferences'
  | 'skip_hamza_only'
  | 'protect_tech_tags'
  | 'no_identical_output';

export type EnhanceRuleKind = 'detect' | 'protect';

export interface EnhanceRule {
  id: EnhanceRuleId;
  label: string;
  description: string;
  kind: EnhanceRuleKind;
  /** القاعدة مُفعَّلة افتراضيّاً عند أوّل تشغيل. */
  defaultEnabled: boolean;
  /**
   * القاعدة حرجة (تحمي من كسر اللعبة).
   * يُسمح بإيقافها لكن مع تحذير بصريّ.
   */
  critical?: boolean;
  /** نصّ الـ prompt المُحقَن عند تفعيل القاعدة. */
  prompt: string;
}

export const ENHANCE_RULES: EnhanceRule[] = [
  // ───── Detection ─────
  {
    id: 'detect_missing_char',
    label: 'حرف ناقص أو زائد',
    description: 'يكتشف أخطاء مثل "المعركه" بدلاً من "المعركة"',
    kind: 'detect',
    defaultEnabled: true,
    prompt: '**missing_char** — حرف ناقص أو زائد ("المعركه"↔"المعركة")',
  },
  {
    id: 'detect_accuracy',
    label: 'دقّة المعنى',
    description: 'ترجمة حرفيّة تحرف المعنى أو تجعله ركيكاً',
    kind: 'detect',
    defaultEnabled: true,
    prompt: '**accuracy** — ترجمة حرفيّة تحرف المعنى أو تجعله ركيكاً',
  },
  {
    id: 'detect_phrasing',
    label: 'صياغة وأسلوب',
    description: 'جمل ركيكة أو غير مفهومة تحتاج إعادة صياغة',
    kind: 'detect',
    defaultEnabled: true,
    prompt: '**style** — جملة ركيكة أو غير مفهومة تحتاج إعادة صياغة',
  },
  {
    id: 'detect_word_order',
    label: 'ترتيب الكلمات',
    description: 'جملة كلماتها صحيحة لكن ترتيبها معكوس أو مربك',
    kind: 'detect',
    defaultEnabled: true,
    prompt: '**reorder** — صحيحة لغوياً لكن ترتيب الكلمات/الجُمل غير سليم',
  },
  {
    id: 'detect_consistency',
    label: 'اتساق المصطلحات',
    description: 'نفس المصطلح مترجم بشكلَين مختلفَين',
    kind: 'detect',
    defaultEnabled: true,
    prompt: '**consistency** — نفس المصطلح مترجم بشكلَين مختلفَين',
  },
  {
    id: 'detect_terminology',
    label: 'مصطلحات القاموس',
    description: 'مصطلح من القاموس المعتمد مترجم بشكل خاطئ',
    kind: 'detect',
    defaultEnabled: true,
    prompt: '**terminology** — مصطلح من القاموس مترجم بشكل خاطئ',
  },
  {
    id: 'detect_untranslated',
    label: 'نصوص غير مترجمة أو ملتصقة',
    description: 'كلمات إنجليزيّة بقيت كما هي أو كلمات عربيّة بدون فراغات',
    kind: 'detect',
    defaultEnabled: true,
    prompt: '**untranslated** — نصّ بقي إنجليزياً أو كلمات عربيّة ملتصقة بلا فراغات',
  },

  // ───── Protection ─────
  {
    id: 'block_tashkeel',
    label: 'منع التشكيل والحركات',
    description: 'يُلزم الـ AI بعدم استخدام التنوين/الحركات/الشدّة (خطّ اللعبة لا يدعمها)',
    kind: 'protect',
    defaultEnabled: true,
    critical: true,
    prompt:
      '🚫 لا تستخدم في اقتراحاتك: التنوين (ً ٌ ٍ)، الحركات (َ ُ ِ)، الشدّة (ّ)، السكون (ْ). خطّ اللعبة لا يدعم هذه الرموز.',
  },
  {
    id: 'protect_proper_nouns',
    label: 'حماية أسماء الأعلام',
    description: 'لا تقترح تغيير أسماء شخصيّات/أماكن XC1 (Shulk, Reyn, Monado…)',
    kind: 'protect',
    defaultEnabled: true,
    prompt:
      '🚫 لا تقترح تغيير الأسماء الأعلام لـ Xenoblade Chronicles 1 سواء بقيت إنجليزيّة أو نُقلت صوتياً.',
  },
  {
    id: 'skip_preferences',
    label: 'تخطّي الاقتراحات التفضيليّة',
    description: 'لا تقترح تعديلات أسلوبيّة بحتة لو الجملة مفهومة وسليمة',
    kind: 'protect',
    defaultEnabled: true,
    prompt: '🚫 لا تقترح تعديلات تفضيليّة بحتة لو الجملة مفهومة وسليمة.',
  },
  {
    id: 'skip_hamza_only',
    label: 'تخطّي تعديلات الهمزات وحدها',
    description: 'لا تُبلّغ عن تعديلات تتعلّق فقط بـ (ء آ أ ؤ إ ئ) بدون خطأ قواعديّ',
    kind: 'protect',
    defaultEnabled: true,
    prompt:
      '🚫 لا تقترح تعديلات تتعلّق فقط بإضافة/حذف الهمزات (ء آ أ ؤ إ ئ) بدون تغيير قواعديّ/أسلوبيّ حقيقيّ.',
  },
  {
    id: 'protect_tech_tags',
    label: 'حماية الوسوم التقنيّة',
    description:
      'يمنع كسر [Color:Red] [Icon:*] [XENO:n] ورموز PUA و\\uFFF9-\\uFFFC (إيقافها قد يكسر اللعبة!)',
    kind: 'protect',
    defaultEnabled: true,
    critical: true,
    prompt:
      '⚠️ لا تكسر الوسوم التقنيّة [Color:Red] [Icon:*] [XENO:n] [XENO:wait] ولا رموز PUA (\\uE000-\\uE0FF) ولا رموز \\uFFF9-\\uFFFC. لا تَحذف أو تُضِف أيّ رمز من هذه النطاقات.',
  },
  {
    id: 'no_identical_output',
    label: 'منع إعادة النصّ بدون تغيير',
    description: 'إذا لم يجد الـ AI مشكلة، لا يُعيد نفس النصّ',
    kind: 'protect',
    defaultEnabled: true,
    prompt: '⚠️ لا تُعِد النصّ نفسه بدون تغيير. إذا كانت الترجمة صحيحة، تخطَّاها.',
  },
];

const STORAGE_KEY = 'xc1_enhance_rules_v1';

/** تُرجع مجموعة معرّفات القواعد المُفعَّلة (مع الافتراضات لأوّل تشغيل). */
export function loadEnabledRules(): Set<EnhanceRuleId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as EnhanceRuleId[];
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    /* تجاهل */
  }
  return new Set(ENHANCE_RULES.filter(r => r.defaultEnabled).map(r => r.id));
}

export function saveEnabledRules(ids: Set<EnhanceRuleId>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* تجاهل */
  }
}

/** تُرجع true إذا كانت كلّ القواعد المفعَّلة افتراضيّاً مُفعَّلة (للعرض). */
export function isAllDefaultsEnabled(ids: Set<EnhanceRuleId>): boolean {
  return ENHANCE_RULES.filter(r => r.defaultEnabled).every(r => ids.has(r.id));
}
