/**
 * Text Token model — the Single Source of Truth for XC3 cinematic text.
 *
 * Why this exists:
 * --------------------------------------------------------------------------
 * Before tokens, every layer of the pipeline (arabic-processing,
 * tag-protection, balance-lines, build-guard) re-parsed the raw string with
 * its own regex. This caused "drift": tags occasionally migrated, hard
 * line-breaks were redistributed across cinematic boundaries, and the same
 * input produced different outputs depending on call order.
 *
 * The Token model defines a stable, typed representation of text so any layer
 * that needs structural decisions (where can a balance break? where can a
 * line wrap?) operates on facts instead of regex guesses.
 *
 * INVARIANTS (never violate these):
 *   1. `hardBreak` tokens (XENO:n / System:PageBreak) are mandatory cinematic
 *      anchors — they MUST stay in original order and MUST NOT be deleted.
 *   2. `tag` / `pua` / `control` tokens are atomic — never split, never
 *      reordered relative to neighbours unless explicitly via build-guard.
 *   3. Only `text` tokens may be modified, balanced, or wrapped.
 */

export type TextToken =
  | { kind: "text"; value: string }
  | { kind: "hardBreak"; raw: string }      // [XENO:n ] or [System:PageBreak ] (incl. trailing \n)
  | { kind: "tag"; raw: string }            // [XENO:wait], [System:*], [ML:*], etc.
  | { kind: "pua"; raw: string }            // U+E000 - U+E0FF
  | { kind: "control"; raw: string };       // U+FFF9 - U+FFFC

// Match either hard-break flavor; the trailing newline (if present) is part of the match.
const HARD_BREAK_RE = /\[\s*XENO\s*:\s*n\s*\]\s*\n?|\[\s*System\s*:\s*PageBreak\s*\]\s*\n?/g;
// Generic technical tag (after hard-break has been peeled off).
const GENERIC_TAG_RE = /\\?\[\s*\/?\s*\w+\s*:[^\]]*?\s*\\?\]|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}/g;
const PUA_RE = /[\uE000-\uE0FF]+/g;
const CONTROL_RE = /[\uFFF9-\uFFFC]+/g;

interface RawMatch {
  start: number;
  end: number;
  kind: TextToken["kind"];
  raw: string;
}

function collectMatches(text: string, re: RegExp, kind: TextToken["kind"]): RawMatch[] {
  const out: RawMatch[] = [];
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, kind, raw: m[0] });
    if (m[0].length === 0) r.lastIndex++;
  }
  return out;
}

/**
 * Tokenize raw XC3 text. Hard-breaks take precedence, then generic tags,
 * then PUA, then control. Overlaps are resolved by "first wins" after sorting.
 */
export function tokenize(text: string): TextToken[] {
  if (!text) return [];

  const all: RawMatch[] = [
    ...collectMatches(text, HARD_BREAK_RE, "hardBreak"),
    ...collectMatches(text, GENERIC_TAG_RE, "tag"),
    ...collectMatches(text, PUA_RE, "pua"),
    ...collectMatches(text, CONTROL_RE, "control"),
  ];

  // Sort by start, then by length DESC so longer (hard-break with \n) wins ties.
  all.sort((a, b) => (a.start - b.start) || (b.end - b.start) - (a.end - a.start));

  // Drop overlaps (later match contained inside an earlier one).
  const accepted: RawMatch[] = [];
  let lastEnd = -1;
  for (const m of all) {
    if (m.start < lastEnd) continue;
    accepted.push(m);
    lastEnd = m.end;
  }

  const tokens: TextToken[] = [];
  let cursor = 0;
  for (const m of accepted) {
    if (m.start > cursor) {
      tokens.push({ kind: "text", value: text.slice(cursor, m.start) });
    }
    tokens.push({ kind: m.kind, raw: m.raw } as TextToken);
    cursor = m.end;
  }
  if (cursor < text.length) {
    tokens.push({ kind: "text", value: text.slice(cursor) });
  }
  return tokens;
}

/** Re-serialize tokens back to a raw string. Reverse of `tokenize`. */
export function detokenize(tokens: TextToken[]): string {
  let out = "";
  for (const t of tokens) {
    out += t.kind === "text" ? t.value : t.raw;
  }
  return out;
}

/**
 * Split tokens into "chunks" delimited by hardBreak tokens. The hardBreak
 * itself is appended to the END of the preceding chunk so the cinematic
 * marker stays attached to the line that triggered it.
 *
 * Used by the line-balancer: each chunk can be rebalanced independently
 * without ever moving words across a cinematic boundary.
 */
export function splitOnHardBreaks(tokens: TextToken[]): TextToken[][] {
  const chunks: TextToken[][] = [];
  let current: TextToken[] = [];
  for (const tok of tokens) {
    if (tok.kind === "hardBreak") {
      current.push(tok);
      chunks.push(current);
      current = [];
    } else {
      current.push(tok);
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Convenience: count hardBreak tokens (cinematic anchors) in text. */
export function countHardBreaks(text: string): number {
  return tokenize(text).filter((t) => t.kind === "hardBreak").length;
}

/**
 * Count the EFFECTIVE number of visible lines a string will render to in-game.
 *
 * The XC3 engine treats both literal `\n` and the cinematic markers
 * `[XENO:n ]` / `[System:PageBreak ]` as line terminators. Counting only `\n`
 * produces false "أسطر زائدة" warnings whenever the original uses `[XENO:n ]`
 * to break lines (very common in cutscenes). This helper unifies the count so
 * the diagnostic, line-balancer, and cleanup tools all agree on what "a line"
 * actually means.
 *
 * Examples:
 *   "A\nB"                       → 2
 *   "A[XENO:n ]B"                → 2
 *   "A[XENO:n ]\nB"              → 2 (the \n is the engine-mandated newline that
 *                                       follows the tag — not an extra break)
 *   "A[XENO:n ]B[XENO:n ]C"      → 3
 *   "A[System:PageBreak ]B"      → 2
 */
export function countEffectiveLines(text: string): number {
  if (!text) return 0;
  // Strip the trailing \n that the engine inserts AFTER each cinematic marker
  // so we don't double-count it. The HARD_BREAK_RE already greedily consumes
  // the trailing \n; we leverage tokenize to avoid re-implementing that logic.
  const tokens = tokenize(text);
  let lines = 1;
  let textBuffer = "";
  for (const t of tokens) {
    if (t.kind === "hardBreak") {
      lines++;
      textBuffer = "";
    } else if (t.kind === "text") {
      // Count literal newlines inside the text segments.
      for (const ch of t.value) {
        if (ch === "\n") {
          lines++;
          textBuffer = "";
        } else {
          textBuffer += ch;
        }
      }
    }
  }
  return lines;
}

/**
 * Verify that two strings carry the SAME ordered list of hardBreak markers.
 * Used as a safety assertion before applying any balancer output.
 */
export function hardBreaksEqual(a: string, b: string): boolean {
  const aBreaks = tokenize(a).filter((t) => t.kind === "hardBreak").map((t) => normalizeHardBreak(t.raw));
  const bBreaks = tokenize(b).filter((t) => t.kind === "hardBreak").map((t) => normalizeHardBreak(t.raw));
  if (aBreaks.length !== bBreaks.length) return false;
  for (let i = 0; i < aBreaks.length; i++) {
    if (aBreaks[i] !== bBreaks[i]) return false;
  }
  return true;
}

/** Normalize a hardBreak token — strip whitespace + trailing \n for comparison. */
function normalizeHardBreak(raw: string): string {
  if (/PageBreak/i.test(raw)) return "[System:PageBreak]";
  return "[XENO:n]";
}
