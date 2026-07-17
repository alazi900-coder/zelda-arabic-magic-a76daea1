// Arabic shaping + visual reordering for Risen 1's Genome engine.
//
// Confirmed by in-game test: the engine draws replaced-font (DejaVu Sans)
// glyphs one-by-one, strictly left-to-right, with NO Arabic contextual
// shaping and NO BiDi. Logical Arabic text like "متابعة" therefore renders
// with each letter in isolated form, and — because a human reads Arabic
// right-to-left regardless of how the glyphs were drawn — the perceived
// result reads backwards ("ةعباتم"). This is the same fixed-font-engine
// problem already solved for Xenoblade Chronicles.
//
// The fix is a build-time-only transform: shape Arabic letters into their
// joined presentation forms (FE70–FEFF), then reverse the character/run
// order per line, so that naive left-to-right drawing produces glyphs a
// right-to-left reader perceives correctly, connected and in-order.
//
// This module is intentionally INDEPENDENT from src/lib/arabic-processing.ts
// (Xenoblade's reverseBidi/reshapeArabic): that code is coupled to XC-specific
// constructs ([Tag:Value], [XENO:n] as a hard line break, PUA icon ranges)
// and has no notion of \r\n or Risen's <Tag>/$(var) tokens. Correctness for
// each game independently matters more than sharing code here — duplicate
// the pure Unicode joining tables rather than risk behavior coupling.
//
// Editor state / IndexedDB always keep normal logical Arabic. This transform
// runs only in the Risen build path, immediately before bytes are written.

// ─── Presentation-form shaping tables (Unicode Arabic Presentation Forms-B) ──

/** [isolated, final, initial, medial] — null when that form doesn't exist. */
const ARABIC_FORMS: Record<number, [number, number, number | null, number | null]> = {
  0x0621: [0xFE80, 0xFE80, null, null],
  0x0622: [0xFE81, 0xFE82, null, null],
  0x0623: [0xFE83, 0xFE84, null, null],
  0x0624: [0xFE85, 0xFE86, null, null],
  0x0625: [0xFE87, 0xFE88, null, null],
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C],
  0x0627: [0xFE8D, 0xFE8E, null, null],
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92],
  0x0629: [0xFE93, 0xFE94, null, null],
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98],
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C],
  0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0],
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8],
  0x062F: [0xFEA9, 0xFEAA, null, null],
  0x0630: [0xFEAB, 0xFEAC, null, null],
  0x0631: [0xFEAD, 0xFEAE, null, null],
  0x0632: [0xFEAF, 0xFEB0, null, null],
  0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4],
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8],
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC],
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0],
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4],
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8],
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC],
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0],
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640], // tatweel — same glyph in all positions
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4],
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8],
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC],
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0],
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4],
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC],
  0x0648: [0xFEED, 0xFEEE, null, null],
  0x0649: [0xFEEF, 0xFEF0, null, null],
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],
};

/** Lam-Alef ligatures: [isolated/initial form, final form (after a connector)]. */
const LAM_ALEF_LIGATURES: Record<number, [number, number]> = {
  0x0622: [0xFEF5, 0xFEF6], // لآ
  0x0623: [0xFEF7, 0xFEF8], // لأ
  0x0625: [0xFEF9, 0xFEFA], // لإ
  0x0627: [0xFEFB, 0xFEFC], // لا
};

/** All presentation-form codepoints a base Arabic letter can appear as in
 * shaped output: its isolated/final/initial/medial forms, plus (for ل only)
 * the lam-alef ligature forms it participates in. A codepoint with no entry
 * in the shaping table (Arabic punctuation, Arabic-Indic digits) maps to
 * itself. Used by the alternate-font override feature: replacing a letter
 * must replace ALL its contextual forms, or the styles mix mid-word. */
export function getPresentationFormsForLetter(base: number): number[] {
  const out = new Set<number>();
  const forms = ARABIC_FORMS[base];
  if (forms) for (const f of forms) if (f !== null) out.add(f);
  if (base === 0x0644) {
    for (const [iso, fin] of Object.values(LAM_ALEF_LIGATURES)) {
      out.add(iso);
      out.add(fin);
    }
  }
  if (out.size === 0) out.add(base);
  return [...out];
}

function isTashkeelCode(code: number): boolean {
  return (code >= 0x064B && code <= 0x065F) || code === 0x0670;
}

/** Arabic-Indic digits — kept as-is (single glyph form), never shaped. */
function isArabicIndicDigit(code: number): boolean {
  return code >= 0x0660 && code <= 0x0669;
}

/** Characters classified as "Arabic flow" for both shaping and reversal:
 * base letters (0600–06FF, incl. punctuation ، ؛ ؟) and already-shaped
 * presentation forms (FE70–FEFF). Arabic-Indic digits are intentionally
 * excluded — they behave like Latin digits (never internally reversed). */
function isArabicFlowChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (isArabicIndicDigit(code)) return false;
  return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFE70 && code <= 0xFEFF);
}

function canConnectAfter(code: number): boolean {
  const forms = ARABIC_FORMS[code];
  return !!forms && forms[2] !== null;
}

function getPrevJoiningCode(chars: string[], index: number): number | null {
  for (let i = index - 1; i >= 0; i--) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeelCode(c)) continue;
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

function getNextJoiningCode(chars: string[], index: number): number | null {
  for (let i = index + 1; i < chars.length; i++) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeelCode(c)) continue;
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

/**
 * Shape Arabic letters into contextual presentation forms, in LOGICAL order.
 * Any character without a joining-table entry (Latin, digits, punctuation,
 * shielded protected-token placeholders, tashkeel) passes through untouched
 * and naturally breaks the joining chain — no special-casing needed.
 */
function shapeArabicLetters(text: string): string {
  const chars = [...text];
  const result: string[] = [];

  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0);

    if (isTashkeelCode(code)) { result.push(chars[i]); continue; }

    const forms = ARABIC_FORMS[code];
    if (!forms) { result.push(chars[i]); continue; }

    if (code === 0x0644) {
      // Lam-Alef ligature: skip past any tashkeel between lam and the alef variant.
      let nextIdx = i + 1;
      while (nextIdx < chars.length && isTashkeelCode(chars[nextIdx].charCodeAt(0))) nextIdx++;
      if (nextIdx < chars.length) {
        const nextCode = chars[nextIdx].charCodeAt(0);
        const ligature = LAM_ALEF_LIGATURES[nextCode];
        if (ligature) {
          const prevCode = getPrevJoiningCode(chars, i);
          const prevConnects = prevCode !== null && canConnectAfter(prevCode);
          result.push(String.fromCharCode(prevConnects ? ligature[1] : ligature[0]));
          i = nextIdx;
          continue;
        }
      }
    }

    const prevCode = getPrevJoiningCode(chars, i);
    const prevConnects = prevCode !== null && canConnectAfter(prevCode);
    const nextCode = getNextJoiningCode(chars, i);
    const nextExists = nextCode !== null;

    let formIndex: number;
    if (prevConnects && nextExists && forms[2] !== null) {
      formIndex = 3; // medial
      if (forms[3] === null) formIndex = 1;
    } else if (prevConnects) {
      formIndex = 1; // final
    } else if (nextExists && forms[2] !== null) {
      formIndex = 2; // initial
    } else {
      formIndex = 0; // isolated
    }

    const glyph = forms[formIndex];
    result.push(String.fromCharCode(glyph !== null ? glyph : forms[0]));
  }

  return result.join('');
}

// ─── Protected tokens (never reshaped, never internally reordered) ──────────

const PROTECTED_TOKEN_REGEX = /<[A-Za-z][A-Za-z0-9_]{0,30}>|\$\([A-Za-z0-9_]{1,30}\)/g;
/** Private-use placeholders distinct from Risen's own font's icon ranges. */
const SHIELD_BASE = 0xE900;
const SHIELD_MAX_SLOTS = 0x100;

function shieldProtectedTokens(line: string): { shielded: string; tokens: string[] } {
  const tokens: string[] = [];
  const regex = new RegExp(PROTECTED_TOKEN_REGEX.source, PROTECTED_TOKEN_REGEX.flags);
  const shielded = line.replace(regex, (match) => {
    const idx = tokens.length;
    if (idx >= SHIELD_MAX_SLOTS) return match; // overflow — leave unshielded (extremely unlikely)
    tokens.push(match);
    return String.fromCharCode(SHIELD_BASE + idx);
  });
  return { shielded, tokens };
}

function unshieldProtectedTokens(line: string, tokens: string[]): string {
  if (tokens.length === 0) return line;
  return line.replace(/[-]/g, (ch) => {
    const idx = ch.charCodeAt(0) - SHIELD_BASE;
    return tokens[idx] ?? ch;
  });
}

function isShieldPlaceholder(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= SHIELD_BASE && code < SHIELD_BASE + SHIELD_MAX_SLOTS;
}

// ─── Visual reordering (per line) ────────────────────────────────────────────

// NOTE — bracket mirroring deliberately NOT applied (deviation from the
// original spec, flagged for confirmation): hand-traced and script-verified
// against "وزن (كامل)" — mirroring the parens before/while reversing produces
// "وزن )كامل(" (orientation flipped) once read back in visual RTL order;
// leaving brackets untouched and only repositioning them via the run reversal
// produces the correct "وزن (كامل)". A pure positional reversal already
// relocates a bracket to the position where it performs the correct
// opening/closing role — mirroring on top of that flips it twice. Revisit
// only with concrete in-game evidence that un-mirrored brackets render wrong.

/** Latin letters and ASCII/Arabic-Indic digit sequences never get internally
 * reordered — they read left-to-right even inside an RTL flow. */
function isLatinOrDigit(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return /[a-zA-Z0-9]/.test(ch) || isArabicIndicDigit(code);
}

/**
 * Reverse one line (already shaped) into the byte order a naive LTR-drawing
 * engine needs to display correct RTL Arabic. Segments the line into
 * LTR-hold runs (Latin/digits/shielded protected tokens) and Arabic-flow runs
 * (Arabic letters/presentation forms + neutral punctuation/whitespace glued
 * to whichever run is currently open), reverses run order, and reverses
 * character order only WITHIN Arabic-flow runs.
 */
function reverseShapedLine(line: string): string {
  const segments: { text: string; isArabicFlow: boolean }[] = [];
  let current = '';
  let currentIsArabicFlow: boolean | null = null;

  for (const ch of line) {
    if (isShieldPlaceholder(ch)) { current += ch; continue; }

    const flowIsArabic = isArabicFlowChar(ch);
    const flowIsLatinDigit = isLatinOrDigit(ch);

    if (flowIsArabic) {
      if (currentIsArabicFlow === false && current) { segments.push({ text: current, isArabicFlow: false }); current = ''; }
      currentIsArabicFlow = true;
      current += ch;
    } else if (flowIsLatinDigit) {
      if (currentIsArabicFlow === true && current) { segments.push({ text: current, isArabicFlow: true }); current = ''; }
      currentIsArabicFlow = false;
      current += ch;
    } else {
      // Neutral (punctuation/whitespace not already handled above): glue to
      // whatever run is currently open, inheriting its direction.
      current += ch;
    }
  }
  if (current) segments.push({ text: current, isArabicFlow: currentIsArabicFlow === true });

  const joined = segments
    .reverse()
    .map((seg) => (seg.isArabicFlow ? [...seg.text].reverse().join('') : seg.text))
    .join('');

  // A space glued to the trailing edge of one run and a space glued to the
  // leading edge of its neighbour both survive independently — collapse the
  // resulting doubled space at Arabic/Latin-digit run boundaries.
  return joined.replace(/ {2,}/g, ' ');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Every Unicode codepoint `shapeArabicForRisen` can ever emit: all
 * contextual presentation forms + lam-alef ligatures from the tables above,
 * tatweel, Arabic-Indic digits (passed through unshaped), and the Arabic
 * punctuation marks left unshaped by `shapeArabicLetters` (not in
 * ARABIC_FORMS, so they pass through at their base codepoint). This is the
 * exact glyph set a replacement bitmap font needs to cover — derived from
 * the shaping tables themselves so it can never drift out of sync with them. */
export function getRisenArabicGlyphCodepoints(): number[] {
  const codepoints = new Set<number>();
  for (const forms of Object.values(ARABIC_FORMS)) {
    for (const f of forms) if (f !== null) codepoints.add(f);
  }
  for (const lig of Object.values(LAM_ALEF_LIGATURES)) {
    codepoints.add(lig[0]);
    codepoints.add(lig[1]);
  }
  for (let d = 0x0660; d <= 0x0669; d++) codepoints.add(d); // Arabic-Indic digits
  for (const p of [0x060c, 0x061b, 0x061f, 0x0621]) codepoints.add(p); // comma, semicolon, question mark, hamza
  return [...codepoints].sort((a, b) => a - b);
}

function hasArabicLetters(text: string): boolean {
  return [...text].some((ch) => {
    const code = ch.charCodeAt(0);
    return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
  });
}

/**
 * Convert logical Arabic text into the shaped, visually-reordered form
 * Risen's naive LTR-drawing engine needs. Build-time only — never store the
 * result back into editor state.
 *
 * Non-Arabic values (no character in 0600–06FF/FB50–FDFF/FE70–FEFF) are
 * returned completely unchanged.
 */
export function shapeArabicForRisen(text: string): string {
  if (!text || !hasArabicLetters(text)) return text;

  // Hard line separators stay in place; each line is shaped/reversed independently.
  const lineParts = text.split(/(\r\n|\n)/);

  return lineParts
    .map((part) => {
      if (part === '\r\n' || part === '\n') return part;
      if (!part) return part;
      const { shielded, tokens } = shieldProtectedTokens(part);
      const shaped = shapeArabicLetters(shielded);
      const reversed = reverseShapedLine(shaped);
      return unshieldProtectedTokens(reversed, tokens);
    })
    .join('');
}
