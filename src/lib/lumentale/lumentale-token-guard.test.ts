import { describe, expect, it } from "vitest";
import { lumentaleTechnicalTokens, validateLumenTaleTranslation } from "./lumentale-token-guard";
import { preservesLumenTaleTechnicalTokenSequence } from "../../../supabase/functions/_shared/lumentale-token-guard";

describe("LumenTale technical token guard", () => {
  const source = String.raw`Hello {0}, <color=yellow>{player}</color>\\n[INPUT:Jump] %1$s`;

  it("accepts an exact ordered set of placeholders, rich text, escape, input and printf tokens", () => {
    const translation = String.raw`مرحباً {0}، <color=yellow>{player}</color>\\n[INPUT:Jump] %1$s`;
    expect(lumentaleTechnicalTokens(source)).toEqual([
      "{0}", "<color=yellow>", "{player}", "</color>", "\\n", "[INPUT:Jump]", "%1$s",
    ]);
    expect(validateLumenTaleTranslation(source, translation)).toBeNull();
  });

  it("rejects a translation that deletes a protected token", () => {
    expect(validateLumenTaleTranslation(source, String.raw`مرحباً {0}، <color=yellow>{player}</color>\\n[INPUT:Jump]`)).not.toBeNull();
  });

  it("rejects a translation that translates a named placeholder", () => {
    expect(validateLumenTaleTranslation(source, String.raw`مرحباً {0}، <color=yellow>{اللاعب}</color>\\n[INPUT:Jump] %1$s`)).not.toBeNull();
  });

  it("rejects a translation that changes the original token order", () => {
    expect(validateLumenTaleTranslation(source, String.raw`مرحباً {0}، <color=yellow>{player}</color>\\n%1$s [INPUT:Jump]`)).not.toBeNull();
  });

  it("guards generic Unity closing tags and key-value control tokens", () => {
    const controlSource = "Press [Key=Confirm] <b>Now</b></>";
    expect(validateLumenTaleTranslation(controlSource, "اضغط [Key=Confirm] <b>الآن</b></>")).toBeNull();
    expect(validateLumenTaleTranslation(controlSource, "اضغط [Key=تأكيد] <b>الآن</b></>")).not.toBeNull();
  });

  describe("AI enhancement contract", () => {
    const enhancementSource = String.raw`<h>{0.Nickname}</h> [Q_RESULT] <sprite name="answer">\n%1$s`;
    const validEnhancement = String.raw`<h>{0.Nickname}</h> [Q_RESULT] <sprite name="answer">\n%1$s حسّن النص`;

    const expectBothGuards = (candidate: string, expected: boolean) => {
      expect(validateLumenTaleTranslation(enhancementSource, candidate) === null).toBe(expected);
      expect(preservesLumenTaleTechnicalTokenSequence(enhancementSource, candidate)).toBe(expected);
    };

    it("accepts a valid suggestion with every protected token in order", () => {
      expectBothGuards(validEnhancement, true);
    });

    it("rejects a suggestion that removes the closing <h> tag", () => {
      expectBothGuards(String.raw`<h>{0.Nickname} [Q_RESULT] <sprite name="answer">\n%1$s`, false);
    });

    it("rejects a suggestion that swaps the opening and closing <h> tags", () => {
      expectBothGuards(String.raw`</h>{0.Nickname}<h> [Q_RESULT] <sprite name="answer">\n%1$s`, false);
    });

    it("rejects changing a placeholder value or dropping a bracket control token", () => {
      expectBothGuards(String.raw`<h>{0.DisplayName}</h> [Q_RESULT] <sprite name="answer">\n%1$s`, false);
      expectBothGuards(String.raw`<h>{0.Nickname}</h> <sprite name="answer">\n%1$s`, false);
    });

    it("rejects a missing sprite, escape, or printf token", () => {
      expectBothGuards(String.raw`<h>{0.Nickname}</h> [Q_RESULT] \n%1$s`, false);
      expectBothGuards(String.raw`<h>{0.Nickname}</h> [Q_RESULT] <sprite name="answer">%1$s`, false);
      expectBothGuards(String.raw`<h>{0.Nickname}</h> [Q_RESULT] <sprite name="answer">\n`, false);
    });
  });
});
