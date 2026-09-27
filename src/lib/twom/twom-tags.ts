/**
 * Technical tokens in This War of Mine: Stories text, measured on the
 * 7,990-entry export (the export's own `technical_tokens` field lists exactly
 * these, entry for entry):
 *
 * - Gender tags `{mr|he}`, `{fr|she}`, `{ms|his}`, `{fs|her}` (also `{fr||she}`).
 *   The engine keeps only the tag that matches the character's gender. The
 *   word INSIDE is ordinary text and must be translated (`{mr|هو}{fr|هي}`);
 *   Arabic may also move a whole verb inside (`{mr|ذهب}{fr|ذهبت}`) or add more
 *   tags of a kind the line already uses. Only the frame — `{`, the kind, the
 *   pipe(s), `}` — is technical, so it is the only part checked or repaired.
 * - Fixed tokens copied verbatim: `^CharacterName^`-style values, `<BR>`
 *   `<HEADER>` `<NAME>` `<HAND>`, colour codes `|#color=D16619|` and
 *   `|#defaultcolor|`, gamepad glyphs `|XPadA|` `|LeftStick|`. Arabic word
 *   order can move them, so their count must match but their order may not.
 */
export const TWOM_GENDER_KINDS = ["mr", "fr", "ms", "fs"] as const;
export type TwomGenderKind = (typeof TWOM_GENDER_KINDS)[number];

export const TWOM_GENDER_RE = /\{(mr|fr|ms|fs)(\|+)([^{}]*)\}/g;
export const TWOM_FIXED_RE = /\^[A-Za-z]+\^|<[A-Za-z/]+>|\|#?[A-Za-z0-9=]+\|/g;

const stripGender = (text: string) => text.replace(new RegExp(TWOM_GENDER_RE.source, "g"), " ");

export function extractTwomFixedTokens(text: string): string[] {
  return stripGender(text).match(new RegExp(TWOM_FIXED_RE.source, "g")) ?? [];
}

export function extractTwomGenderKinds(text: string): Set<TwomGenderKind> {
  const kinds = new Set<TwomGenderKind>();
  for (const m of text.matchAll(new RegExp(TWOM_GENDER_RE.source, "g"))) kinds.add(m[1] as TwomGenderKind);
  return kinds;
}

/** Every technical token in reading order — the same list the export's `technical_tokens` carries. */
export function extractTwomTags(text: string): string[] {
  const re = new RegExp(`${TWOM_GENDER_RE.source}|${TWOM_FIXED_RE.source}`, "g");
  return text.match(re) ?? [];
}

const sortedKey = (tokens: string[]) => [...tokens].sort().join("\u0000");

export interface TwomTagCheck {
  valid: boolean;
  reason?: string;
  missingFixed: string[];
  extraFixed: string[];
  missingKinds: TwomGenderKind[];
  foreignKinds: TwomGenderKind[];
  broken: boolean;
}

export function validateTwomTags(original: string, translation: string): TwomTagCheck {
  const expected = extractTwomFixedTokens(original);
  const actual = extractTwomFixedTokens(translation);
  const pool = [...actual];
  const missingFixed: string[] = [];
  for (const token of expected) {
    const at = pool.indexOf(token);
    if (at >= 0) pool.splice(at, 1);
    else missingFixed.push(token);
  }
  const extraFixed = pool;
  const origKinds = extractTwomGenderKinds(original);
  const transKinds = extractTwomGenderKinds(translation);
  const missingKinds = [...origKinds].filter((k) => !transKinds.has(k));
  const foreignKinds = [...transKinds].filter((k) => !origKinds.has(k));
  // A brace left over once every well-formed gender tag is removed means a tag's frame is broken.
  const broken = /[{}]/.test(stripGender(translation)) && !/[{}]/.test(stripGender(original));
  const valid = sortedKey(expected) === sortedKey(actual) && !missingKinds.length && !foreignKinds.length && !broken;
  const parts: string[] = [];
  if (broken) parts.push("وسم جنس مكسور: يجب أن يكون بالشكل {mr|…} بقوس فتح وإغلاق");
  if (missingKinds.length) parts.push(`وسم جنس مفقود: ${missingKinds.map((k) => `{${k}|…}`).join(" ")}`);
  if (foreignKinds.length) parts.push(`وسم جنس غير موجود في الأصل: ${foreignKinds.map((k) => `{${k}|…}`).join(" ")}`);
  if (missingFixed.length) parts.push(`رمز مفقود: ${missingFixed.join(" ")}`);
  if (extraFixed.length) parts.push(`رمز زائد أو مختلف: ${extraFixed.join(" ")}`);
  return { valid, reason: valid ? undefined : parts.join(" — "), missingFixed, extraFixed, missingKinds, foreignKinds, broken };
}

/**
 * Repairs only the technical frame. The text inside a gender tag is never
 * inspected or changed. Handled:
 * - gender prefix spelled with spaces, capitals or full-width signs: `{ MR | هو }` → `{mr|هو}`
 * - gender tag missing its closing `}` → closed before the next tag, or after its first word
 * - fixed token with spaces or other case: `^ characterName ^`, `< br >`, `| XPadA |` → the source spelling
 * - a run of fixed tokens at the very start or end of the source that the translation dropped
 */
export function repairTwomTags(original: string, translation: string): { text: string; changed: boolean } {
  if (!translation) return { text: translation, changed: false };
  let t = translation.replace(/｛/g, "{").replace(/｝/g, "}").replace(/｜/g, "|");
  // 1) gender prefix normalisation (keep the pipe count as typed)
  t = t.replace(/\{\s*(mr|fr|ms|fs)\s*(\|+)\s*/gi, (_m, k: string, p: string) => `{${k.toLowerCase()}${p}`);
  // a prefix typed without its opening brace, closed further on: `mr|هو}`
  t = t.replace(/(^|[^{A-Za-z])(mr|fr|ms|fs)(\|+)(?=[^{}]*\})/g, (_m, pre: string, k: string, p: string) => `${pre}{${k}${p}`);
  // 2) close an unclosed gender tag
  t = t.replace(/\{(mr|fr|ms|fs)(\|+)([^{}]*?)(?=\{|$)/g, (m, k: string, p: string, inner: string) => {
    if (!inner.trim()) return m;
    const first = inner.match(/^\s*[^\s.,!?؟،:;«»"'()]+/);
    const cut = first ? first[0].length : inner.length;
    return `{${k}${p}${inner.slice(0, cut).trimEnd()}}${inner.slice(cut)}`;
  });
  // 3) fixed tokens: restore the source spelling
  const expected = extractTwomFixedTokens(original);
  const canon = new Map(expected.map((tok) => [tok.replace(/[\s]/g, "").toLowerCase(), tok]));
  t = t.replace(/\^\s*[A-Za-z]+\s*\^|<\s*\/?\s*[A-Za-z]+\s*>|\|\s*#?[A-Za-z0-9=]+\s*\|/g, (m) => canon.get(m.replace(/\s/g, "").toLowerCase()) ?? m);
  // 4) dropped leading / trailing token runs
  const tokenAlt = `(?:${TWOM_FIXED_RE.source})`;
  const check = validateTwomTags(original, t);
  if (check.missingFixed.length && !check.extraFixed.length) {
    const lead = original.match(new RegExp(`^(?:${tokenAlt}\\s*)+`))?.[0] ?? "";
    const tail = original.match(new RegExp(`(?:\\s*${tokenAlt})+$`))?.[0] ?? "";
    const leadTokens = extractTwomFixedTokens(lead);
    const tailTokens = extractTwomFixedTokens(tail);
    const needLead = leadTokens.length && leadTokens.every((x) => check.missingFixed.includes(x)) && !t.trimStart().startsWith(leadTokens[0]);
    const needTail = tailTokens.length && tailTokens.every((x) => check.missingFixed.includes(x)) && !t.trimEnd().endsWith(tailTokens[tailTokens.length - 1]);
    let candidate = t;
    if (needLead) candidate = `${lead}${candidate.trimStart()}`;
    if (needTail) candidate = `${candidate.trimEnd()}${tail}`;
    if (validateTwomTags(original, candidate).missingFixed.length < check.missingFixed.length) t = candidate;
  }
  return { text: t, changed: t !== translation };
}
