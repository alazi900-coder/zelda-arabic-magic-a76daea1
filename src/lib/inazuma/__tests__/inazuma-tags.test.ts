import { describe, expect, it } from "vitest";
import { extractInazumaTags, validateInazumaTags, isInazumaTranslatable, repairInazumaTags, inazumaSlotsAgree, maskInazumaTokens, unmaskInazumaTokens } from "../inazuma-tags";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INAZUMA_TAG_RE, findMisplacedInazumaBreak } from "../inazuma-tags";
import { detectIssues } from "@/lib/diagnostic-detect";
import { toInazumaBreakTokens, fromInazumaBreakTokens } from "../inazuma-break-tokens";

describe("Inazuma technical tokens", () => {
  it("finds the engine's own tokens and nothing else", () => {
    // The line break is deliberately absent here: the editor holds it as a
    // real newline (see inazuma-editor-bridge.ts), the same as every other
    // game, so this module never sees it as a token to track.
    expect(extractInazumaTags("Go\\fthen %1F and %2F, %d points, %s!")).toEqual([
      "\\f", "%1F", "%2F", "%d", "%s",
    ]);
  });

  it("reads a width-prefixed number slot as one token", () => {
    expect(extractInazumaTags("Team level %2d")).toEqual(["%2d"]);
  });

  it("leaves a percent that is part of the sentence alone", () => {
    // three lines in the whole cartridge write a real percentage this way
    expect(extractInazumaTags("goods 30% cheaper than shops.")).toEqual([]);
  });

  it("does not track a real newline as a token", () => {
    // A merged line is a splitting problem for the shared line tools every
    // other game already uses, not a token this module refuses to guess.
    expect(extractInazumaTags("Hi\nthere")).toEqual([]);
  });

  it("accepts a translation that kept every token in order", () => {
    const check = validateInazumaTags("%1F joined!\\fWelcome", "انضمّ %1F!\\fأهلاً");
    expect(check.valid).toBe(true);
  });

  it("refuses a translation that dropped a page break", () => {
    const check = validateInazumaTags("Hello\\fthere", "مرحباً هناك");
    expect(check.valid).toBe(false);
    expect(check.expected).toEqual(["\\f"]);
    expect(check.actual).toEqual([]);
  });

  it("passes a translation that only differs by a merged line, since that is not this module's concern", () => {
    const check = validateInazumaTags("Hello\nthere %s", "مرحباً هناك %s");
    expect(check.valid).toBe(true);
  });

  it("refuses a translation that swapped two runtime slots", () => {
    // %1F and %2F are different values, so swapping puts the wrong word in each
    const check = validateInazumaTags("%1F beat %2F", "%2F هزم %1F");
    expect(check.valid).toBe(false);
  });
});

describe("Inazuma token repair", () => {
  it("reattaches a clean trailing token the translation dropped", () => {
    const result = repairInazumaTags("You got %s", "حصلت على");
    expect(result.changed).toBe(true);
    expect(result.text).toBe("حصلت على %s");
    expect(validateInazumaTags("You got %s", result.text).valid).toBe(true);
  });

  it("does nothing when the translation already has every token", () => {
    const result = repairInazumaTags("You got %s", "حصلت على %s");
    expect(result.changed).toBe(false);
    expect(result.text).toBe("حصلت على %s");
  });

  it("puts a token back at the start when that is where the original opened", () => {
    // %s here is a name slot the sentence opens with, so it goes back to the
    // front -- with the space the original kept after it, or the name would
    // print glued to the next word.
    const result = repairInazumaTags("%s joined you!", "انضم إليك");
    expect(result.text).toBe("%s انضم إليك");
    expect(validateInazumaTags("%s joined you!", result.text).valid).toBe(true);
  });

  it("leaves a merged line untouched -- that is the shared line-balancer's job, not this function's", () => {
    const result = repairInazumaTags("Hi\nthere %s", "أهلاً هناك %s");
    expect(result.changed).toBe(false);
  });

  it("still refuses to guess when a value slot is reordered", () => {
    // %1F and %2F hold different values: putting them back the wrong way
    // round prints the wrong name in each place.
    const result = repairInazumaTags("%1F beat %2F", "%2F هزم %1F");
    expect(result.changed).toBe(false);
  });

  it("repairs the lookalike percent an auto-translator writes", () => {
    const result = repairInazumaTags("You got %s", "حصلت على ٪s");
    expect(result.text).toBe("حصلت على %s");
  });
});

// The repair hands the break back as `▼`, the editor's spelling of `\\f`
// (inazuma-break-tokens.ts): its result goes straight into the editor.
describe("Inazuma page breaks", () => {
  it("puts a page break back with the slot alone on its own line", () => {
    // Same shape as a merged-line case, except `\\f` starts a whole new
    // dialogue box, so it stays a tracked token this module places itself.
    const original = "%s\\fjoined you!";
    const result = repairInazumaTags(original, "%s انضم إليك!");
    expect(result.text).toBe("%s▼\nانضم إليك!");
    expect(validateInazumaTags(original, result.text).valid).toBe(true);
  });

  it("breaks before the slot when that is where the original breaks", () => {
    const original = "You got the manual for\\f%s!";
    const result = repairInazumaTags(original, "لقد حصلت على الدليل الخاص بـ %s !");
    expect(result.text).toBe("لقد حصلت على الدليل الخاص بـ▼\n%s !");
    expect(validateInazumaTags(original, result.text).valid).toBe(true);
  });

  it("restores every page break when the original has more than one", () => {
    const result = repairInazumaTags("A\\fB\\fC", "واحد اثنان ثلاثة");
    expect(result.text).toBe("واحد▼\nاثنان▼\nثلاثة");
  });

  it("leaves the text alone when there are too few words to fill every box", () => {
    // one word cannot become two boxes without rendering a blank one
    const result = repairInazumaTags("A\\fB", "واحد");
    expect(result.changed).toBe(false);
  });

  it("sees that only breaks differ, so the editor can stop calling it a damaged token", () => {
    expect(inazumaSlotsAgree("%s\\fjoined you!", "%s انضم إليك!")).toBe(true);
    expect(inazumaSlotsAgree("Hi\nthere %s", "أهلاً هناك")).toBe(false);
    expect(inazumaSlotsAgree("%1F beat %2F", "%2F هزم %1F")).toBe(false);
  });

  it("restores a page break as a page break, not as a line", () => {
    // \\f ends the whole box: the words after it are what the player sees
    // once they tap. It goes back in the original's place, in its own kind.
    const original = "Ready?\\fLet's go, %1F!";
    const result = repairInazumaTags(original, "مستعد؟ هيا بنا يا %1F!");
    expect(result.text).toBe("مستعد؟▼\nهيا بنا يا %1F!");
    expect(validateInazumaTags(original, result.text).valid).toBe(true);
  });
});

describe("Inazuma translatable lines", () => {
  it("accepts ordinary English", () => {
    expect(isInazumaTranslatable("No one has more love for football")).toBe(true);
  });

  it("rejects a line carrying raw Shift-JIS bytes", () => {
    // a leftover Japanese line reads back one byte per character
    expect(isInazumaTranslatable("\x82\xb1\x82\xcc\x90l")).toBe(false);
  });

  it("rejects an empty slot", () => {
    expect(isInazumaTranslatable("   ")).toBe(false);
  });

  it("rejects a scene id the script addresses a cutscene by", () => {
    expect(isInazumaTranslatable("mr01b04")).toBe(false);
    expect(isInazumaTranslatable("mr02i27")).toBe(false);
  });

  it("rejects an engine switch", () => {
    expect(isInazumaTranslatable("EncountON")).toBe(false);
    expect(isInazumaTranslatable("HookTimerOFF")).toBe(false);
  });

  it("still keeps a player name, which is a single ASCII token too", () => {
    expect(isInazumaTranslatable("Gouenji")).toBe(true);
    expect(isInazumaTranslatable("Kabeyama")).toBe(true);
  });
});

describe("Inazuma token masking", () => {
  it("replaces every token with one private-use character and restores it exactly", () => {
    const text = "Go\\fthen %1F and %2F, %d points, %s!";
    const { masked, tokens } = maskInazumaTokens(text);
    expect(tokens).toEqual(["\\f", "%1F", "%2F", "%d", "%s"]);
    expect(masked).not.toContain("\\f");
    expect(masked).not.toContain("%1F");
    expect(unmaskInazumaTokens(masked, tokens)).toBe(text);
  });

  it("leaves text with no tokens untouched", () => {
    const text = "لا رموز هنا";
    const { masked, tokens } = maskInazumaTokens(text);
    expect(masked).toBe(text);
    expect(tokens).toEqual([]);
    expect(unmaskInazumaTokens(masked, tokens)).toBe(text);
  });
});

describe("Inazuma tokens are protected by the AI enhance/translate tools", () => {
  it("refuses (client-side) a suggestion that drops \\f/%1F/%d/%s", () => {
    const wouldSave = (original: string, suggestion: string) =>
      validateInazumaTags(original, repairInazumaTags(original, suggestion).text).valid;
    expect(wouldSave("Go\\fthen %1F points", "اذهب ثم نقاط")).toBe(false); // \f and %1F both dropped
    expect(wouldSave("Go\\fthen %1F points", "اذهب\\fثم %1F نقاط")).toBe(true);
  });

  const PANEL = readFileSync(resolve(__dirname, "../../../components/editor/TranslationAIEnhancePanel.tsx"), "utf8");
  const ENHANCE_SOURCE = readFileSync(resolve(__dirname, "../../../../supabase/functions/enhance-translations/index.ts"), "utf8");
  const TRANSLATE_SOURCE = readFileSync(resolve(__dirname, "../../../../supabase/functions/translate-entries/index.ts"), "utf8");

  it("checks the panel before counting a suggestion as applied", () => {
    expect(PANEL).toContain('const isInazuma = gameParam === "inazuma"');
    expect(PANEL).toContain("if (isInazuma) return validateInazumaTags(original, repairInazumaTags(original, suggestion).text).reason ?? null;");
  });

  it("rejects the suggestion in the edge function before it is returned", () => {
    expect(ENHANCE_SOURCE).toContain("preservesInazumaTokenSequence");
    expect(ENHANCE_SOURCE).toContain("(!isInazuma || preservesInazumaTokenSequence(original, suggested))");
    expect(ENHANCE_SOURCE.match(/isSafeSuggestion\(/g)?.length).toBe(
      (ENHANCE_SOURCE.match(/isPokemonXp, isCrashlands, isNinthDawn, isInazuma\)/g)?.length ?? 0) + 1
    );
  });

  it("uses the same four token shapes as the editor", () => {
    const edge = /const INAZUMA_TOKEN_REGEX = (\/.+?\/g);/.exec(ENHANCE_SOURCE);
    expect(edge).not.toBeNull();
    expect(edge![1]).toBe(INAZUMA_TAG_RE.source.replace(/^/, "/") + "/g");
  });

  it("masks \\f and %1F..%4F before the auto-translate model ever sees them", () => {
    expect(TRANSLATE_SOURCE).toContain("if (_game === 'inazuma')");
    expect(TRANSLATE_SOURCE).toContain("const inazumaRegex = /\\\\f|▼|%[1-4]F/g;");
    expect(TRANSLATE_SOURCE).toContain("game === 'inazuma' ? 'inazuma' : 'xenoblade';");
  });
});

describe("Inazuma page break held as ▼ in the editor, like Platinum's pauses", () => {
  it("round-trips the cartridge's \\f exactly", () => {
    const rom = "Your speed will drop if you lose\ntoo much FP.\\fYou can see when this happens";
    const editor = toInazumaBreakTokens(rom);
    expect(editor).toBe("Your speed will drop if you lose\ntoo much FP.▼\nYou can see when this happens");
    expect(editor).not.toContain("\\f");
    expect(fromInazumaBreakTokens(editor)).toBe(rom);
  });

  it("accepts ▼ typed without its newline, and a literal \\f saved before ▼ existed", () => {
    expect(fromInazumaBreakTokens("أ▼ب")).toBe("أ\\fب");
    expect(fromInazumaBreakTokens("أ\\fب")).toBe("أ\\fب");
    expect(toInazumaBreakTokens(toInazumaBreakTokens("a\\fb"))).toBe("a▼\nb");
  });

  it("reads ▼ and \\f as the same token, so neither spelling is a missing break", () => {
    expect(validateInazumaTags("FP.\\fYou can", "اللياقة.▼\nسترى").valid).toBe(true);
    expect(validateInazumaTags("FP.▼\nYou can", "اللياقة. سترى").valid).toBe(false);
  });

  it("puts a lost page break back as ▼, where the English has it", () => {
    const original = toInazumaBreakTokens("Your speed will drop.\\fYou can see it.");
    const fixed = repairInazumaTags(original, "ستنخفض سرعتك. سترى ذلك.");
    expect(fixed.changed).toBe(true);
    expect(fixed.text).toContain("▼");
    expect(fixed.text).not.toContain("\\f");
    expect(validateInazumaTags(original, fixed.text).valid).toBe(true);
  });

  it("puts a lost page break at the end of its sentence, not where a word count lands", () => {
    // The line reported from the editor: the translator wrote the two boxes as
    // two lines and the break was lost. Counting words put ▼ after "من",
    // mid-sentence; the English box ends a sentence, so the Arabic cut goes
    // after "اللياقة." -- and the translator's own line break becomes the ▼.
    const original = toInazumaBreakTokens(
      "Your speed will drop if you lose\\ntoo much FP.\\fYou can see when this happens to\\none of your players because he'll\\nstart sweating.".replace(/\\\\n/g, "\n"),
    );
    const translation = "ستنخفض سرعتك إذا فقدت الكثير من نقاط اللياقة.\nسترى ذلك عندما يبدأ أحد لاعبيك بالتعرق.";
    expect(repairInazumaTags(original, translation).text).toBe(
      "ستنخفض سرعتك إذا فقدت الكثير من نقاط اللياقة.▼\nسترى ذلك عندما يبدأ أحد لاعبيك بالتعرق.",
    );
  });

  it("leaves a line that needs nothing exactly as it was", () => {
    const original = toInazumaBreakTokens("A.\\fB.");
    expect(repairInazumaTags(original, "أ.▼ب.")).toEqual({ text: "أ.▼ب.", changed: false });
  });
});

describe("Inazuma page break in the wrong place", () => {
  const original = toInazumaBreakTokens("Your speed will drop if you lose too much FP.\\fYou can see when this happens.");
  const entry = { msbtFile: "inazuma/evet", index: 1, label: "", original, maxBytes: 0 };

  it("finds a ▼ mid-sentence and moves it to the end of the sentence, words untouched", () => {
    const damaged = "ستنخفض سرعتك إذا فقدت الكثير من▼\nنقاط اللياقة. سترى ذلك عندما يحدث.";
    expect(detectIssues(entry, damaged).map((i) => i.category)).toContain("inazuma_break_misplaced");
    expect(repairInazumaTags(original, damaged).text).toBe(
      "ستنخفض سرعتك إذا فقدت الكثير من نقاط اللياقة.▼\nسترى ذلك عندما يحدث.",
    );
  });

  it("leaves a ▼ that ends a sentence alone, even where the English would not put it", () => {
    // the translator may have split one English sentence into two
    const other = "ستنخفض سرعتك. إذا فقدت الكثير من نقاط اللياقة.▼\nسترى ذلك.";
    expect(findMisplacedInazumaBreak(original, other)).toBeNull();
    expect(detectIssues(entry, other).map((i) => i.category)).not.toContain("inazuma_break_misplaced");
  });

  it("says nothing about a correctly placed ▼", () => {
    const good = "ستنخفض سرعتك إذا فقدت الكثير من نقاط اللياقة.▼\nسترى ذلك.";
    expect(findMisplacedInazumaBreak(original, good)).toBeNull();
  });
});
