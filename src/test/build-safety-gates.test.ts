/**
 * Regression tests for build safety gates.
 *
 * These tests lock in the invariant: TRANSLATIONS ARE NEVER SILENTLY
 * REPLACED WITH ENGLISH. If anyone re-introduces a silent-revert path
 * in `useEditorBuild.ts`, these tests will fail.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateMsbtSafety,
  evaluateDollarVarGate,
  evaluateControlPuaGate,
} from "@/lib/build-safety-gates";

describe("evaluateMsbtSafety — MSBT hard gate", () => {
  it("keeps a clean Arabic translation with all tags intact", () => {
    const r = evaluateMsbtSafety("Hello [System:PageBreak] world", "مرحبا [System:PageBreak] عالم");
    expect(r.action).not.toBe("delete");
    expect(r.text).toContain("مرحبا");
    expect(r.text).toContain("[System:PageBreak]");
  });

  it("DELETES translation containing NULL char (catastrophic)", () => {
    const r = evaluateMsbtSafety("Hello", "مرحبا\x00خطر");
    expect(r.action).toBe("delete");
    expect(r.reason).toMatch(/NULL/);
  });

  it("DELETES translation with unbalanced brackets", () => {
    const r = evaluateMsbtSafety("Hello [System:n]", "مرحبا [System:n");
    expect(r.action).toBe("delete");
    expect(r.reason).toMatch(/أقواس/);
  });

  it("DELETES translation with surplus closing Ruby tags that repair can't fix", () => {
    // Repair restores missing closes, but here we have MORE closes than opens.
    const r = evaluateMsbtSafety(
      "[System:Ruby ruby=x]Hi[/System:Ruby]",
      "مرحبا[/System:Ruby][/System:Ruby]"
    );
    expect(r.action).toBe("delete");
  });


  // === Regression tests for the silent-revert bug ===

  it("REGRESSION: keeps translation with missing control char (no silent revert)", () => {
    // Original has U+FFFA control char. Translation drops it.
    // Old behaviour: deleted entry → English fallback. New behaviour: kept.
    const r = evaluateMsbtSafety("Hello\uFFFAworld", "مرحبا عالم");
    expect(r.action).not.toBe("delete");
    expect(r.text).toContain("مرحبا");
  });


  it("REGRESSION: keeps translation with wrong tag sequence (no silent revert)", () => {
    const r = evaluateMsbtSafety(
      "[XENO:wait][XENO:act act=A]hi",
      "[XENO:act act=A][XENO:wait]مرحبا"
    );
    expect(r.action).not.toBe("delete");
    expect(r.text).toContain("مرحبا");
  });

  it("REGRESSION: keeps translation with missing closing tag of optional type", () => {
    // exactTagMatch may be false but no hard failure → must keep.
    const r = evaluateMsbtSafety("Hello [XENO:n] world", "مرحبا عالم");
    expect(r.action).not.toBe("delete");
    expect(r.text).toContain("مرحبا");
  });

  it("REGRESSION: never returns 'delete' purely because of tag count mismatch", () => {
    const cases: Array<[string, string]> = [
      ["[Tag:1] hi [Tag:2]", "مرحبا"],
      ["[a] [b] [c]", "[a] مرحبا"],
      ["a\uFFFBb\uFFFCc", "مرحبا"],
    ];
    for (const [orig, trans] of cases) {
      const r = evaluateMsbtSafety(orig, trans);
      expect(r.action, `should not delete: ${orig} → ${trans}`).not.toBe("delete");
    }
  });
});

describe("evaluateDollarVarGate — $N variable gate", () => {
  it("keeps translation that preserves all $N vars", () => {
    const r = evaluateDollarVarGate("You earned $1 points", "حصلت على $1 نقطة");
    expect(r.action).toBe("keep");
    expect(r.text).toBe("حصلت على $1 نقطة");
  });

  it("keeps translation when original has no $N vars", () => {
    const r = evaluateDollarVarGate("Hello world", "مرحبا عالم");
    expect(r.action).toBe("keep");
  });

  it("REPAIRS دولار1 → $1 (no revert)", () => {
    const r = evaluateDollarVarGate("Gained $1 EXP", "حصلت على دولار1 نقطة");
    expect(r.action).toBe("repair");
    expect(r.text).toContain("$1");
    expect(r.text).not.toContain("دولار");
  });

  it("REVERTS only when $N is unrepairable", () => {
    const r = evaluateDollarVarGate("Deals $1 damage to $2", "يسبب ضرراً");
    expect(r.action).toBe("revert");
    expect(r.text).toBe("Deals $1 damage to $2");
    expect(r.reason).toBeTruthy();
  });

  it("REGRESSION: tries repair BEFORE reverting (no premature revert)", () => {
    // The old Protection 5 reverted immediately without attempting repair.
    // This test ensures repair is attempted first.
    const r = evaluateDollarVarGate("Got $1 gold", "حصلت على 1.$ ذهب");
    expect(r.action).toBe("repair");
    expect(r.text).toContain("$1");
  });
});

describe("evaluateControlPuaGate — final control/PUA gate", () => {
  it("keeps translation that preserves all control chars", () => {
    const r = evaluateControlPuaGate("a\uFFFAb", "أ\uFFFAب");
    expect(r.action).toBe("keep");
    expect(r.text).toBe("أ\uFFFAب");
  });

  it("REGRESSION: never reverts to English even when control chars are missing", () => {
    // The old code reverted to English when `repair.changed === false`.
    // The new gate keeps the user's translation no matter what.
    const r = evaluateControlPuaGate("Hello\uFFFAworld", "مرحبا عالم");
    expect(r.text).toContain("مرحبا");
    expect(r.text).not.toBe("Hello\uFFFAworld");
  });


  it("REGRESSION: never returns the English original", () => {
    // Iterate over many shapes — none should produce English-as-text output.
    const cases: Array<[string, string]> = [
      ["Hi\uFFFA", "مرحبا"],
      ["a\uE001b", "أب"],
      ["x\uFFFBy\uE000z", "س"],
    ];
    for (const [orig, trans] of cases) {
      const r = evaluateControlPuaGate(orig, trans);
      expect(r.text, `gate should not return English for: ${orig}`).not.toBe(orig);
    }
  });
});

describe("Silent-revert invariant (cross-gate)", () => {
  it("a translated Arabic string is never silently replaced with English by any gate", () => {
    const original = "Hello [XENO:n] $1 world\uFFFA";
    const translation = "مرحبا [XENO:n] $1 عالم\uFFFA";

    const msbt = evaluateMsbtSafety(original, translation);
    expect(msbt.text).toContain("مرحبا");
    expect(msbt.action).not.toBe("delete");

    const dollar = evaluateDollarVarGate(original, translation);
    expect(dollar.text).toContain("مرحبا");
    expect(dollar.action).toBe("keep");

    const ctrl = evaluateControlPuaGate(original, translation);
    expect(ctrl.text).toContain("مرحبا");
  });
});
