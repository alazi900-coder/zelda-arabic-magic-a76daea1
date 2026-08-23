import { describe, expect, test } from "vitest";
import { prepareLumenTaleLocalizedText } from "./lumentale-arabic-build-text";
import { lumentaleTechnicalTokens, validateLumenTaleTranslation } from "./lumentale-token-guard";

describe("LumenTale Arabic bundle text preparation", () => {
  test("keeps pause commands byte-for-byte instead of reversing them into visible text", () => {
    const source = "انتظر <pause=1> ثم تابع";
    const prepared = prepareLumenTaleLocalizedText(source);

    expect(prepared).toContain("<pause=1>");
    expect(prepared).not.toContain(">1=esuap<");
    expect(validateLumenTaleTranslation(source, prepared)).toBeNull();
  });

  test("keeps the source-order sequence of mixed runtime tokens after Arabic shaping", () => {
    const source = "ابدأ <h> الآن </h> {0.Nickname} [Q_RESULT] <sprite name=heart>\\n%d";
    const prepared = prepareLumenTaleLocalizedText(source);

    expect(lumentaleTechnicalTokens(prepared)).toEqual(lumentaleTechnicalTokens(source));
    expect(validateLumenTaleTranslation(source, prepared)).toBeNull();
  });
});
