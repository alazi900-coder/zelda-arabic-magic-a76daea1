/**
 * An obsolete deployed enhancement edge function can silently use Lovable
 * instead of the chosen Cerebras provider. Identify that routing mismatch
 * without misreporting the user's Cerebras credit balance.
 */
export function explainEnhancementProviderError(provider: string, rawError: string): string {
  if (provider !== "cerebras") return rawError;
  if (/Lovable(?: AI)? Gateway/i.test(rawError)) {
    return "وظيفة تحسين الترجمة المنشورة ما زالت تُوجّه Cerebras إلى Lovable Gateway. هذا ليس نفاد رصيد Cerebras. يجب إعادة نشر supabase/functions/enhance-translations/index.ts من فرع main على Supabase / Lovable Cloud، ثم إعادة تجربة Cerebras. التفاصيل: " + rawError;
  }
  if (/مفتاح Gemini|Gemini.*(?:API|key)/i.test(rawError)) {
    return "نسخة تحسين الترجمة المنشورة تطلب Gemini رغم اختيار Cerebras. يجب نشر وظيفة enhance-translations المحدثة؛ لا تُضف مفتاح Gemini لحل هذه المشكلة. التفاصيل: " + rawError;
  }
  return rawError;
}
