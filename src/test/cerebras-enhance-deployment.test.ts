import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { explainEnhancementProviderError, isEnhancementBillingError } from "@/lib/enhance-provider-error";

describe("Cerebras enhancement routing and deployment diagnostics", () => {
  const server = readFileSync("supabase/functions/enhance-translations/index.ts", "utf8");
  const panel = readFileSync("src/components/editor/TranslationAIEnhancePanel.tsx", "utf8");

  it("routes a Cerebras model directly to its provider without Lovable fallback", () => {
    expect(server).toContain("const isCerebras = provider === 'cerebras' || aiModel === 'gpt-oss-120b'");
    expect(server).toContain("if (isCerebras) {");
    expect(server).toContain("https://api.cerebras.ai/v1/chat/completions");
    expect(server).toContain("!isCerebras && !isDeepSeek && !isTokenRouter && !isGmiCloud && !LOVABLE_API_KEY");
  });

  it("does not demand Gemini API key for Cerebras in free-only mode", () => {
    expect(server).toContain("normalizedRouting === 'free' && !isCerebras && !isDeepSeek");
    expect(server).toContain("if (isCerebras && !(providerApiKey && providerApiKey.trim()))");
  });

  it("adds a unique marker proving which backend release answered", () => {
    expect(server).toContain("fn=enh-1.96.0-cb");
    expect(server).toContain("cb=${isCerebras}");
    expect(server).toContain("provider=${provider ?? '∅'}");
  });

  it("explains old Lovable 402 as a stale deployed backend, not Cerebras credit", () => {
    const oldError = "الرصيد غير كافٍ على Lovable Gateway [fn=enh-1.95.0 · aiModel=gpt-oss-120b · tr=false · ds=false]";
    const mapped = explainEnhancementProviderError("cerebras", oldError);
    expect(mapped).toContain("إعادة نشر");
    expect(mapped).toContain("enhance-translations/index.ts");
    expect(mapped).toContain("ليس نفاد رصيد Cerebras");
    expect(mapped).toContain(oldError);
    expect(explainEnhancementProviderError("gemini", oldError)).toContain("انتهى رصيد Lovable Gateway");
  });

  it("recognizes payment errors and advises a direct provider instead of misreporting the translator", () => {
    expect(isEnhancementBillingError("الرصيد غير كافٍ على Lovable Gateway")).toBe(true);
    expect(isEnhancementBillingError("HTTP 402")).toBe(true);
    expect(isEnhancementBillingError("HTTP 429")).toBe(false);
    const guidance = explainEnhancementProviderError("gemini", "الرصيد غير كافٍ على Lovable Gateway");
    expect(guidance).toContain("مجاني فقط");
    expect(guidance).toContain("مفتاح Google API");
    expect(panel).toContain("if (billingBlocked) {");
    expect(panel).toContain("if (isEnhancementBillingError(String(data.error))) billingBlocked = true;");
    expect(panel).toContain("if (isEnhancementBillingError(detail)) billingBlocked = true;");
  });

  it("does not hide real Cerebras quota or authentication errors", () => {
    const error = "الرصيد غير كافٍ على Cerebras [cb=true]";
    expect(explainEnhancementProviderError("cerebras", error)).toBe(error);
    const missing = "مفتاح Cerebras API غير صالح";
    expect(explainEnhancementProviderError("cerebras", missing)).toBe(missing);
  });

  it("flags stale Gemini fallback and handles all enhancement error paths", () => {
    const msg = explainEnhancementProviderError("cerebras", 'لم يُكوَّن مفتاح Gemini');
    expect(msg).toContain("لا تُضف مفتاح Gemini");
    expect((panel.match(/explainEnhancementProviderError\(effectiveProvider,/g) || []).length).toBe(3);
  });
});
