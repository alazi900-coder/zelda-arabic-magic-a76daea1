/**
 * Static-analysis test: ensures the translate-entries edge function uses a
 * single XC1_SYSTEM_PROMPT constant for ALL providers, with no leftover
 * duplicate / legacy hard-coded system prompts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EDGE_PATH = resolve(__dirname, "../../../supabase/functions/translate-entries/index.ts");
const SOURCE = readFileSync(EDGE_PATH, "utf8");

describe("translate-entries prompt consistency", () => {
  it("declares XC1_SYSTEM_PROMPT exactly once", () => {
    const matches = SOURCE.match(/const\s+XC1_SYSTEM_PROMPT\s*=/g) || [];
    expect(matches.length).toBe(1);
  });

  it("declares buildXC1UserPrompt exactly once", () => {
    const matches = SOURCE.match(/function\s+buildXC1UserPrompt\s*\(/g) || [];
    expect(matches.length).toBe(1);
  });

  it("references XC1_SYSTEM_PROMPT from at least every provider call site", () => {
    // OpenAI-compat path, Gemini direct path, Lovable AI path → 3 sites min.
    const refs = SOURCE.match(/XC1_SYSTEM_PROMPT/g) || [];
    // 1 declaration + at least 3 usages = 4
    expect(refs.length).toBeGreaterThanOrEqual(4);
  });

  it("does not contain legacy 'Xenoblade Chronicles 3' references in prompts", () => {
    // Allow comments mentioning XC3 for context, but no prompt literal.
    const promptLiterals = SOURCE.match(/Xenoblade Chronicles 3/g) || [];
    expect(promptLiterals.length).toBe(0);
  });

  it("does not duplicate the 'professional Xenoblade' system-prompt opener verbatim", () => {
    // Should appear exactly once — inside the XC1_SYSTEM_PROMPT constant.
    const opener = SOURCE.match(/professional Xenoblade Chronicles 1 \(Definitive Edition\) game text translator/g) || [];
    expect(opener.length).toBe(1);
  });

  it("mentions the JSON OUTPUT CONTRACT rule exactly once (no copy-paste leftovers)", () => {
    const contractMentions = SOURCE.match(/OUTPUT CONTRACT/g) || [];
    expect(contractMentions.length).toBe(1);
  });
});
