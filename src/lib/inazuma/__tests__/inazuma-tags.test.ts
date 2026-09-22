import { describe, expect, it } from "vitest";
import { extractInazumaTags, validateInazumaTags, isInazumaTranslatable, repairInazumaTags } from "../inazuma-tags";

describe("Inazuma technical tokens", () => {
  it("finds the engine's own tokens and nothing else", () => {
    expect(extractInazumaTags("Go\\nnow\\fthen %1F and %2F, %d points, %s!")).toEqual([
      "\\n", "\\f", "%1F", "%2F", "%d", "%s",
    ]);
  });

  it("reads a width-prefixed number slot as one token", () => {
    expect(extractInazumaTags("Team level %2d")).toEqual(["%2d"]);
  });

  it("leaves a percent that is part of the sentence alone", () => {
    // three lines in the whole cartridge write a real percentage this way
    expect(extractInazumaTags("goods 30% cheaper than shops.")).toEqual([]);
  });

  it("accepts a translation that kept every token in order", () => {
    const check = validateInazumaTags("%1F joined!\\nWelcome", "انضمّ %1F!\\nأهلاً");
    expect(check.valid).toBe(true);
  });

  it("refuses a translation that dropped a line break", () => {
    const check = validateInazumaTags("Hello\\nthere", "مرحباً هناك");
    expect(check.valid).toBe(false);
    expect(check.expected).toEqual(["\\n"]);
    expect(check.actual).toEqual([]);
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

  it("restores a dropped line break by splitting the Arabic in two", () => {
    // \\n is a line break, not a value, so re-splitting the words across the
    // original's line count puts it back without guessing at any meaning.
    const result = repairInazumaTags("Hi\\nthere %s", "أهلاً هناك");
    expect(result.text).toBe("أهلاً\\nهناك %s");
    expect(validateInazumaTags("Hi\\nthere %s", result.text).valid).toBe(true);
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
