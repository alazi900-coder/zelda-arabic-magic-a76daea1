import { describe, expect, it } from "vitest";
import { restoreInazumaTranslations, prepareInazumaLine, measureInazumaLine, INAZUMA_FILE_RE } from "../inazuma-editor-bridge";
import { inazumaNewline } from "../inazuma-rom";
import { measureEntryBytes } from "@/lib/entry-bytes";
import { categorizeInazumaEntry, INAZUMA_CATEGORIES } from "../inazuma-categories";
import { resolveGameParam } from "@/lib/game-param";
import { detectIssues } from "@/lib/diagnostic-detect";
import type { ExtractedEntry } from "@/components/editor/types";

const entry = (msbtFile: string, index = 0, original = "Hello"): ExtractedEntry => ({
  msbtFile,
  index,
  label: original,
  original,
  maxBytes: 0,
});

describe("Inazuma editor bridge", () => {
  it("keeps only the translations whose rows still exist", () => {
    const entries = [entry("inazuma/evet", 1), entry("inazuma/unitbase", 2)];
    const restored = restoreInazumaTranslations(entries, {
      "inazuma/evet:1": "مرحباً",
      "inazuma/mcht:99": "سطر اختفى",
    });
    expect(restored).toEqual({ "inazuma/evet:1": "مرحباً" });
  });

  it("claims its own file prefix", () => {
    expect(INAZUMA_FILE_RE.test("inazuma/evet")).toBe(true);
    expect(INAZUMA_FILE_RE.test("platinum/msg")).toBe(false);
  });
});

describe("Inazuma categories", () => {
  it("files each source under its own category", () => {
    expect(categorizeInazumaEntry(entry("inazuma/evet"))).toBe("iz-dialogue");
    expect(categorizeInazumaEntry(entry("inazuma/mcht"))).toBe("iz-match");
    expect(categorizeInazumaEntry(entry("inazuma/unitbase"))).toBe("iz-players");
    expect(categorizeInazumaEntry(entry("inazuma/pname"))).toBe("iz-names");
    expect(categorizeInazumaEntry(entry("inazuma/pshort"))).toBe("iz-names");
    expect(categorizeInazumaEntry(entry("inazuma/sname"))).toBe("iz-search");
    expect(categorizeInazumaEntry(entry("inazuma/iname"))).toBe("iz-itemnames");
    expect(categorizeInazumaEntry(entry("inazuma/blogr"))).toBe("iz-blog");
    expect(categorizeInazumaEntry(entry("inazuma/games"))).toBe("iz-minigames");
    expect(categorizeInazumaEntry(entry("inazuma/shout"))).toBe("iz-titles");
  });

  it("only produces categories the filter bar knows", () => {
    const ids = new Set(INAZUMA_CATEGORIES.map((c) => c.id));
    for (const file of ["inazuma/evet", "inazuma/mcht", "inazuma/unitbase", "inazuma/other"]) {
      expect(ids.has(categorizeInazumaEntry(entry(file)))).toBe(true);
    }
  });
});

describe("Inazuma wiring", () => {
  it("routes its rows to its own AI prompt lore", () => {
    expect(resolveGameParam("inazuma/evet")).toBe("inazuma");
  });

  it("makes the deep diagnostic flag a dropped engine token", () => {
    const issues = detectIssues(
      { msbtFile: "inazuma/evet", index: 3, label: "x", maxBytes: 0, original: "Ready?\\fLet's go, %1F!" },
      "مستعد؟ هيا بنا!"
    );
    expect(issues.some((i) => i.category === "inazuma_tag_mismatch" && i.severity === "critical")).toBe(true);
  });

  it("passes a translation that kept them", () => {
    const issues = detectIssues(
      { msbtFile: "inazuma/evet", index: 3, label: "x", maxBytes: 0, original: "Ready?\\fLet's go, %1F!" },
      "مستعد؟\\fهيا بنا يا %1F!"
    );
    expect(issues.some((i) => i.category === "inazuma_tag_mismatch")).toBe(false);
  });

  it("calls a dropped line break a split, not a broken token", () => {
    // Every other game in this editor reports a translation that ran two
    // lines together as "يحتاج تقسيم" and offers to split it. This one used
    // to call the same thing a missing tag and offer the English back.
    // `original` carries a real newline here, the same as extractInazumaEntries
    // hands the rest of the editor -- the cartridge's own literal `\n` never
    // reaches this layer.
    const issues = detectIssues(
      { msbtFile: "inazuma/evet", index: 4, label: "x", maxBytes: 0, original: "You got the manual for\n%s!" },
      "حصلت على دليل %s!"
    );
    expect(issues.some((i) => i.category === "under_split")).toBe(true);
    expect(issues.some((i) => i.category === "inazuma_tag_mismatch")).toBe(false);
  });

  it("still calls a dropped value slot a broken token", () => {
    const issues = detectIssues(
      { msbtFile: "inazuma/evet", index: 5, label: "x", maxBytes: 0, original: "Obtained: %s" },
      "تم الحصول عليه"
    );
    expect(issues.some((i) => i.category === "inazuma_tag_mismatch")).toBe(true);
    expect(issues.some((i) => i.category === "under_split")).toBe(false);
  });
});

describe("Inazuma forced build", () => {
  const long = "مرحبا يا صديقي العزيز كيف حالك اليوم";

  it("refuses an overlong line without force, and cuts it from its end with force", () => {
    expect(prepareInazumaLine("Hello there", long, 20)).toMatchObject({ encoded: null, tooLong: true });

    const forced = prepareInazumaLine("Hello there", long, 20, true);
    expect(forced.encoded).not.toBeNull();
    expect(forced.encoded!.length + 1).toBeLessThanOrEqual(20);
    expect(forced.cutWords).toBeGreaterThan(0);
    // what is left is the sentence's own opening words, not its closing ones
    const kept = long.split(" ").slice(0, long.split(" ").length - forced.cutWords).join(" ");
    expect(forced.encoded).toBe(prepareInazumaLine("Hello there", kept, undefined).encoded);
  });

  it("writes a line that lost an engine token only when forced", () => {
    expect(prepareInazumaLine("You got %d points!", "حصلت على نقاط", undefined).encoded).toBeNull();
    const forced = prepareInazumaLine("You got %d points!", "حصلت على نقاط", undefined, true);
    expect(forced.encoded).not.toBeNull();
    expect(forced.brokenTag).toBe(true);
  });

  it("drops a character the font cannot draw only when forced", () => {
    const plain = prepareInazumaLine("Hello", "ڤيديو", undefined);
    expect(plain.encoded).toBeNull();
    expect(plain.missing.length).toBeGreaterThan(0);
    const forced = prepareInazumaLine("Hello", "ڤيديو", undefined, true);
    expect(forced.encoded).not.toBeNull();
    expect([...forced.encoded!].every((ch) => ch.charCodeAt(0) <= 0xff)).toBe(true);
  });

  it("leaves a line that already fits exactly as the normal build writes it", () => {
    const normal = prepareInazumaLine("Hello", "مرحبا", 128);
    expect(prepareInazumaLine("Hello", "مرحبا", 128, true)).toEqual(normal);
  });
});

describe("Inazuma multi-line and page-break shaping", () => {
  it("shapes each printed line on its own, matching what shaping each line separately gives", () => {
    // The bug this guards: converting the real newline to the ROM's literal
    // `\n` *before* shaping merges every printed line into one BiDi run, so
    // shaping the whole message stops matching shaping each line alone --
    // which is exactly what a translator sees as lines swapping order on
    // screen. `original` carries no engine token, so any three-line Arabic
    // translation is accepted regardless of what it says.
    const original = "Line one. Line two. Line three.";
    const lines = ["سمعت شائعات أن النادي", "سيحل على أي حال. لا", "فائدة من الحماس الآن..."];
    const whole = prepareInazumaLine(original, lines.join("\n"), undefined).encoded;
    const perLine = lines.map((l) => prepareInazumaLine(original, l, undefined).encoded);
    expect(perLine.every((e) => e !== null)).toBe(true);
    expect(whole).toBe(perLine.join("\\n"));
  });

  it("writes \\n and \\f in their own order, never reversed into n\\ or f\\", () => {
    const original = "Miss Natsumi's fallen in love with someone...\\fIt's a lie! Tell me it's not true";
    const translation =
      "سمعت شائعات أن النادي\nسيحل على أي حال. لا\nفائدة من الحماس الآن...\\fإنها كذبة! قل لي إنها غير صحيحة!";
    const r = prepareInazumaLine(original, translation, undefined);
    expect(r.encoded).not.toBeNull();
    expect(r.encoded).not.toContain("n\\");
    expect(r.encoded).not.toContain("f\\");
    expect((r.encoded!.match(/\\n/g) ?? []).length).toBe(2);
    expect((r.encoded!.match(/\\f/g) ?? []).length).toBe(1);
  });

  it("keeps a %d/%s slot's characters together instead of splitting them across the reversed Arabic", () => {
    const original = "You got %d points, %s!";
    const r = prepareInazumaLine(original, "حصلت على %d نقطة يا %s!", undefined);
    expect(r.encoded).not.toBeNull();
    expect(r.encoded).toContain("%d");
    expect(r.encoded).toContain("%s");
    expect(r.brokenTag).toBe(false);
  });

  it("never lets Arabic on either side of a page break swap words across it", () => {
    // The bug this guards: masking `\f` as an inline token (like `%d`) keeps
    // its own two characters together, but does not stop `processArabicText`
    // from treating the whole message as one BiDi run when there is no real
    // newline between the boxes -- so a translation with only a `\f` between
    // two Arabic sentences had its words reordered *across* the page break,
    // mixing box one's words into box two and back.
    const original = "First box.\\fSecond box, unrelated.";
    const box1 = "بوصف اول جزء هنا";
    const box2 = "ثم جزء ثاني منفصل";
    const whole = prepareInazumaLine(original, `${box1}\\f${box2}`, undefined).encoded;
    expect(whole).not.toBeNull();
    const [gotBox1, gotBox2] = whole!.split("\\f");
    expect(gotBox1).toBe(prepareInazumaLine("x", box1, undefined).encoded);
    expect(gotBox2).toBe(prepareInazumaLine("x", box2, undefined).encoded);
  });
});

describe("Inazuma line breaks and byte counts", () => {
  it("writes a line break the way each file stores it", () => {
    expect(inazumaNewline("evet")).toBe("\\n");
    expect(inazumaNewline("mcht")).toBe("\\n");
    expect(inazumaNewline("unitbase")).toBe("\n");
    expect(inazumaNewline("blogp")).toBe("\n");
    const script = prepareInazumaLine("a\\nb", "سطر\nآخر", undefined).encoded!;
    const description = prepareInazumaLine("a\nb", "سطر\nآخر", 128, false, "\n").encoded!;
    expect(script).toContain("\\n");
    expect(description).toContain("\n");
    expect(description).not.toContain("\\");
    expect(description.length).toBe(script.length - 1);
  });

  it("counts one byte per Arabic letter, and a break as its file stores it", () => {
    expect(measureInazumaLine("inazuma/pname", "مرحبا")).toBe(5);
    expect(measureEntryBytes("inazuma/pname", "مرحبا")).toBe(5);
    expect(measureInazumaLine("inazuma/unitbase", "سطر\nآخر")).toBe(7);
    expect(measureInazumaLine("inazuma/evet", "سطر\nآخر")).toBe(8);
  });
});
