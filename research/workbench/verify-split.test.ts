import { describe, it, expect } from "vitest";
import { splitEvenlyByLines, balanceLines } from "@/lib/balance-lines";
import { countEffectiveLines } from "@/lib/text-tokens";

describe("real Platinum egg-message verification", () => {
  const original =
    "{STRVAR_1 74, 6, 0} {STRVAR_1 51, 7, 0}, 20{STRVAR_1 51, 5, 0}\n" +
    "A very mysterious\n" +
    "Pokémon Egg that came\n" +
    "from {COLOR 2}{STRVAR_1 4, 8, 0}{COLOR 0}.\n";

  it("original has 4 effective lines", () => {
    expect(countEffectiveLines(original)).toBe(4);
  });

  it("splitEvenlyByLines rebalances a squished Arabic translation into 4 lines without breaking any tag", () => {
    // Simulates the real bug report: translation collapsed onto fewer lines
    // than the English original, needing the deep-diagnostic "line_breaks"
    // auto-fix to redistribute it.
    const squished =
      "{STRVAR_1 74, 6, 0} {STRVAR_1 51, 7, 0}, 20{STRVAR_1 51, 5, 0} بيضة بوكيمون غامضة جداً جاءت من {COLOR 2}{STRVAR_1 4, 8, 0}{COLOR 0}.";

    const englishLineCount = countEffectiveLines(original);
    const result = splitEvenlyByLines(squished, englishLineCount);
    const lines = result.split("\n");

    console.log("--- englishLineCount:", englishLineCount);
    console.log("--- result:\n" + result);
    console.log("--- lines:", JSON.stringify(lines, null, 2));

    expect(lines.length).toBe(englishLineCount);
    // Every tag must survive intact, exactly once, nowhere split.
    expect((result.match(/\{STRVAR_1 74, 6, 0\}/g) || []).length).toBe(1);
    expect((result.match(/\{STRVAR_1 51, 7, 0\}/g) || []).length).toBe(1);
    expect((result.match(/\{STRVAR_1 51, 5, 0\}/g) || []).length).toBe(1);
    expect((result.match(/\{STRVAR_1 4, 8, 0\}/g) || []).length).toBe(1);
    expect((result.match(/\{COLOR 2\}/g) || []).length).toBe(1);
    expect((result.match(/\{COLOR 0\}/g) || []).length).toBe(1);
    // No line may contain a broken/partial tag fragment.
    expect(result).not.toMatch(/\{STRVAR_1[^}]*$/m);
    expect(result).not.toMatch(/^\d+,?\s*\d*\}/m);
  });

  it("balanceLines (no explicit target line count) also keeps tags atomic", () => {
    const squished =
      "{STRVAR_1 74, 6, 0} {STRVAR_1 51, 7, 0}, 20{STRVAR_1 51, 5, 0} بيضة بوكيمون غامضة جداً جاءت من {COLOR 2}{STRVAR_1 4, 8, 0}{COLOR 0}.";
    const result = balanceLines(squished);
    console.log("--- balanceLines result:\n" + result);
    expect((result.match(/\{STRVAR_1 74, 6, 0\}/g) || []).length).toBe(1);
    expect((result.match(/\{COLOR 2\}/g) || []).length).toBe(1);
    expect((result.match(/\{COLOR 0\}/g) || []).length).toBe(1);
  });
});
