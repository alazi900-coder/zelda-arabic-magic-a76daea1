/**
 * INTEGRATION TEST — full translation post-processing pipeline.
 *
 * Pipeline order (mirrors what runs in production):
 *   1. AI returns Arabic text (with noise: \n, extra spaces, punctuation, engine tags)
 *   2. Edge function: stripNewlines (replace \n/\r/multi-space with single space)
 *   3. Edge function: validate placeholders (⟪T#⟫ + TAG_n) → quality stats
 *   4. Frontend: protectTags → splitEvenlyByLines → restoreTags
 *
 * Goal: prove ⟪T#⟫ glossary placeholders SURVIVE end-to-end under noise.
 */
import { describe, it, expect } from "vitest";
import { protectTags, restoreTags } from "@/lib/xc3-tag-protection";
import { splitEvenlyByLines } from "@/lib/balance-lines";

// ─── Step 2: edge cleanup ────────────────────────────────────────────────
function stripNewlinesInValues(s: string): string {
  return s.replace(/\r\n|\r|\n/g, " ").replace(/[ \t]{2,}/g, " ").trim();
}

// ─── Step 3: edge placeholder validation ─────────────────────────────────
const TAG_RE = /(TAG_\d+|⟪T\d+⟫)/g;
const tagSet = (s: string) => (s.match(TAG_RE) || []).slice().sort().join("|");

interface PipelineResult {
  finalText: string;
  placeholdersOk: boolean;
  expectedTags: string;
  actualTags: string;
}

/** Run a single entry through the full pipeline and report the outcome. */
function runPipeline(original: string, aiOutput: string, targetLines = 1): PipelineResult {
  // 2. Edge cleanup
  const cleaned = stripNewlinesInValues(aiOutput);

  // 3. Edge validation (snapshot tags BEFORE frontend processing)
  const expectedTags = tagSet(original);
  const actualTagsAfterClean = tagSet(cleaned);

  // 4. Frontend: protect engine tags → balance lines → restore
  const { cleanText, tags } = protectTags(cleaned);
  const balanced = targetLines > 1 ? splitEvenlyByLines(cleanText, targetLines) : cleanText;
  const finalText = restoreTags(balanced, tags);

  // Re-validate after frontend processing — placeholders must STILL match
  const actualTagsFinal = tagSet(finalText);

  return {
    finalText,
    placeholdersOk: expectedTags === actualTagsAfterClean && expectedTags === actualTagsFinal,
    expectedTags,
    actualTags: actualTagsFinal,
  };
}

describe("integration: ⟪T#⟫ survives the full pipeline under noise", () => {
  it("survives a single ⟪T0⟫ wrapped in newlines and extra spaces", () => {
    const r = runPipeline(
      "Hello ⟪T0⟫ welcome",
      "أهلاً\n\n   ⟪T0⟫   \nمرحباً",
    );
    expect(r.placeholdersOk).toBe(true);
    expect(r.actualTags).toBe("⟪T0⟫");
    expect(r.finalText).toContain("⟪T0⟫");
  });

  it("survives multiple ⟪T#⟫ when AI used noisy punctuation around them", () => {
    const r = runPipeline(
      "Use ⟪T0⟫ then ⟪T1⟫ to win",
      "استخدم،  ⟪T0⟫.\nثم  ⟪T1⟫!  للفوز",
    );
    expect(r.placeholdersOk).toBe(true);
    expect(r.actualTags).toBe("⟪T0⟫|⟪T1⟫");
  });

  it("survives ⟪T#⟫ alongside engine tags like [ML] and {var}", () => {
    const r = runPipeline(
      "Hi [ML] ⟪T0⟫, lvl {level}",
      "مرحباً [ML] ⟪T0⟫،\nالمستوى {level}",
    );
    expect(r.placeholdersOk).toBe(true);
    expect(r.finalText).toContain("⟪T0⟫");
    expect(r.finalText).toContain("[ML]");
    expect(r.finalText).toContain("{level}");
  });

  it("survives ⟪T#⟫ across multi-line balance (splitEvenlyByLines)", () => {
    const r = runPipeline(
      "Welcome ⟪T0⟫ to the realm of ⟪T1⟫",
      "أهلاً ⟪T0⟫ في عالم ⟪T1⟫ الواسع المليء بالمغامرات الرائعة",
      2, // force balance into 2 lines
    );
    expect(r.placeholdersOk).toBe(true);
    expect(r.actualTags).toBe("⟪T0⟫|⟪T1⟫");
  });

  it("mixed TAG_n + ⟪T#⟫ all survive under maximum noise", () => {
    const r = runPipeline(
      "TAG_0 says ⟪T0⟫ and TAG_1 replies ⟪T1⟫",
      "TAG_0 يقول   ⟪T0⟫  ،\n\nو TAG_1 يرد:  ⟪T1⟫ .",
    );
    expect(r.placeholdersOk).toBe(true);
    expect(r.actualTags).toBe("TAG_0|TAG_1|⟪T0⟫|⟪T1⟫");
  });

  it("REJECTS the pipeline result if AI dropped ⟪T1⟫ entirely", () => {
    const r = runPipeline(
      "A ⟪T0⟫ B ⟪T1⟫",
      "أ   ⟪T0⟫   ب", // ⟪T1⟫ missing — pipeline must NOT silently fix this
    );
    expect(r.placeholdersOk).toBe(false);
    expect(r.expectedTags).toBe("⟪T0⟫|⟪T1⟫");
    expect(r.actualTags).toBe("⟪T0⟫");
  });

  it("REJECTS when AI hallucinated ⟪T9⟫ that wasn't in source", () => {
    const r = runPipeline("Hi ⟪T0⟫", "أهلاً ⟪T0⟫\n⟪T9⟫!");
    expect(r.placeholdersOk).toBe(false);
    expect(r.actualTags).toBe("⟪T0⟫|⟪T9⟫");
  });

  it("preserves ⟪T#⟫ even when AI emitted CRLF (Windows-style) line endings", () => {
    const r = runPipeline("⟪T0⟫ done", "⟪T0⟫\r\nانتهى");
    expect(r.placeholdersOk).toBe(true);
    expect(r.finalText).not.toContain("\n");
    expect(r.finalText).not.toContain("\r");
  });
});
