/**
 * Mirror tests for the edge-function post-processing in
 * `supabase/functions/translate-entries/index.ts`:
 *   - `stripNewlinesInValues`
 *   - `computeQualityStats`
 *
 * The functions are duplicated here (kept in sync) so we can lock the
 * INVARIANTS without spinning up a Deno runtime. If the edge function logic
 * changes, copy the new logic here AND update the assertions deliberately.
 */
import { describe, it, expect } from "vitest";

// ─── Mirror of edge-function `stripNewlinesInValues` ──────────────────
function stripNewlinesInValues(translations: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(translations)) {
    if (typeof v !== "string") { out[k] = v as unknown as string; continue; }
    out[k] = v.replace(/\r\n|\r|\n/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  }
  return out;
}

// ─── Mirror of edge-function `computeQualityStats` ────────────────────
interface BQError { key: string; reason: string; sample?: string }
interface BQStats {
  total: number; returned: number; validJson: boolean;
  withArabic: number; placeholdersOk: number; newlineStripped: number;
  errors: BQError[];
}
const ARABIC_RE = /[\u0600-\u06FF]/;
const TAG_RE = /(TAG_\d+|⟪T\d+⟫)/g;

function computeQualityStats(
  requested: { key: string; original: string }[],
  rawTranslations: Record<string, string>,
  cleanedTranslations: Record<string, string>,
): BQStats {
  const errors: BQError[] = [];
  let withArabic = 0, placeholdersOk = 0, newlineStripped = 0;

  for (const entry of requested) {
    const raw = rawTranslations[entry.key];
    const cleaned = cleanedTranslations[entry.key];
    if (cleaned === undefined || cleaned === null || cleaned === "") {
      errors.push({ key: entry.key, reason: "missing", sample: entry.original.slice(0, 80) });
      continue;
    }
    if (ARABIC_RE.test(cleaned)) withArabic++;
    else errors.push({ key: entry.key, reason: "no-arabic", sample: cleaned.slice(0, 80) });

    const expected = (entry.original.match(TAG_RE) || []).sort().join("|");
    const actual   = (cleaned.match(TAG_RE) || []).sort().join("|");
    if (expected === actual) placeholdersOk++;
    else errors.push({
      key: entry.key,
      reason: `placeholder-mismatch (expected=${expected || "∅"} got=${actual || "∅"})`,
      sample: cleaned.slice(0, 80),
    });

    if (typeof raw === "string" && /\r|\n/.test(raw)) newlineStripped++;
  }

  return {
    total: requested.length,
    returned: Object.keys(cleanedTranslations).length,
    validJson: true,
    withArabic, placeholdersOk, newlineStripped,
    errors: errors.slice(0, 20),
  };
}

// ─────────────────────────────────────────────────────────────────────
describe("stripNewlinesInValues", () => {
  it("replaces \\n with single space", () => {
    expect(stripNewlinesInValues({ a: "hi\nthere" })).toEqual({ a: "hi there" });
  });

  it("collapses CRLF and CR like \\n", () => {
    expect(stripNewlinesInValues({ a: "hi\r\nthere\rnow" })).toEqual({ a: "hi there now" });
  });

  it("collapses runs of spaces/tabs to a single space", () => {
    expect(stripNewlinesInValues({ a: "hi    there\t\tnow" })).toEqual({ a: "hi there now" });
  });

  it("trims leading and trailing whitespace", () => {
    expect(stripNewlinesInValues({ a: "  \n hi \n  " })).toEqual({ a: "hi" });
  });

  it("preserves single internal spaces (no over-eager collapse)", () => {
    expect(stripNewlinesInValues({ a: "a b c d" })).toEqual({ a: "a b c d" });
  });

  it("processes every key independently", () => {
    expect(stripNewlinesInValues({
      a: "x\ny", b: "no change", c: "  trim me  ",
    })).toEqual({ a: "x y", b: "no change", c: "trim me" });
  });

  it("passes non-string values through unchanged", () => {
    const out = stripNewlinesInValues({ a: 42 as unknown as string });
    expect(out.a).toBe(42 as unknown as string);
  });

  it("preserves placeholders ⟪T0⟫ and TAG_n verbatim", () => {
    const out = stripNewlinesInValues({ a: "Hi ⟪T0⟫\nTAG_1" });
    expect(out.a).toBe("Hi ⟪T0⟫ TAG_1");
  });
});

describe("computeQualityStats", () => {
  it("counts a perfect batch correctly (Arabic + placeholders OK)", () => {
    const req = [
      { key: "K0", original: "Hi TAG_0" },
      { key: "K1", original: "Welcome ⟪T0⟫" },
    ];
    const cleaned = { K0: "أهلاً TAG_0", K1: "مرحباً ⟪T0⟫" };
    const s = computeQualityStats(req, cleaned, cleaned);
    expect(s).toMatchObject({
      total: 2, returned: 2, validJson: true,
      withArabic: 2, placeholdersOk: 2, newlineStripped: 0, errors: [],
    });
  });

  it("flags missing keys with reason='missing' and sample from original", () => {
    const req = [{ key: "K0", original: "Hello there" }];
    const s = computeQualityStats(req, {}, {});
    expect(s.errors).toEqual([
      { key: "K0", reason: "missing", sample: "Hello there" },
    ]);
    expect(s.placeholdersOk).toBe(0);
    expect(s.withArabic).toBe(0);
  });

  it("flags translations with no Arabic letters", () => {
    const req = [{ key: "K0", original: "Hello" }];
    const cleaned = { K0: "Hello translated" };
    const s = computeQualityStats(req, cleaned, cleaned);
    expect(s.withArabic).toBe(0);
    expect(s.errors.some(e => e.reason === "no-arabic")).toBe(true);
  });

  it("flags placeholder mismatch with expected vs got in reason", () => {
    const req = [{ key: "K0", original: "Press TAG_0 and TAG_1" }];
    const cleaned = { K0: "اضغط TAG_0 و TAG_2" };
    const s = computeQualityStats(req, cleaned, cleaned);
    const err = s.errors.find(e => e.reason.startsWith("placeholder-mismatch"))!;
    expect(err).toBeDefined();
    expect(err.reason).toContain("expected=TAG_0|TAG_1");
    expect(err.reason).toContain("got=TAG_0|TAG_2");
  });

  it("counts newlineStripped only when RAW had \\n or \\r", () => {
    const req = [
      { key: "K0", original: "x" },
      { key: "K1", original: "y" },
    ];
    const raw     = { K0: "أ\nب", K1: "أ ب" };       // K0 had \n, K1 didn't
    const cleaned = { K0: "أ ب",  K1: "أ ب" };
    const s = computeQualityStats(req, raw, cleaned);
    expect(s.newlineStripped).toBe(1);
  });

  it("treats empty string as missing", () => {
    const req = [{ key: "K0", original: "Hi" }];
    const s = computeQualityStats(req, { K0: "" }, { K0: "" });
    expect(s.errors[0].reason).toBe("missing");
  });

  it("placeholders=∅ shown in mismatch reason when no tags expected/got", () => {
    const req = [{ key: "K0", original: "Hi" }];
    const cleaned = { K0: "أهلاً TAG_5" }; // hallucinated tag
    const s = computeQualityStats(req, cleaned, cleaned);
    const err = s.errors.find(e => e.reason.startsWith("placeholder-mismatch"))!;
    expect(err.reason).toContain("expected=∅");
    expect(err.reason).toContain("got=TAG_5");
  });

  it("caps errors at 20 to keep payload bounded", () => {
    const req = Array.from({ length: 30 }, (_, i) => ({ key: `K${i}`, original: "Hi" }));
    // all missing → 30 errors raw → must be sliced to 20
    const s = computeQualityStats(req, {}, {});
    expect(s.errors).toHaveLength(20);
    expect(s.total).toBe(30);
    expect(s.returned).toBe(0);
  });

  it("`returned` reflects size of cleanedTranslations even if extras exist", () => {
    const req = [{ key: "K0", original: "Hi" }];
    const cleaned = { K0: "أهلاً", EXTRA: "ignored" };
    const s = computeQualityStats(req, cleaned, cleaned);
    expect(s.returned).toBe(2);
    expect(s.total).toBe(1);
  });
});
