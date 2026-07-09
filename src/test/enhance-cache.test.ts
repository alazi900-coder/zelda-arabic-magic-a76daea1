import { describe, it, expect } from "vitest";
import { makeEnhanceCacheKey } from "@/lib/enhance-cache";

describe("makeEnhanceCacheKey", () => {
  it("produces the same key for identical inputs", () => {
    const a = makeEnhanceCacheKey("Hello", "مرحباً", "enhance~gemini-2.5-flash~ruleA,ruleB");
    const b = makeEnhanceCacheKey("Hello", "مرحباً", "enhance~gemini-2.5-flash~ruleA,ruleB");
    expect(a).toBe(b);
  });

  it("changes when the original text changes", () => {
    const ctx = "enhance~gemini-2.5-flash~ruleA";
    expect(makeEnhanceCacheKey("Hello", "مرحباً", ctx)).not.toBe(makeEnhanceCacheKey("Hi", "مرحباً", ctx));
  });

  it("changes when the translation changes", () => {
    const ctx = "enhance~gemini-2.5-flash~ruleA";
    expect(makeEnhanceCacheKey("Hello", "مرحباً", ctx)).not.toBe(makeEnhanceCacheKey("Hello", "أهلاً", ctx));
  });

  it("changes when the context signature changes (model/mode/rules)", () => {
    expect(makeEnhanceCacheKey("Hello", "مرحباً", "enhance~gemini-2.5-flash~ruleA"))
      .not.toBe(makeEnhanceCacheKey("Hello", "مرحباً", "grammar~gemini-2.5-flash~ruleA"));
  });

  it("trims surrounding whitespace from text but not the context signature", () => {
    const ctx = "enhance~gemini-2.5-flash~ruleA";
    expect(makeEnhanceCacheKey("  Hello  ", "  مرحباً  ", ctx)).toBe(makeEnhanceCacheKey("Hello", "مرحباً", ctx));
  });
});
