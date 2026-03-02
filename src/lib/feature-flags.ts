import { useState, useCallback, useEffect } from "react";

export type FeatureGroup = "quality" | "cleanup" | "ui" | "translation";

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  group: FeatureGroup;
  defaultEnabled: boolean;
}

export const FEATURE_GROUPS: Record<FeatureGroup, { name: string; emoji: string; color: string }> = {
  quality: { name: "أدوات الجودة", emoji: "🔍", color: "text-emerald-400" },
  cleanup: { name: "أدوات التنظيف", emoji: "🧹", color: "text-sky-400" },
  ui: { name: "واجهة المستخدم", emoji: "🎨", color: "text-violet-400" },
  translation: { name: "أدوات الترجمة", emoji: "🌐", color: "text-amber-400" },
};

export const ALL_FEATURES: FeatureFlag[] = [
  // === أدوات الجودة (quality) ===
  { id: "grammar_check", name: "فحص القواعد النحوية", description: "فحص بسيط بالذكاء الاصطناعي للأخطاء النحوية", group: "quality", defaultEnabled: true },
  { id: "length_check", name: "فحص طول النص", description: "تنبيه إذا كانت الترجمة أقصر/أطول بكثير من الأصل", group: "quality", defaultEnabled: true },
  { id: "number_check", name: "فحص الأرقام", description: "التأكد من تطابق الأرقام بين الأصل والترجمة", group: "quality", defaultEnabled: true },
  { id: "variable_check", name: "فحص المتغيرات", description: "التأكد من وجود جميع {variables} في الترجمة", group: "quality", defaultEnabled: true },
  { id: "punctuation_check", name: "فحص علامات الترقيم", description: "مقارنة علامات الترقيم بين الأصل والترجمة", group: "quality", defaultEnabled: true },
  { id: "repetition_check", name: "فحص التكرار اللغوي", description: "كشف تكرار كلمات غير مقصود في نفس الجملة", group: "quality", defaultEnabled: true },
  { id: "extra_spaces_check", name: "فحص المسافات الزائدة", description: "كشف وإصلاح المسافات المزدوجة", group: "quality", defaultEnabled: true },
  { id: "remaining_english", name: "كشف النص الإنجليزي المتبقي", description: "كشف كلمات إنجليزية نُسيت بدون ترجمة", group: "quality", defaultEnabled: true },
  { id: "tashkeel_check", name: "فحص التشكيل", description: "التحقق من صحة التشكيل (الحركات) على الكلمات", group: "quality", defaultEnabled: false },
  { id: "literal_translation", name: "كشف الترجمة الحرفية", description: "تنبيه عند ترجمة تبدو حرفية جداً", group: "quality", defaultEnabled: false },
  { id: "balanced_brackets", name: "فحص الأقواس المتوازنة", description: "التأكد من إغلاق كل قوس مفتوح", group: "quality", defaultEnabled: true },
  { id: "term_consistency", name: "فحص اتساق المصطلحات", description: "التأكد من ترجمة نفس المصطلح بنفس الطريقة", group: "quality", defaultEnabled: false },
  { id: "quality_score", name: "تقييم جودة شامل", description: "نقاط جودة 1-10 لكل ترجمة بواسطة AI", group: "quality", defaultEnabled: false },
  { id: "quality_report", name: "تقرير جودة شامل", description: "تقرير بإحصائيات الجودة الكاملة", group: "quality", defaultEnabled: false },
  { id: "diff_compare", name: "مقارنة مع ترجمات سابقة", description: "عرض الفرق بين النسخة الحالية والسابقة", group: "quality", defaultEnabled: false },

  // === أدوات التنظيف (cleanup) ===
  { id: "unicode_fix", name: "إصلاح Unicode", description: "كشف وإصلاح أحرف Unicode غير صحيحة", group: "cleanup", defaultEnabled: true },
  { id: "hamza_unify", name: "توحيد الهمزات", description: "توحيد أشكال الهمزة (أ/إ/آ/ء)", group: "cleanup", defaultEnabled: true },
  { id: "taa_fix", name: "إصلاح التاء المربوطة/المفتوحة", description: "تصحيح ة/ه في نهاية الكلمات", group: "cleanup", defaultEnabled: false },
  { id: "html_clean", name: "تنظيف HTML", description: "إزالة وسوم HTML المتبقية من الترجمات", group: "cleanup", defaultEnabled: false },
  { id: "quote_fix", name: "إصلاح الاقتباسات", description: 'تحويل "quotes" إلى «أقواس عربية»', group: "cleanup", defaultEnabled: true },
  { id: "number_unify", name: "توحيد الأرقام", description: "تحويل بين أرقام عربية (١٢٣) وهندية (123)", group: "cleanup", defaultEnabled: true },
  { id: "invisible_chars", name: "إزالة الأحرف غير المرئية", description: "كشف وحذف Zero-Width characters", group: "cleanup", defaultEnabled: true },
  { id: "rtl_fix", name: "تصحيح اتجاه النص", description: "إصلاح مشاكل RTL/LTR المختلطة", group: "cleanup", defaultEnabled: false },
  { id: "space_normalize", name: "تنظيف الفراغات", description: "توحيد أنواع المسافات (non-breaking, thin, etc.)", group: "cleanup", defaultEnabled: false },
  { id: "question_mark_fix", name: "إصلاح علامة الاستفهام", description: "تحويل ? إلى ؟ في النصوص العربية", group: "cleanup", defaultEnabled: true },

  // === واجهة المستخدم (ui) ===
  { id: "dark_mode", name: "الوضع المظلم/الفاتح", description: "تبديل بين السمة الداكنة والفاتحة", group: "ui", defaultEnabled: false },
  { id: "font_size", name: "تخصيص حجم الخط", description: "تكبير/تصغير خط المحرر", group: "ui", defaultEnabled: false },
  { id: "side_by_side", name: "عرض جنب-لجنب", description: "عرض الأصل والترجمة في أعمدة متجاورة", group: "ui", defaultEnabled: false },
  { id: "keyboard_shortcuts", name: "اختصارات لوحة المفاتيح", description: "Ctrl+S حفظ، Ctrl+Enter ترجمة، Ctrl+Z تراجع", group: "ui", defaultEnabled: true },
  { id: "detailed_progress", name: "شريط تقدم مفصّل", description: "عرض التقدم حسب الفئة بألوان مختلفة", group: "ui", defaultEnabled: false },
  { id: "focus_mode", name: "وضع التركيز", description: "إخفاء كل شيء ما عدا النص الحالي", group: "ui", defaultEnabled: false },
  { id: "advanced_filter", name: "تصفية متقدمة", description: "تصفية بعدة معايير معاً", group: "ui", defaultEnabled: false },
  { id: "custom_sort", name: "ترتيب مخصص", description: "ترتيب النصوص حسب الطول أو الأبجدية", group: "ui", defaultEnabled: false },
  { id: "bookmarks", name: "علامات مرجعية", description: "تثبيت نصوص معينة للرجوع إليها لاحقاً", group: "ui", defaultEnabled: true },
  { id: "comments", name: "تعليقات على النصوص", description: "إضافة ملاحظات خاصة على كل نص", group: "ui", defaultEnabled: true },
  { id: "word_counter", name: "عداد الكلمات الحي", description: "عرض عدد الكلمات والأحرف أثناء الكتابة", group: "ui", defaultEnabled: true },
  { id: "game_preview", name: "معاينة في اللعبة", description: "محاكاة شكل النص داخل إطار اللعبة", group: "ui", defaultEnabled: false },
  { id: "multi_drag_drop", name: "سحب وإفلات متعدد", description: "سحب عدة ملفات JSON دفعة واحدة", group: "ui", defaultEnabled: false },
  { id: "regex_search", name: "بحث بالتعبيرات النمطية", description: "دعم Regex في البحث", group: "ui", defaultEnabled: true },
  { id: "export_settings", name: "تصدير/استيراد الإعدادات", description: "حفظ إعدادات المحرر ومشاركتها", group: "ui", defaultEnabled: false },

  // === أدوات الترجمة (translation) ===
  { id: "context_translate", name: "ترجمة بالسياق", description: "إرسال الجمل المحيطة مع النص لتحسين جودة الترجمة", group: "translation", defaultEnabled: true },
  { id: "selective_translate", name: "ترجمة انتقائية", description: "تحديد عدة نصوص يدوياً وترجمتها دفعة واحدة", group: "translation", defaultEnabled: false },
  { id: "multi_suggestions", name: "اقتراحات ترجمة متعددة", description: "عرض 3 خيارات ترجمة لكل نص للاختيار بينها", group: "translation", defaultEnabled: false },
  { id: "translate_explain", name: "ترجمة مع تفسير", description: "عرض سبب اختيار الذكاء الاصطناعي لترجمة معينة", group: "translation", defaultEnabled: false },
  { id: "back_translate", name: "ترجمة عكسية", description: "ترجمة النص العربي للإنجليزية للتحقق من الدقة", group: "translation", defaultEnabled: true },
  { id: "user_glossary", name: "قاموس مخصص للمستخدم", description: "حفظ مصطلحات خاصة بالمستخدم تُطبّق تلقائياً", group: "translation", defaultEnabled: false },
  { id: "interactive_translate", name: "وضع الترجمة التفاعلية", description: "ترجمة كلمة بكلمة مع إمكانية تعديل كل كلمة", group: "translation", defaultEnabled: false },
  { id: "duplicate_detect", name: "كشف النصوص المكررة", description: "تجميع النصوص المتطابقة وترجمتها مرة واحدة", group: "translation", defaultEnabled: true },
  { id: "style_translate", name: "ترجمة بأسلوب محدد", description: "اختيار أسلوب رسمي/غير رسمي/شعري", group: "translation", defaultEnabled: true },
  { id: "translation_history", name: "تاريخ الترجمات", description: "حفظ كل نسخة سابقة لكل نص مع إمكانية الرجوع", group: "translation", defaultEnabled: true },
  { id: "format_preserve", name: "ترجمة مع حفظ التنسيق", description: "الحفاظ على الأسطر والمسافات بنفس شكل الأصل", group: "translation", defaultEnabled: false },
  { id: "deepl_engine", name: "محرك DeepL", description: "إضافة دعم DeepL كمحرك ترجمة إضافي", group: "translation", defaultEnabled: false },
  { id: "voice_translate", name: "ترجمة بالصوت", description: "إملاء الترجمة صوتياً بدل الكتابة", group: "translation", defaultEnabled: false },
  { id: "autocomplete", name: "اقتراح تلقائي أثناء الكتابة", description: "Autocomplete عربي أثناء تحرير الترجمة", group: "translation", defaultEnabled: false },
  { id: "priority_translate", name: "ترجمة حسب الأولوية", description: "ترجمة القوائم الرئيسية أولاً ثم الحوارات الثانوية", group: "translation", defaultEnabled: true },
];

const STORAGE_KEY = "feature-flags-v1";

function loadFlags(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveFlags(flags: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
}

export function useFeatureFlags() {
  const [overrides, setOverrides] = useState<Record<string, boolean>>(loadFlags);

  useEffect(() => {
    saveFlags(overrides);
  }, [overrides]);

  const isEnabled = useCallback(
    (featureId: string): boolean => {
      if (featureId in overrides) return overrides[featureId];
      const feature = ALL_FEATURES.find((f) => f.id === featureId);
      return feature?.defaultEnabled ?? false;
    },
    [overrides]
  );

  const setEnabled = useCallback((featureId: string, enabled: boolean) => {
    setOverrides((prev) => ({ ...prev, [featureId]: enabled }));
  }, []);

  const enableAll = useCallback((group?: FeatureGroup) => {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const f of ALL_FEATURES) {
        if (!group || f.group === group) next[f.id] = true;
      }
      return next;
    });
  }, []);

  const disableAll = useCallback((group?: FeatureGroup) => {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const f of ALL_FEATURES) {
        if (!group || f.group === group) next[f.id] = false;
      }
      return next;
    });
  }, []);

  const resetAll = useCallback((group?: FeatureGroup) => {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const f of ALL_FEATURES) {
        if (!group || f.group === group) delete next[f.id];
      }
      return next;
    });
  }, []);

  const getGroupFeatures = useCallback(
    (group: FeatureGroup) => ALL_FEATURES.filter((f) => f.group === group),
    []
  );

  const getEnabledCount = useCallback(
    (group: FeatureGroup) => {
      return ALL_FEATURES.filter((f) => f.group === group && isEnabled(f.id)).length;
    },
    [isEnabled]
  );

  return { isEnabled, setEnabled, enableAll, disableAll, resetAll, getGroupFeatures, getEnabledCount, overrides };
}
