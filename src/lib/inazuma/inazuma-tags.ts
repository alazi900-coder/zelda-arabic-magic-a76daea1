import { splitChunkEvenly } from "@/lib/balance-lines";

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

/**
 * Splits a run of words into `count` lines of roughly equal length, using the
 * same balancer every other game in this editor splits with, so a line breaks
 * in the Arabic where it breaks in the English rather than at a word count.
 * The balancer joins with a real newline; this cartridge stores a break as the
 * two characters `\` and `n`, so that is what comes back out.
 */
function splitIntoLines(text: string, count: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (count <= 1 || words.length < count) return [];
  const lines = splitChunkEvenly(text, count).split("\n");
  return lines.length === count && lines.every((l) => l.trim().length > 0) ? lines : [];
}

// The gap is captured alongside the run so the original's own spacing comes
// back with it: "%s joined you!" puts a space between the name and the verb,
// and rebuilding the line without it prints the name glued to the next word.
// A run of "\n" carries no gap, so nothing is added where nothing was there.
/**
 * Whether both texts carry the same value slots in the same order -- so the
 * only thing that can differ between them is where the lines break.
 *
 * The editor asks this before calling a line a "damaged token": a translation
 * that ran two lines together has lost nothing the player can see a hole for,
 * and reporting it as a broken `%s` sent the translator looking for a fault
 * that was not there -- twice over, since two separate checks said it.
 */
export function inazumaSlotsAgree(original: string, translation: string): boolean {
  const o = original.match(new RegExp(SLOT_RE.source, "g")) ?? [];
  const t = translation.match(new RegExp(SLOT_RE.source, "g")) ?? [];
  return o.length === t.length && o.every((slot, i) => slot === t[i]);
}

/**
 * The line break, written as the two characters `\` and `n`.
 *
 * This is the one token in the cartridge that carries no value: it says where
 * a line ends and nothing more. Every other game in this editor writes that as
 * a real newline, which is why their splitters handle it and this one's did
 * not -- here it sits in the same regex as `%s`, so a translation that merged
 * two lines read as a missing *value*, and the repair refused to guess it. It
 * is safe to guess, though: the original says exactly where the cut goes.
 */
const NEWLINE_TOKEN = "\\n";

/** Every token EXCEPT the line break: these hold a value and are never guessed. */
const SLOT_RE = /\\f|%[1-4]F|%\d?d|%s/g;

/** Splits text into the prose between its value slots: [prose, slot, prose, ...]. */
function splitOnSlots(text: string): { prose: string[]; slots: string[] } {
  const prose: string[] = [];
  const slots: string[] = [];
  const re = new RegExp(SLOT_RE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    prose.push(text.slice(last, m.index));
    slots.push(m[0]);
    last = m.index + m[0].length;
  }
  prose.push(text.slice(last));
  return { prose, slots };
}

function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Hands out `text`'s words to as many pieces as `share` has entries, each
 * piece getting words in the proportion the original gave it.
 *
 * A piece the original left empty gets nothing -- that is what puts `%s` alone
 * on its own line in "%s\njoined you!" instead of dragging a word up with it.
 * A piece the original filled gets at least one word, so no line renders
 * blank; when there are not enough words to go round, nothing is returned and
 * the line is left for the translator.
 */
function shareWords(text: string, share: number[]): string[] | null {
  const words = wordsOf(text);
  const filled = share.filter((n) => n > 0).length;
  const total = share.reduce((a, b) => a + b, 0);
  if (total === 0 || words.length < filled) return null;

  const counts = share.map((n) => (n > 0 ? Math.max(1, Math.round((n / total) * words.length)) : 0));
  let diff = words.length - counts.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    let pick = -1;
    for (let i = 0; i < counts.length; i++) {
      if (share[i] === 0) continue;
      if (diff < 0 && counts[i] <= 1) continue;
      if (pick < 0 || counts[i] > counts[pick]) pick = i;
    }
    if (pick < 0) return null;
    counts[pick] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }

  const out: string[] = [];
  let at = 0;
  for (const count of counts) {
    out.push(words.slice(at, at + count).join(" "));
    at += count;
  }
  return out;
}

/**
 * Puts back the line breaks a translation lost, cutting the Arabic where the
 * original cuts the English.
 *
 * Only runs when every value slot is still present, in the original's order --
 * so the slots anchor the two texts to each other, and each break can be
 * placed in the same prose run it occupies in the original. Returns null when
 * the two do not line up, leaving the sentence untouched.
 */
function restoreNewlines(original: string, translation: string): string | null {
  const o = splitOnSlots(original);
  const t = splitOnSlots(translation);
  if (o.slots.length !== t.slots.length) return null;
  if (o.slots.some((slot, i) => slot !== t.slots[i])) return null;

  const rebuilt: string[] = [];
  for (let i = 0; i < o.prose.length; i++) {
    const origLines = o.prose[i].split(NEWLINE_TOKEN);
    if (origLines.length === 1) {
      rebuilt.push(t.prose[i]);
      continue;
    }
    // A break the translation already has here would be doubled by the rebuild.
    if (t.prose[i].includes(NEWLINE_TOKEN)) return null;
    const pieces = shareWords(t.prose[i], origLines.map((line) => wordsOf(line).length));
    if (!pieces) return null;
    rebuilt.push(pieces.join(NEWLINE_TOKEN));
  }

  let out = rebuilt[0];
  for (let i = 0; i < t.slots.length; i++) out += t.slots[i] + rebuilt[i + 1];
  return out;
}

const LEAD_RUN_RE = /^((?:\\[nf]|%[1-4]F|%\d?d|%s)+)([ \t]*)/;
const TAIL_RUN_RE = /([ \t]*)((?:\\[nf]|%[1-4]F|%\d?d|%s)+)\s*$/;

export function repairInazumaTags(original: string, translation: string): { text: string; changed: boolean } {
  const normalized = normalizeInazumaLookalikes(original, translation);
  const done = (text: string) => ({ text, changed: text !== translation });
  if (validateInazumaTags(original, normalized).valid) return done(normalized);

  // Losing a line break is a splitting problem, not a token one: every value
  // slot is still there, the words were just run onto one line. Put the breaks
  // back where the original puts them before falling back to the token repair.
  const split = restoreNewlines(original, normalized);
  if (split !== null && validateInazumaTags(original, split).valid) return done(split);

  const expected = extractInazumaTags(original);
  const leadMatch = original.match(LEAD_RUN_RE);
  const tailMatch = original.match(TAIL_RUN_RE);
  const lead = leadMatch ? leadMatch[1] + leadMatch[2] : "";
  const tail = tailMatch ? tailMatch[1] + tailMatch[2] : "";
  const leadTags = extractInazumaTags(lead);
  const tailTags = extractInazumaTags(tail);
  const interior = expected.slice(leadTags.length, expected.length - tailTags.length);

  // Whatever run of tokens the translation already carries at either end is
  // about to be replaced by the original's. That is only safe when the two
  // agree: "%2F هزم %1F" against "%1F beat %2F" would otherwise be rewritten
  // into the original's order and print the wrong name in each slot, which is
  // exactly the kind of guess this function must not make.
  const trimmedTrans = normalized.trim();
  const transLead = extractInazumaTags(trimmedTrans.match(LEAD_RUN_RE)?.[1] ?? "");
  const transTail = extractInazumaTags(trimmedTrans.match(TAIL_RUN_RE)?.[2] ?? "");
  const runAgrees = (theirs: string[], ours: string[]) =>
    theirs.length === 0 || (theirs.length === ours.length && theirs.every((t, i) => t === ours[i]));
  if (!runAgrees(transLead, leadTags) || !runAgrees(transTail, tailTags)) {
    return { text: translation, changed: false };
  }

  // The translated words, with the tokens that survived at either end removed.
  let core = trimmedTrans.replace(LEAD_RUN_RE, "").replace(TAIL_RUN_RE, "").trim();
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
