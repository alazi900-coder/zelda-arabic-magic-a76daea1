import { describe, it, expect } from "vitest";
import { rebalanceTranslationLines } from "@/lib/balance-lines";

/**
 * rebalanceTranslationLines is the single entry point every "fix line
 * breaks" path (DeepDiagnosticPanel's single/batch/worker apply, plus
 * LineBalancePanel's orphan-line fix) now shares. Before it existed, every
 * one of those paths went straight to the word-based DP splitter, which
 * cannot represent a deliberately empty line — its splitter always gives
 * every target line at least one word — so a translation needing rebalance
 * silently lost any blank line the original used for paragraph spacing.
 */
describe("rebalanceTranslationLines", () => {
  it("preserves a deliberate blank paragraph break (real Platinum network-error text)", () => {
    // Verbatim from res/text/network_errors.json in the pret/pokeplatinum
    // decomp — a genuine in-game message with a blank line between paragraphs.
    const original =
      "A communication error has occurred.\n\nYou will be returned to the title\nscreen.\nPlease press the A Button.";
    // A translator wrote the four content lines but dropped the blank
    // separator between paragraph 1 and 2 — the realistic case this fixes.
    const translationMissingBlankLine =
      "حدث خطأ في الاتصال.\nسيتم إعادتك إلى شاشة\nالعنوان.\nالرجاء الضغط على زر A.";

    const result = rebalanceTranslationLines(original, translationMissingBlankLine, 5);
    const lines = result.split("\n");

    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe(""); // the blank paragraph separator, reproduced exactly
    expect(lines[0]).not.toBe("");
    expect(lines[2]).not.toBe("");
  });

  it("falls back to word-based splitting when the translation is fully squished (skeleton map can't apply)", () => {
    const original =
      "A communication error has occurred.\n\nYou will be returned to the title\nscreen.\nPlease press the A Button.";
    const squished = "حدث خطأ في الاتصال. سيتم إعادتك إلى شاشة العنوان. الرجاء الضغط على زر A.";

    const result = rebalanceTranslationLines(original, squished, 5);
    // No crash, no thrown error, and it actually redistributed into multiple lines
    // rather than leaving the single-line text untouched.
    expect(result.split("\n").length).toBeGreaterThan(1);
  });

  it("still respects Platinum's own {STRVAR_1 ...}/{COLOR N} tags as atomic units", () => {
    const original =
      "{STRVAR_1 74, 6, 0} {STRVAR_1 51, 7, 0}, 20{STRVAR_1 51, 5, 0}\n" +
      "A very mysterious\n" +
      "Pokémon Egg that came\n" +
      "from {COLOR 2}{STRVAR_1 4, 8, 0}{COLOR 0}.\n";
    const squished =
      "{STRVAR_1 74, 6, 0} {STRVAR_1 51, 7, 0}, 20{STRVAR_1 51, 5, 0} بيضة بوكيمون غامضة جداً جاءت من {COLOR 2}{STRVAR_1 4, 8, 0}{COLOR 0}.";

    const result = rebalanceTranslationLines(original, squished, 5);
    expect((result.match(/\{STRVAR_1 74, 6, 0\}/g) || []).length).toBe(1);
    expect((result.match(/\{COLOR 2\}/g) || []).length).toBe(1);
    expect((result.match(/\{COLOR 0\}/g) || []).length).toBe(1);
  });
});
