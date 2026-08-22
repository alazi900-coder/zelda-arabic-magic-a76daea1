import { describe, expect, it } from "vitest";
import { lumentaleTechnicalTokens, validateLumenTaleTranslation } from "./lumentale-token-guard";

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
});
