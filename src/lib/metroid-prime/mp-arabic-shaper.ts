/**
 * Arabic shaping + visual reordering for Metroid Prime Remastered's text
 * renderer — build-time only.
 *
 * Why this is needed (confirmed against a real translated .pak): the engine
 * looks each character up literally in the FONT asset's glyph table and draws
 * it left-to-right. It performs NO Arabic contextual shaping and NO BiDi. A
 * translation stored as logical Arabic (U+0627 ا, U+0628 ب, …) therefore
 * finds no glyph at all — the font tool inserts *presentation forms*
 * (U+FE8E, U+FE92, …) — so every letter renders as a missing-glyph box, which
 * is exactly the symptom reported in-game. Shaping to presentation forms and
 * reversing per line makes the naive LTR drawing produce correctly joined,
 * correctly ordered Arabic. Same problem and same fix already proven for
 * Risen 1 and Xenoblade.
 *
 * The pure Unicode work (joining tables, contextual form selection, bidi run
 * reversal) is reused from `risen/arabic-shaper` rather than duplicated —
 * that part is engine-agnostic. Two things are Metroid-Prime-specific and
 * handled here:
 *
 *  1. Control tags. MSBT strings carry binary control codes that the editor
 *     shows as `[TAG:marker:group:type:params]`. They must survive shaping
 *     untouched *and* be repositioned by the reversal like any other inline
 *     element, so they are shielded as single private-use placeholders before
 *     shaping and re-expanded by the caller afterwards (mp-msbt.ts turns each
 *     placeholder back into its original binary tag while encoding).
 *  2. Tashkeel (combining vowel marks) — dropped, see TASHKEEL_RE.
 *  3. The Arabic question mark. Risen's shaper swaps ؟ (U+061F) for a
 *     private-use alias to dodge a Genome-engine quirk; Metroid Prime has no
 *     such quirk and no glyph at that alias, so the swap is undone here.
 *
 * Editor state / IndexedDB always keep normal logical Arabic — this runs only
 * in the build path, immediately before bytes are written.
 */

import {
  shapeArabicForRisen,
  getRisenArabicGlyphCodepoints,
  RISEN_ARABIC_QMARK_ALIAS,
} from "@/lib/risen/arabic-shaper";

/** Matches the editor's bracket form of one MSBT control tag. Must stay in
 *  sync with mp-msbt.ts's TAG_RE (same shape, own instance so the shared
 *  `lastIndex` of a global regex can never leak between the two). */
const MP_TAG_RE = /\[TAG:[0-9a-fA-F]{4}:[0-9a-fA-F]{4}:[0-9a-fA-F]{4}:[0-9a-fA-F]*\]/g;

/**
 * Private-use placeholders for shielded tags. Deliberately outside the ranges
 * `risen/arabic-shaper` uses internally (0xE900+ for its own protected tokens,
 * 0xE100 for its question-mark alias) so the two shielding passes can never
 * collide. A placeholder is neutral for run classification, so it glues to the
 * surrounding run and gets repositioned by the reversal — which is exactly the
 * behavior an inline tag needs.
 */
const MP_SHIELD_BASE = 0xe200;
const MP_SHIELD_MAX_SLOTS = 0x100;

/**
 * Tashkeel (harakat/tanween/shadda/sukun + superscript alef). Dropped at build
 * time rather than shipped as glyphs.
 *
 * They are combining marks: a renderer is supposed to stack them over the
 * preceding letter without advancing the pen. Metroid Prime's renderer has no
 * concept of that — it draws every glyph in sequence and advances by the
 * glyph's own `advance`, so a mark would appear as a separate blob wedged
 * between two letters (and after RTL reversal, next to the wrong one).
 * Leaving them in with no glyph in the font is worse still: each one renders
 * as a missing-glyph box. Arabic reads correctly unvocalized, so removing them
 * is the standard fix for engines like this. Real translations do contain them
 * — the user's own file uses U+064B/064D/064E/064F/0650/0651 — so this is not
 * a theoretical case. The editor keeps the fully-vocalized text; only the
 * bytes written into the game drop the marks.
 */
const TASHKEEL_RE = /[\u064B-\u065F\u0670]/g;

export interface MpShapedText {
  /** Shaped and visually reordered text, with each original tag collapsed to
   *  one placeholder character. */
  text: string;
  /** The original `[TAG:…]` strings, indexed by placeholder slot. */
  tags: string[];
}

/** True when `text` contains any Arabic letter (base block or presentation
 *  forms) and therefore needs shaping at all. */
export function hasArabicForMp(text: string): boolean {
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (
      (code >= 0x0600 && code <= 0x06ff) ||
      (code >= 0xfb50 && code <= 0xfdff) ||
      (code >= 0xfe70 && code <= 0xfeff)
    ) {
      return true;
    }
  }
  return false;
}

/** The placeholder slot `ch` stands for, or null when it isn't a placeholder. */
export function mpTagPlaceholderIndex(ch: string): number | null {
  const code = ch.charCodeAt(0);
  if (code < MP_SHIELD_BASE || code >= MP_SHIELD_BASE + MP_SHIELD_MAX_SLOTS) return null;
  return code - MP_SHIELD_BASE;
}

/**
 * Shape + visually reorder one translated MSBT string.
 *
 * Text with no Arabic is returned untouched (tags left inline, empty `tags`)
 * so English/unedited-style values encode byte-for-byte as before.
 */
export function shapeArabicForMp(text: string): MpShapedText {
  if (!text || !hasArabicForMp(text)) return { text, tags: [] };

  // 1) Drop tashkeel — see TASHKEEL_RE. Done first so it can't affect
  //    joining or run detection (the joining lookups skip them anyway).
  const bare = text.replace(new RegExp(TASHKEEL_RE.source, TASHKEEL_RE.flags), "");

  // 2) Shield every control tag as a single placeholder character.
  const tags: string[] = [];
  const regex = new RegExp(MP_TAG_RE.source, MP_TAG_RE.flags);
  const shielded = bare.replace(regex, (match) => {
    if (tags.length >= MP_SHIELD_MAX_SLOTS) return match; // overflow — leave inline (never seen in practice)
    tags.push(match);
    return String.fromCharCode(MP_SHIELD_BASE + tags.length - 1);
  });

  // 3) Shape to presentation forms + reverse runs per line (engine-agnostic).
  let shaped = shapeArabicForRisen(shielded);

  // 4) Undo Risen's engine-specific question-mark alias — Metroid Prime's font
  //    has no glyph there, so the real U+061F must be restored.
  if (shaped.includes(String.fromCharCode(RISEN_ARABIC_QMARK_ALIAS))) {
    shaped = shaped.split(String.fromCharCode(RISEN_ARABIC_QMARK_ALIAS)).join("؟");
  }

  return { text: shaped, tags };
}

/**
 * Every codepoint `shapeArabicForMp` can ever emit — i.e. exactly the glyph
 * set the game font must carry for any Arabic translation to render. Derived
 * from the shared shaping tables so it can never drift out of sync with them,
 * minus Risen's private-use question-mark alias (undone above) and plus the
 * real U+061F that replaces it.
 */
export function getMpArabicGlyphCodepoints(): number[] {
  const codepoints = new Set(getRisenArabicGlyphCodepoints());
  codepoints.delete(RISEN_ARABIC_QMARK_ALIAS);
  codepoints.add(0x061f); // ؟ — stored as itself for Metroid Prime
  return [...codepoints].sort((a, b) => a - b);
}
