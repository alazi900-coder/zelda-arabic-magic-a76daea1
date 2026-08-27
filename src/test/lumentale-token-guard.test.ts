import {
  compareLumenTaleTechnicalTokens,
  describeLumenTaleTokenDifference,
  validateLumenTaleTranslation,
} from "@/lib/lumentale/lumentale-token-guard";

describe("LumenTale technical-token contract", () => {
  it("accepts the identical token sequence, including repeated tags", () => {
    const original = "<h>{0}</h> حصل على [USERNAME] بنسبة %2$s\\n";
    const translation = "حصل <h>{0}</h> على [USERNAME] بنسبة %2$s\\n";

    expect(compareLumenTaleTechnicalTokens(original, translation)).toMatchObject({
      source: ["<h>", "{0}", "</h>", "[USERNAME]", "%2$s", "\\n"],
      translation: ["<h>", "{0}", "</h>", "[USERNAME]", "%2$s", "\\n"],
      valid: true,
    });
    expect(validateLumenTaleTranslation(original, translation)).toBeNull();
  });

  it("reports missing and unexpected tokens without modifying either text", () => {
    const comparison = compareLumenTaleTechnicalTokens(
      "<color=red>{0}</color> [USERNAME]",
      "<color=blue>{0}</color>",
    );

    expect(comparison).toMatchObject({
      missing: ["<color=red>", "[USERNAME]"],
      unexpected: ["<color=blue>"],
      reordered: false,
      valid: false,
    });
    expect(describeLumenTaleTokenDifference(comparison)).toMatch(/مفقودة/);
    expect(describeLumenTaleTokenDifference(comparison)).toMatch(/زائدة أو متغيرة/);
  });

  it("rejects a reordered sequence even when no token is missing", () => {
    const comparison = compareLumenTaleTechnicalTokens("<h>{0}</h>", "{0}<h></h>");

    expect(comparison).toMatchObject({ missing: [], unexpected: [], reordered: true, valid: false });
    expect(validateLumenTaleTranslation("<h>{0}</h>", "{0}<h></h>")).toMatch(/ترتيب الوسوم تغيّر/);
  });
});
