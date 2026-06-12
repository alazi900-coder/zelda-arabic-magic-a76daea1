/**
 * Integration tests for the MSBT safety pipeline used by `useEditorBuild.ts`.
 *
 * Strategy: the build hook is a large React hook that talks to IndexedDB and
 * an edge function, so a full `renderHook` run is impractical. Instead, this
 * file replays the *exact* MSBT pre-build loop from `useEditorBuild.ts`
 * (lines ~985-1028) on realistic MSBT entries and asserts the central
 * invariant the user reported:
 *
 *   "ترجمت ودمجت، فتحت الملف فوجدت الإنجليزية رجعت"
 *
 *   → No translated Arabic entry may end the pipeline equal to the English
 *     original. Either the Arabic text is kept (possibly repaired) or the
 *     entry is explicitly deleted with a reason — never silently reverted.
 *
 * If this loop ever drifts from the hook's actual logic, the
 * `build-safety-gates.test.ts` unit tests still lock the gate behaviour, and
 * the hook itself imports the same `evaluateMsbtSafety` helper used below.
 */
import { describe, it, expect } from "vitest";
import { evaluateMsbtSafety } from "@/lib/build-safety-gates";
import type { SafetyRepairEntry } from "@/hooks/useEditorBuild";

interface MsbtEntry {
  msbtFile: string;
  index: number;
  original: string;
  translation: string;
}

interface RunResult {
  nonEmptyTranslations: Record<string, string>;
  safetyRepairs: SafetyRepairEntry[];
  fixedTechnicalCount: number;
  skippedUnsafeCount: number;
}

/**
 * Replays the MSBT pre-build safety loop verbatim from `useEditorBuild.ts`.
 * Keep this in sync with that hook.
 */
function runMsbtPreBuild(entries: MsbtEntry[]): RunResult {
  const nonEmptyTranslations: Record<string, string> = {};
  for (const e of entries) if (e.translation.trim()) nonEmptyTranslations[`${e.msbtFile}:${e.index}`] = e.translation;

  const safetyRepairs: SafetyRepairEntry[] = [];
  let fixedTechnicalCount = 0;
  let skippedUnsafeCount = 0;

  for (const entry of entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    const trans = nonEmptyTranslations[key];
    if (!trans) continue;

    const result = evaluateMsbtSafety(entry.original, trans);
    const label = `${entry.msbtFile}#${entry.index}`;

    if (result.action === "delete") {
      // NEVER delete — keep the translation and report a critical warning.
      safetyRepairs.push({
        key, label, action: "repaired",
        reason: `⚠️ تحذير خطر — تم الاحتفاظ بالترجمة: ${result.reason || "بنية غير آمنة"}`,
        missingControl: 0, missingPua: 0,
      });
      nonEmptyTranslations[key] = result.text;
      continue;
    }

    if (result.action === "repair") {
      fixedTechnicalCount++;
      safetyRepairs.push({
        key, label, action: "repaired",
        reason: result.warnings.length > 0
          ? `إصلاح وسوم تقنية (${result.warnings.join(" / ")})`
          : "إصلاح وسوم تقنية",
        missingControl: 0, missingPua: 0,
      });
    } else if (result.warnings.length > 0) {
      safetyRepairs.push({
        key, label, action: "repaired",
        reason: `تم الاحتفاظ بالترجمة مع تنبيهات: ${result.warnings.join(" / ")}`,
        missingControl: 0, missingPua: 0,
      });
    }

    nonEmptyTranslations[key] = result.text;
  }

  return { nonEmptyTranslations, safetyRepairs, fixedTechnicalCount, skippedUnsafeCount };
}

// Realistic XC3 MSBT samples covering the failure modes the user reported.
const MSBT_SAMPLES: MsbtEntry[] = [
  // Clean translation — should pass through untouched.
  { msbtFile: "system.msbt", index: 0, original: "Save data loaded.", translation: "تم تحميل البيانات." },
  // $N variable preserved correctly.
  { msbtFile: "battle.msbt", index: 1, original: "Dealt $1 damage.", translation: "ألحق $1 ضررًا." },
  // $N variable mangled to "دولار1" — must be repaired, never reverted.
  { msbtFile: "battle.msbt", index: 2, original: "Gained $1 EXP.", translation: "حصلت على دولار1 نقطة خبرة." },
  // Missing control char (FFFA) — old code silently reverted to English.
  { msbtFile: "system.msbt", index: 3, original: "Hello\uFFFAworld", translation: "مرحبا عالم" },
  // Tag sequence flipped — must be auto-reordered, translation kept.
  {
    msbtFile: "story.msbt",
    index: 4,
    original: "Old man[XENO:wait wait=key ][XENO:act act=A ]is gone.",
    translation: "الرجل العجوز[XENO:act act=A ][XENO:wait wait=key ]رحل.",
  },
  // [Passive] technical tag with $N — combined gauntlet from real XC3 strings.
  {
    msbtFile: "skills.msbt",
    index: 5,
    original: "\\[Passive\\] Increases tension by $1 1[XENO:n] when battle starts.",
    translation: "\\[سلبي\\] يزيد التوتر بمقدار دولار1 عندما تبدأ المعركة.",
  },
  // Missing closing tag of optional type — must keep, not delete.
  { msbtFile: "ui.msbt", index: 6, original: "Press [XENO:n] to continue.", translation: "اضغط للمتابعة." },
  // PUA icons missing — kept with warnings.
  { msbtFile: "menu.msbt", index: 7, original: "\uE001 New Game", translation: "لعبة جديدة" },
  // Catastrophic NULL char — MUST be deleted (and reported).
  { msbtFile: "danger.msbt", index: 8, original: "Hello.", translation: "مرحبا\x00خطر" },
  // Catastrophic unbalanced brackets — MUST be deleted.
  { msbtFile: "danger.msbt", index: 9, original: "[Tag:x]Hi", translation: "[Tag:x]مرحبا]]]" },
  // Empty translation — should be skipped (not present in output map).
  { msbtFile: "system.msbt", index: 10, original: "Untranslated", translation: "" },
];

describe("useEditorBuild — MSBT pre-build safety (integration)", () => {
  const run = runMsbtPreBuild(MSBT_SAMPLES);

  it("never replaces a translated Arabic entry with the English original", () => {
    for (const entry of MSBT_SAMPLES) {
      if (!entry.translation.trim()) continue;
      const key = `${entry.msbtFile}:${entry.index}`;
      const out = run.nonEmptyTranslations[key];
      if (out === undefined) continue; // explicitly deleted — that's allowed
      expect(out, `silent revert detected for ${key}`).not.toBe(entry.original);
    }
  });

  it("keeps the clean Arabic translation untouched", () => {
    expect(run.nonEmptyTranslations["system.msbt:0"]).toBe("تم تحميل البيانات.");
  });

  it("repairs دولار1 → $1 instead of reverting", () => {
    const out = run.nonEmptyTranslations["battle.msbt:2"];
    expect(out).toContain("$1");
    expect(out).not.toContain("دولار");
    expect(out).not.toBe("Gained $1 EXP.");
  });

  it("keeps Arabic when a control char (\\uFFFA) is missing — no silent revert", () => {
    const out = run.nonEmptyTranslations["system.msbt:3"];
    expect(out).toContain("مرحبا");
    expect(out).not.toBe("Hello\uFFFAworld");
  });

  it("auto-reorders flipped XENO tags and keeps the translation", () => {
    const out = run.nonEmptyTranslations["story.msbt:4"];
    expect(out).toContain("الرجل");
    expect(out).toContain("العجوز");
    const waitIdx = out.indexOf("[XENO:wait");
    const actIdx = out.indexOf("[XENO:act");
    expect(waitIdx).toBeGreaterThanOrEqual(0);
    expect(actIdx).toBeGreaterThanOrEqual(0);
    expect(waitIdx).toBeLessThan(actIdx);
  });

  it("fixes [Passive] + دولار1 + tag mix in one pass", () => {
    const out = run.nonEmptyTranslations["skills.msbt:5"];
    expect(out).toContain("$1");
    expect(out).not.toContain("دولار");
    expect(out).toContain("\\[Passive\\]");
  });

  it("keeps Arabic when an optional closing tag is missing", () => {
    const out = run.nonEmptyTranslations["ui.msbt:6"];
    expect(out).toContain("اضغط");
    expect(out).not.toBe("Press [XENO:n] to continue.");
  });

  it("keeps Arabic when PUA icons are missing (with warnings)", () => {
    const out = run.nonEmptyTranslations["menu.msbt:7"];
    expect(out).toContain("لعبة جديدة");
    expect(out).not.toBe("\uE001 New Game");
  });

  it("DELETES entries with NULL char and reports them", () => {
    expect(run.nonEmptyTranslations["danger.msbt:8"]).toBeUndefined();
    const report = run.safetyRepairs.find(r => r.key === "danger.msbt:8");
    expect(report?.action).toBe("reverted");
    expect(report?.reason).toMatch(/NULL/);
  });

  it("DELETES entries with unbalanced brackets and reports them", () => {
    expect(run.nonEmptyTranslations["danger.msbt:9"]).toBeUndefined();
    const report = run.safetyRepairs.find(r => r.key === "danger.msbt:9");
    expect(report?.action).toBe("reverted");
    expect(report?.reason).toMatch(/أقواس/);
  });

  it("skips empty translations from the output map", () => {
    expect(run.nonEmptyTranslations["system.msbt:10"]).toBeUndefined();
  });

  it("reports exactly two catastrophic deletions for this sample set", () => {
    expect(run.skippedUnsafeCount).toBe(2);
  });

  it("reports repairs for entries that needed tag/variable fixes", () => {
    expect(run.fixedTechnicalCount).toBeGreaterThanOrEqual(2);
  });

  it("every non-deleted output remains non-empty Arabic text", () => {
    const arabic = /[\u0600-\u06FF]/;
    for (const [key, value] of Object.entries(run.nonEmptyTranslations)) {
      expect(value.length, `empty output for ${key}`).toBeGreaterThan(0);
      expect(arabic.test(value), `output not Arabic for ${key}: ${value}`).toBe(true);
    }
  });
});

describe("useEditorBuild — bulk fuzz (no silent reverts across 100 entries)", () => {
  // Generate 100 synthetic MSBT entries mixing every failure mode and ensure
  // not a single one ever becomes the English original silently.
  const fuzz: MsbtEntry[] = [];
  const templates = [
    (i: number) => ({ o: `Message ${i}`, t: `رسالة ${i}` }),
    (i: number) => ({ o: `Got $1 gold #${i}`, t: `حصلت على دولار1 ذهب #${i}` }),
    (i: number) => ({ o: `Hello\uFFFAworld #${i}`, t: `مرحبا عالم #${i}` }),
    (i: number) => ({ o: `[XENO:n] line ${i}`, t: `سطر ${i}` }),
    (i: number) => ({ o: `${String.fromCharCode(0xE000 + (i % 10))} icon ${i}`, t: `أيقونة ${i}` }),
    (i: number) => ({
      o: `[XENO:wait wait=k ][XENO:act act=A ]hi ${i}`,
      t: `[XENO:act act=A ][XENO:wait wait=k ]مرحبا ${i}`,
    }),
  ];
  for (let i = 0; i < 100; i++) {
    const t = templates[i % templates.length](i);
    fuzz.push({ msbtFile: `fuzz_${i % 5}.msbt`, index: i, original: t.o, translation: t.t });
  }

  const run = runMsbtPreBuild(fuzz);

  it("no fuzz entry ends up as the English original", () => {
    for (const entry of fuzz) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const out = run.nonEmptyTranslations[key];
      if (out === undefined) continue;
      expect(out, `silent revert for ${key}`).not.toBe(entry.original);
    }
  });

  it("no entry was catastrophically deleted in the fuzz set", () => {
    expect(run.skippedUnsafeCount).toBe(0);
  });

  it("all 100 fuzz outputs are present and Arabic", () => {
    expect(Object.keys(run.nonEmptyTranslations)).toHaveLength(100);
    const arabic = /[\u0600-\u06FF]/;
    for (const v of Object.values(run.nonEmptyTranslations)) {
      expect(arabic.test(v)).toBe(true);
    }
  });
});
