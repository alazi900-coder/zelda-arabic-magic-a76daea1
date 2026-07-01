/**
 * سجل التحديثات — يُحدَّث تلقائياً مع كل تعديل (إضافة/تعديل/إزالة ميزة).
 * الإدخال الأحدث في الأعلى. عند إضافة إدخال جديد ارفع APP_VERSION في
 * src/lib/version.ts (patch لإصلاحات صغيرة، minor لميزة جديدة).
 */
export type ChangeKind = "added" | "changed" | "fixed" | "removed";

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  changes: { kind: ChangeKind; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.6.2",
    date: "2026-07-01",
    changes: [
      { kind: "fixed", text: "استمرار ظهور نسخة قديمة عند فتح الموقع مباشرة رغم وجود تحديث: أُضيف فحص إصدار حقيقي مقابل الخادم عند كل فتح — يقارن meta app-version المحمّل مع نسخة index.html على الخادم (no-store)، وإذا اختلفا يُجبر إعادة تحميل مع كسر كاش المتصفح (?_v=). يُعاد الفحص أيضاً عند العودة إلى التبويب." },
    ],
  },
  {
    version: "1.6.1",
    date: "2026-07-01",
    changes: [
      { kind: "fixed", text: "إصلاح ظهور نسخة قديمة من الأداة بشكل متقطع (صفحات مفقودة مثل بوكيمون، ميزات ناقصة). أُضيف تنظيف استباقي لأي Service Worker قديم وكاش المتصفح عند كل فتح للصفحة مع إعادة تحميل تلقائية واحدة عند اكتشافه." },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-06-30",
    changes: [
      { kind: "added", text: "ذاكرة ترجمة (TM) داخل لوحة الاقتراحات السياقية — يُرسل النموذج أعلى 3 جمل سابقة مشابهة كأمثلة لرفع اتساق المصطلحات والأسلوب." },
      { kind: "added", text: "حد البايتات (maxBytes) يُحقن صراحةً في تعليمات النموذج لتقليل تجاوز السعة في ملفات XC." },
      { kind: "changed", text: "ذاكرة مؤقتة دائمة للاقتراحات في IndexedDB بعمر 7 أيام بدل الذاكرة المؤقتة — تبقى الاقتراحات بعد تحديث الصفحة وتوفّر credits." },
      { kind: "added", text: "شارات معلوماتية تُظهر عدد جمل السياق وعدد أمثلة TM وحد البايتات قبل التوليد، مع إشارة ⚡ عند جلب النتيجة من الذاكرة." },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-06-28",
    changes: [
      { kind: "added", text: "دعم محرّك DeepSeek (V4 Flash / V4 Pro) في لوحة الاقتراحات السياقية — تستخدم نفس المفتاح والموديل المختار في إعدادات الترجمة." },
      { kind: "added", text: "سجل تحديثات تلقائي يظهر في الصفحة الرئيسية وفي شاشة /pwa-status مع تفاصيل كل تعديل ورقم الإصدار." },
      { kind: "fixed", text: "رسائل خطأ أوضح من DeepSeek (401 مفتاح غير صالح / 402 رصيد / 429 حدّ الطلبات)." },
    ],
  },
];

export const LATEST_CHANGE = CHANGELOG[0];

export const KIND_META: Record<ChangeKind, { label: string; cls: string; emoji: string }> = {
  added:   { label: "إضافة", emoji: "✨", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  changed: { label: "تعديل", emoji: "🔧", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  fixed:   { label: "إصلاح", emoji: "🐛", cls: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  removed: { label: "إزالة", emoji: "🗑️", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
};
