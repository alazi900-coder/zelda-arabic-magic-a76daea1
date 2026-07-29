/**
 * Hiding Pokémon Ruby Destiny's technical codes from the translation models.
 *
 * A line can carry `{FD:01}` — a value the game substitutes at run time, most
 * often a character's name — and `{7f}`, a byte the decoder could not name.
 * Neither is text. Sent to a model as-is they get translated, reordered, their
 * digits changed, or dropped; and a dropped `{FD:01}` costs a character their
 * name in every line that greeted them by it.
 *
 * So they never reach the model. Each is swapped for a placeholder that no
 * language rewrites, the model sees a clean sentence, and the codes are put
 * back byte for byte afterwards. The same masking the Risen tools use, for the
 * same reason.
 *
 * `diffPkmTags` is the check that runs after: it compares the codes in the
 * original with the codes that came back, as a multiset **and** in order, so a
 * swapped pair is caught as surely as a missing one.
 */

/** `{FD:01}` — a substituted value — and `{7f}` — an unnamed byte. */
export const PKM_TAG_RE = /\{(?:FD:[0-9a-fA-F]{2}|[0-9a-fA-F]{2})\}/g;

/** Placeholders no translation model rewrites, and no Arabic text contains. */
const MASK_OPEN = "〖";
const MASK_CLOSE = "〗";

export interface PkmMasked {
  text: string;
  tags: string[];
}

/** Replaces every technical code with a numbered placeholder. */
export function maskPkmTags(text: string): PkmMasked {
  const tags: string[] = [];
  const masked = text.replace(PKM_TAG_RE, (tag) => {
    tags.push(tag);
    return `${MASK_OPEN}${tags.length - 1}${MASK_CLOSE}`;
  });
  return { text: masked, tags };
}

/**
 * Puts the codes back.
 *
 * A model sometimes returns a placeholder with spaces inside it, or drops one
 * entirely. Spacing is tolerated; a missing placeholder is not silently
 * forgiven — the code is appended so the count still matches and the check
 * downstream can see the order went wrong, rather than the line quietly
 * shipping without a name in it.
 */
export function unmaskPkmTags(text: string, tags: string[]): string {
  let out = text.replace(
    new RegExp(`${MASK_OPEN}\\s*(\\d+)\\s*${MASK_CLOSE}`, "g"),
    (whole, n) => tags[Number(n)] ?? whole
  );
  for (const tag of tags) {
    if (!out.includes(tag)) out += tag;
  }
  return out;
}

export interface PkmTagDiff {
  /** Codes in the original that the translation lost. */
  missing: string[];
  /** Codes the translation carries that the original did not. */
  extra: string[];
  /** True when both sides hold the same codes in the same order. */
  sameOrder: boolean;
}

export function diffPkmTags(original: string, translation: string): PkmTagDiff {
  const a = original.match(PKM_TAG_RE) ?? [];
  const b = translation.match(PKM_TAG_RE) ?? [];
  const pool = [...b];
  const missing: string[] = [];
  for (const tag of a) {
    const at = pool.indexOf(tag);
    if (at === -1) missing.push(tag);
    else pool.splice(at, 1);
  }
  return {
    missing,
    extra: pool,
    sameOrder: a.length === b.length && a.every((t, i) => t === b[i]),
  };
}

/** True when the translation may be written: no code lost, none invented. */
export function pkmTagsIntact(original: string, translation: string): boolean {
  const d = diffPkmTags(original, translation);
  return d.missing.length === 0 && d.extra.length === 0 && d.sameOrder;
}
