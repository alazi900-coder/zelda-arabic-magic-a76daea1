/**
 * The things in an Inazuma Eleven string that are not words.
 *
 * Measured against every text-bearing file in the cartridge (88,663 strings
 * from evet, mcht, unitbase.STR, item.STR, command.STR, games.STR,
 * rpgtitle.STR, team.pkb and fmt.pkb) rather than guessed:
 *
 *  • `\n` -- 30,051 times. A line break, stored as the two characters `\`
 *    and `n`, not as a 0x0A byte. Losing one runs two lines together.
 *  • `\f` -- 2,432 times. A page break: everything after it is a second box
 *    the player taps to reach. Losing one pushes that text off the bottom.
 *  • `%1F` `%2F` `%3F` `%4F` -- 11,011 times between them. Slots the engine
 *    fills at runtime with a name or a noun.
 *  • `%d` `%2d` `%4d` and `%s` -- 3,878 times. printf-style number and string
 *    slots, the same idea in the C library's spelling.
 *
 * A bare `%` is left alone: "30% cheaper than shops" is a sentence, and only
 * three strings in the whole cartridge use one that way.
 */
export const INAZUMA_TAG_RE = /\\[nf]|%[1-4]F|%\d?d|%s/g;

export function extractInazumaTags(text: string): string[] {
  return text.match(INAZUMA_TAG_RE) ?? [];
}

export interface InazumaTagCheck {
  valid: boolean;
  expected: string[];
  actual: string[];
  reason?: string;
}

/**
 * Whether a translation kept every token the original carries.
 *
 * Order is compared too, not just the multiset: `%1F` and `%2F` are two
 * different values the engine substitutes, so swapping them puts the wrong
 * word in each place rather than merely reordering the sentence.
 */
export function validateInazumaTags(original: string, translation: string): InazumaTagCheck {
  const expected = extractInazumaTags(original);
  const actual = extractInazumaTags(translation);
  const valid = expected.length === actual.length && expected.every((tag, i) => tag === actual[i]);
  return {
    valid,
    expected,
    actual,
    reason: valid
      ? undefined
      : `يجب إبقاء رموز إينازوما بالعدد والترتيب نفسيهما: ${expected.join(" ") || "لا توجد"} (‎\\n سطر جديد، ‎\\f صفحة جديدة، و‎%1F/%d/%s قيم تضعها اللعبة).`,
  };
}

/**
 * Puts back tokens the translation lost, in the place the original kept them.
 *
 * Two things a machine translator does to these tokens, measured on the
 * cartridge's own lines:
 *  • writes a lookalike character -- `٪s` (Arabic percent sign), `％s`
 *    (fullwidth), `\ن`, `/n` -- which the engine does not read as a token.
 *  • drops the token entirely, most often the `\n` between the words and the
 *    run of tokens at either end of the line.
 *
 * Both are repaired by rebuilding the line as: the original's leading run of
 * tokens, then the translated words with whatever tokens they still carry,
 * then the original's trailing run. A token missing from the middle is only
 * restored when every missing one is `\n`, by re-splitting the Arabic into
 * the original's line count. Anything else -- a token swapped for another, an
 * extra token, a `%1F`/`%2F` reorder -- is left for the translator, because
 * guessing its slot puts the wrong value on screen.
 */
function normalizeInazumaLookalikes(original: string, translation: string): string {
  let text = translation.replace(/[٪％]/g, "%").replace(/\\\s*ن/g, "\\n");
  if (original.includes("\\n") && !text.includes("\\n")) text = text.replace(/[/／∕]n/g, "\\n");
  if (original.includes("\\f") && !text.includes("\\f")) text = text.replace(/[/／∕]f/g, "\\f");
  // "% s" written with a stray space between the sign and its letter.
  return text.replace(/%\s+([1-4]F|\d?d|s)/g, "%$1");
}

/** Splits a run of words into `count` lines of roughly equal length. */
function splitIntoLines(text: string, count: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (count <= 1 || words.length < count) return [];
  const per = Math.ceil(words.length / count);
  const lines: string[] = [];
  for (let i = 0; i < count; i++) lines.push(words.slice(i * per, (i + 1) * per).join(" "));
  return lines.every((l) => l.length > 0) ? lines : [];
}

const LEAD_RUN_RE = /^((?:\\[nf]|%[1-4]F|%\d?d|%s)+)/;
const TAIL_RUN_RE = /((?:\\[nf]|%[1-4]F|%\d?d|%s)+)\s*$/;

export function repairInazumaTags(original: string, translation: string): { text: string; changed: boolean } {
  const normalized = normalizeInazumaLookalikes(original, translation);
  const done = (text: string) => ({ text, changed: text !== translation });
  if (validateInazumaTags(original, normalized).valid) return done(normalized);

  const expected = extractInazumaTags(original);
  const lead = original.match(LEAD_RUN_RE)?.[1] ?? "";
  const tail = original.match(TAIL_RUN_RE)?.[1] ?? "";
  const leadTags = extractInazumaTags(lead);
  const tailTags = extractInazumaTags(tail);
  const interior = expected.slice(leadTags.length, expected.length - tailTags.length);

  // The translated words, with the tokens that survived at either end removed.
  let core = normalized.trim().replace(LEAD_RUN_RE, "").replace(TAIL_RUN_RE, "").trim();
  if (!core) return { text: translation, changed: false };

  const coreTags = extractInazumaTags(core);
  if (coreTags.length !== interior.length || coreTags.some((t, i) => t !== interior[i])) {
    // Only an all-`\n` interior can be rebuilt: it marks a line break, not a
    // value slot, so re-splitting the words is safe.
    const missingAllNewlines = coreTags.length === 0 && interior.length > 0 && interior.every((t) => t === "\\n");
    if (!missingAllNewlines) return { text: translation, changed: false };
    const lines = splitIntoLines(core, interior.length + 1);
    if (lines.length === 0) return { text: translation, changed: false };
    core = lines.join("\\n");
  }

  const candidate = `${lead}${core}${tail}`;
  return validateInazumaTags(original, candidate).valid ? done(candidate) : { text: translation, changed: false };
}

/**
 * A scene id the script addresses a cutscene by -- `mr01b04`, `mr02i27`.
 * 173 of them sit in the dialogue archive as ordinary records. Narrow on
 * purpose: player names (Gouenji, Kabeyama) are single ASCII tokens too, and
 * those a translator does want.
 */
const SCENE_ID_RE = /^[a-z]{1,3}\d{1,3}[a-z]\d{1,3}[a-z]?$/;

/** Script switches, not text: only EncountON/OFF and HookTimerON/OFF exist. */
const ENGINE_FLAG_RE = /^[A-Za-z]+(?:ON|OFF)$/;

/**
 * Whether a line is one the player can actually read in this build.
 *
 * Three kinds of record are kept out of the editor, all measured against the
 * cartridge rather than guessed:
 *
 *  • Untranslated Japanese -- roughly 40% of the kind-1 records in this
 *    European release. Half are internal state dumps for the scouting system
 *    ("PartyCount=%d", "[ScoutLv=91]"), the rest dialogue no English script
 *    ever replaced. Neither is English to translate from, and a machine
 *    translation pass over either produces nonsense. The test is the raw
 *    Shift-JIS byte: this reader keeps one byte per character, so anything at
 *    or above 0x80 is half of a Japanese pair.
 *  • Scene ids (173) and engine switches (870), which the script reads and no
 *    screen ever prints.
 */
export function isInazumaTranslatable(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) >= 0x80) return false;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (SCENE_ID_RE.test(trimmed)) return false;
  if (ENGINE_FLAG_RE.test(trimmed)) return false;
  return true;
}
