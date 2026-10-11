import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  GOLDEN_SUN_2_SYSTEM_PROMPT,
  goldenSunCodeSequence,
  goldenSunCodesUnchanged,
  goldenSunAllTechnicalTagsUnchanged,
  hasExactMaskedTechnicalSequence,
} from "../../supabase/functions/_shared/goldensun-cerebras";

const source = (file: string) => readFileSync(file, "utf8");

describe("Cerebras Golden Sun: The Lost Age safety", () => {
  it("uses Golden Sun II's cast, not Xenoblade lore", () => {
    expect(GOLDEN_SUN_2_SYSTEM_PROMPT).toContain("Golden Sun: The Lost Age");
    expect(GOLDEN_SUN_2_SYSTEM_PROMPT).toContain("Felix");
    expect(GOLDEN_SUN_2_SYSTEM_PROMPT).toContain("Jenna");
    expect(GOLDEN_SUN_2_SYSTEM_PROMPT).toContain("Sheba");
    expect(GOLDEN_SUN_2_SYSTEM_PROMPT).toContain("Piers");
    expect(GOLDEN_SUN_2_SYSTEM_PROMPT).toContain("Modern Standard Arabic");
    expect(GOLDEN_SUN_2_SYSTEM_PROMPT).toContain("TAG_N");
  });

  it("recognizes Golden Sun control codes in order", () => {
    expect(goldenSunCodeSequence("Hey\\x03there\\x1e")).toEqual(["\\x03", "\\x1e"]);
  });

  it("preserves Arabic translation with unmodified code sequence", () => {
    expect(goldenSunCodesUnchanged("Felix\\x03Are you ready?\\x1E", "فيليكس\\x03هل أنت مستعد؟\\x1E")).toBe(true);
  });

  it("rejects missing, moved, repeated, malformed and substituted codes", () => {
    const original = "Felix\\x03Are you ready?\\x1e";
    expect(goldenSunCodesUnchanged(original, "فيليكس، هل أنت مستعد؟\\x1e")).toBe(false);
    expect(goldenSunCodesUnchanged(original, "\\x1eفيليكس\\x03هل أنت مستعد؟")).toBe(false);
    expect(goldenSunCodesUnchanged(original, "فيليكس\\x03هل أنت مستعد؟\\x02")).toBe(false);
    expect(goldenSunCodesUnchanged(original, "فيليكس\\x03هل أنت مستعد؟\\x1e\\x1e")).toBe(false);
    expect(goldenSunCodesUnchanged(original, "فيليكس\\x0Zهل أنت مستعد؟\\x1e")).toBe(false);
  });

  it("rejects invented or lost markup tags and unintended physical line breaks", () => {
    expect(goldenSunAllTechnicalTagsUnchanged(
      "Felix\\x03[name] wait {party:id}",
      "فيليكس\\x03[name] انتظر {party:id}",
    )).toBe(true);
    expect(goldenSunAllTechnicalTagsUnchanged(
      "Felix\\x03[name] wait {party:id}",
      "فيليكس\\x03 انتظر {party:id}",
    )).toBe(false);
    expect(goldenSunAllTechnicalTagsUnchanged(
      "Felix\\x03[name] wait {party:id}",
      "فيليكس\\x03[name] انتظر {party:id} <b>",
    )).toBe(false);
    expect(goldenSunAllTechnicalTagsUnchanged(
      "Hi\\x03there",
      "مرحباً\\x03\nكيف الحال",
    )).toBe(false);
  });

  it("preserves repeated placeholders, line breaks, count and order", () => {
    expect(hasExactMaskedTechnicalSequence(
      "TAG_0 Hello TAG_1 NEWLINE_2 fine TAG_0",
      "TAG_0 مرحباً TAG_1 NEWLINE_2 جيد TAG_0",
    )).toBe(true);
    expect(hasExactMaskedTechnicalSequence(
      "TAG_0 Hello TAG_1 NEWLINE_2",
      "TAG_0 مرحباً NEWLINE_2 TAG_1",
    )).toBe(false);
    expect(hasExactMaskedTechnicalSequence("TAG_0 Hello TAG_1", "TAG_0 مرحباً")).toBe(false);
    expect(hasExactMaskedTechnicalSequence("TAG_0 Hello TAG_1", "TAG_0 مرحباً TAG_1 TAG_1")).toBe(false);
  });

  it("pins Cerebras translation to the official model and correct game prompts", () => {
    const backend = source("supabase/functions/translate-entries/index.ts");
    expect(backend).toContain("provider === 'cerebras'");
    expect(backend).toContain("'https://api.cerebras.ai/v1'");
    expect(backend).toContain("'gpt-oss-120b'");
    expect(backend).toContain("GOLDEN_SUN_2_SYSTEM_PROMPT");
    expect(backend).toContain("hasExactMaskedTechnicalSequence(item.pe.cleaned, translated)");
    expect(backend).toContain("goldenSunAllTechnicalTagsUnchanged(item.entry.original, output)");
  });

  it("keeps Cerebras session key out of localStorage and tests via API", () => {
    const settings = source("src/hooks/useEditorSettings.ts");
    expect(settings).toContain("const [userCerebrasKey, setUserCerebrasKey] = useState('')");
    expect(settings).not.toContain("localStorage.setItem('userCerebrasKey'");
    const ui = source("src/components/editor/EditorProviderSelection.tsx");
    expect(ui).toContain("handleTestConnection('cerebras')");
    expect(ui).toContain("editor.setAiModel('gpt-oss-120b')");
    const state = source("src/hooks/useEditorState.ts");
    expect(state).toContain("userCerebrasKey");
    const autopilot = source("src/hooks/useAutoPilot.ts");
    expect(autopilot).toContain("prov === 'cerebras'");
    const enhance = source("supabase/functions/enhance-translations/index.ts");
    expect(enhance).toContain("if (isCerebras)");
    expect(enhance).toContain("'https://api.cerebras.ai/v1/chat/completions'");
  });
});
