/**
 * An obsolete deployed enhancement edge function can silently use Lovable
 * instead of the chosen Cerebras provider. Identify that routing mismatch
 * without misreporting the user's Cerebras credit balance.
 */
export function isEnhancementBillingError(rawError: string): boolean {
  return /الرصيد غير كاف|insufficient.{0,20}(?:credit|balance)|payment required|\b402\b/i.test(rawError);
}

export function explainEnhancementProviderError(provider: string, rawError: string): string {
  if (provider !== "cerebras") {
    if (isEnhancementBillingError(rawError) && /Lovable(?: AI)? Gateway/i.test(rawError)) {
      return "انتهى رصيد Lovable Gateway الخاص بمسار التحسين. هذا لا يعني نفاد رصيد مزوّد الترجمة الذي يعمل لديك. لتشغيل التحسين دون Lovable: اختر Gemini مع مفتاح Google API ووضع «مجاني فقط»، أو اختر نموذج مزوّد آخر مع مفتاحه من إعدادات المحرّر. وضع «تلقائي» قد يعود إلى Lovable إذا فشل Gemini. التفاصيل: " + rawError;
    }
    return rawError;
  }
  if (/Lovable(?: AI)? Gateway/i.test(rawError)) {
    return "وظيفة تحسين الترجمة المنشورة ما زالت تُوجّه Cerebras إلى Lovable Gateway. هذا ليس نفاد رصيد Cerebras. يجب إعادة نشر supabase/functions/enhance-translations/index.ts من فرع main على Supabase / Lovable Cloud، ثم إعادة تجربة Cerebras. التفاصيل: " + rawError;
  }
  if (/مفتاح Gemini|Gemini.*(?:API|key)/i.test(rawError)) {
    return "نسخة تحسين الترجمة المنشورة تطلب Gemini رغم اختيار Cerebras. يجب نشر وظيفة enhance-translations المحدثة؛ لا تُضف مفتاح Gemini لحل هذه المشكلة. التفاصيل: " + rawError;
  }
  return rawError;
}
