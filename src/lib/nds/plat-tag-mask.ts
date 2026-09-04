/**
 * Hiding Platinum's runtime tags from the translation models, and checking
 * they came back.
 *
 * A line can carry `{STRVAR_1 3, 0, 0}` — where the game drops a name, a
 * number, an item — and `{COLOR 2}`, `{CURSOR_X 80}`, `{SIZE 200}`, which are
 * formatting the engine acts on. None of it is text. Sent to a model as-is
 * they get translated, their digits rewritten, their order shuffled, or they
 * are dropped entirely; and a dropped `{STRVAR_1 …}` is a blank in the middle
 * of a sentence with nothing on screen to explain it.
 *
 * The shape is the game's own: an upper-case name, then optionally a space and
 * a comma-separated list of numbers. Writing it that tightly matters — it is
 * added to the editor's shared tag pattern, which every game sees, and a loose
 * `{anything}` rule would start swallowing ordinary prose elsewhere.
 */

/** `{YESNO}`, `{COLOR 2}`, `{STRVAR_1 3, 0, 0}` — name, then optional numbers. */
export const PLAT_TAG_RE = /\{[A-Z][A-Z0-9_]*(?:\s+\d+(?:\s*,\s*\d+)*)?\}/g;

/** Placeholders no translation model rewrites, and no Arabic text contains. */
const MASK_OPEN = "〖";
const MASK_CLOSE = "〗";

export interface PlatMasked {
  text: string;
  tags: string[];
}

export function maskPlatTags(text: string): PlatMasked {
  const tags: string[] = [];
  const masked = text.replace(PLAT_TAG_RE, (tag) => {
    tags.push(tag);
    return `${MASK_OPEN}${tags.length - 1}${MASK_CLOSE}`;
  });
  return { text: masked, tags };
}

/**
 * Puts the tags back.
 *
 * A model sometimes returns a placeholder with spaces inside it, or with the
 * brackets swapped for look-alikes, so the search is deliberately forgiving
 * about everything except the number, which is the only part that identifies
 * which tag goes where.
 */
export function unmaskPlatTags(text: string, tags: string[]): string {
  return text.replace(/[〖〔【]\s*(\d+)\s*[〗〕】]/g, (whole, index) => tags[Number(index)] ?? whole);
}

export interface PlatTagDiff {
  missing: string[];
  extra: string[];
  reordered: boolean;
}

/**
 * Compares the tags in a translation against the original as a multiset *and*
 * in order, because a swapped pair reads as fine until the game fills it in
 * and hands you the trainer's name where the town's should be.
 */
export function diffPlatTags(original: string, translation: string): PlatTagDiff {
  const left = original.match(PLAT_TAG_RE) ?? [];
  const right = translation.match(PLAT_TAG_RE) ?? [];

  const pool = new Map<string, number>();
  for (const tag of left) pool.set(tag, (pool.get(tag) ?? 0) + 1);
  const extra: string[] = [];
  for (const tag of right) {
    const n = pool.get(tag) ?? 0;
    if (n > 0) pool.set(tag, n - 1);
    else extra.push(tag);
  }
  const missing: string[] = [];
  for (const [tag, n] of pool) for (let i = 0; i < n; i += 1) missing.push(tag);

  const reordered = missing.length === 0
    && extra.length === 0
    && left.some((tag, i) => right[i] !== tag);

  return { missing, extra, reordered };
}

/**
 * Rebuilds a translation's tag sequence from the original.
 *
 * Only the tags move: the translated words are kept exactly as written, and
 * each tag is put back at the position it holds in the original relative to
 * the other tags. A line whose tags are merely out of order is repairable this
 * way; one that lost a tag outright is not, and says so.
 */
export function repairPlatTags(original: string, translation: string): { text: string; repaired: boolean } {
  const wanted = original.match(PLAT_TAG_RE) ?? [];
  const got = translation.match(PLAT_TAG_RE) ?? [];
  if (wanted.length === 0 || wanted.length !== got.length) return { text: translation, repaired: false };

  const sorted = [...wanted].sort();
  if (sorted.join(" ") !== [...got].sort().join(" ")) return { text: translation, repaired: false };

  let i = 0;
  const text = translation.replace(PLAT_TAG_RE, () => wanted[i++]);
  return { text, repaired: text !== translation };
}
