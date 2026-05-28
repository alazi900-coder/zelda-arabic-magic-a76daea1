// =============================================================================
// قواعد التحسين بالذكاء الاصطناعي
// قواعد مبنيّة (built-in) + قواعد مخصّصة (custom) يضيفها المستخدم.
// CRUD كامل للقواعد المخصّصة عبر localStorage.
// =============================================================================

export type EnhanceRuleId = string; // مفتوح الآن لدعم القواعد المخصّصة

export type EnhanceRuleKind = 'detect' | 'protect';

export interface EnhanceRule {
  id: EnhanceRuleId;
  label: string;
  description: string;
  kind: EnhanceRuleKind;
  /** القاعدة مُفعَّلة افتراضيّاً عند أوّل تشغيل. */
  defaultEnabled: boolean;
  /** القاعدة حرجة (تحمي من كسر اللعبة). يُسمح بإيقافها مع تحذير. */
  critical?: boolean;
  /** نصّ الـ prompt المُحقَن عند تفعيل القاعدة. */
  prompt: string;
  /** قاعدة من إنشاء المستخدم (يمكن تعديلها/حذفها). */
  custom?: boolean;
}

export const BUILTIN_RULES: EnhanceRule[] = [
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
const CUSTOM_STORAGE_KEY = 'xc1_enhance_custom_rules_v1';

// ───── Custom rules CRUD ─────────────────────────────────────────────────────

export function loadCustomRules(): EnhanceRule[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r): r is EnhanceRule =>
        r && typeof r.id === 'string' && typeof r.label === 'string' &&
        typeof r.prompt === 'string' && (r.kind === 'detect' || r.kind === 'protect')
      )
      .map(r => ({ ...r, custom: true }));
  } catch { return []; }
}

export function saveCustomRules(rules: EnhanceRule[]): void {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(rules.map(r => ({ ...r, custom: true }))));
  } catch { /* تجاهل */ }
}

export function generateCustomRuleId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ───── Combined access ──────────────────────────────────────────────────────

/** كلّ القواعد (مبنيّة + مخصّصة). */
export function getAllRules(): EnhanceRule[] {
  return [...BUILTIN_RULES, ...loadCustomRules()];
}

/** للتوافق مع الكود القديم. */
export const ENHANCE_RULES = BUILTIN_RULES;

// ───── Enabled set ──────────────────────────────────────────────────────────

export function loadEnabledRules(): Set<EnhanceRuleId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as EnhanceRuleId[];
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch { /* تجاهل */ }
  // الافتراضي: كلّ المبنيّة المُفعَّلة + كلّ المخصّصة (لأنّها أُضيفت يدوياً)
  const defaults = new Set<EnhanceRuleId>(
    BUILTIN_RULES.filter(r => r.defaultEnabled).map(r => r.id)
  );
  for (const r of loadCustomRules()) defaults.add(r.id);
  return defaults;
}

export function saveEnabledRules(ids: Set<EnhanceRuleId>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch { /* تجاهل */ }
}

export function isAllDefaultsEnabled(ids: Set<EnhanceRuleId>): boolean {
  return BUILTIN_RULES.filter(r => r.defaultEnabled).every(r => ids.has(r.id));
}
