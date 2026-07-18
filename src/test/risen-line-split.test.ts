import { describe, it, expect } from "vitest";
import { splitLongLines, getLongestLineLength, hasArabicText, planLineSplit, joinLines, planLineJoin } from "@/lib/risen-line-split";

describe("splitLongLines", () => {
  it("splits a long single-line Arabic text only at spaces, all lines <= limit", () => {
    const words = Array.from({ length: 30 }, (_, i) => `كلمة${i}`);
    const text = words.join(" ");
    expect(text.length).toBeGreaterThan(150);

    const result = splitLongLines(text, 40, "\r\n");
    const lines = result.split("\r\n");

    for (const line of lines) expect(line.length).toBeLessThanOrEqual(40);
    // No word was cut — every line's trimmed words are a subset of the original words, in order.
    expect(lines.join(" ")).toBe(text);
  });

  it("keeps a protected token intact on its own line when it straddles the limit", () => {
    const text = "بعض الكلمات هنا <VeryLongTagName> كلمات أخرى بعدها";
    const result = splitLongLines(text, 20, "\n");
    const lines = result.split("\n");

    const tagLine = lines.find((l) => l.includes("<VeryLongTagName>"));
    expect(tagLine).toBeDefined();
    expect(tagLine).toContain("<VeryLongTagName>");
    // The tag itself must never be split across two lines.
    expect(result.match(/<VeryLongTagName>/g)?.length).toBe(1);
  });

  it("preserves existing manual line breaks and only splits the long line", () => {
    const shortLine = "سطر قصير";
    const longLine = Array.from({ length: 20 }, (_, i) => `كلمة${i}`).join(" ");
    const text = `${shortLine}\r\n${longLine}\r\n${shortLine}`;

    const result = splitLongLines(text, 40, "\r\n");
    const lines = result.split("\r\n");

    expect(lines[0]).toBe(shortLine);
    expect(lines[lines.length - 1]).toBe(shortLine);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(40);
  });

  it("keeps a single word longer than the limit whole on its own line", () => {
    const longWord = "كلمةطويلةجداًلاتحتويعلىأيمسافاتإطلاقاًوتتجاوزالحدبكثير";
    expect(longWord.length).toBeGreaterThan(40);
    const text = `قبل ${longWord} بعد`;

    const result = splitLongLines(text, 40, "\n");
    expect(result).toContain(longWord);
    const lines = result.split("\n");
    expect(lines.some((l) => l === longWord)).toBe(true);
  });

  it("uses the given break style for newly inserted breaks", () => {
    const text = Array.from({ length: 15 }, (_, i) => `كلمة${i}`).join(" ");
    const withCRLF = splitLongLines(text, 30, "\r\n");
    const withLF = splitLongLines(text, 30, "\n");
    expect(withCRLF).toContain("\r\n");
    expect(withLF).not.toContain("\r\n");
    expect(withLF).toContain("\n");
  });

  it("leaves an already-short text unchanged", () => {
    const text = "نص قصير لا يحتاج تقسيماً";
    expect(splitLongLines(text, 40, "\r\n")).toBe(text);
  });

  it("does not strand a single word alone on a middle line when a better balance exists", () => {
    // A naive greedy word-wrap fills line 1 first, then starts line 2 with
    // whatever word didn't fit — if the *next* word also doesn't fit next to
    // it, line 2 ends up as a single word while line 3 continues, exactly the
    // reported bug. The balanced splitter should redistribute instead.
    const word1 = "ا".repeat(16);
    const word2 = "ب".repeat(16);
    const word3 = "ج".repeat(17);
    const word4 = "ح".repeat(25);
    const word5 = "د".repeat(4);
    const text = [word1, word2, word3, word4, word5].join(" ");

    const result = splitLongLines(text, 40, "\n");
    const lines = result.split("\n");

    for (const line of lines) expect(line.length).toBeLessThanOrEqual(40);
    // No middle line should be a lone word when it could have been paired
    // with a neighbor without busting the limit.
    for (let i = 1; i < lines.length - 1; i++) {
      expect(lines[i].split(" ").length).toBeGreaterThan(1);
    }
    // Content is fully preserved, in order, no words cut.
    expect(lines.join(" ")).toBe(text);
  });

  it("prefers fewer, fuller lines over more, choppier ones when both fit the limit (reported bug)", () => {
    // Real reported case: 52 chars at limit=25 used to produce 4 lines
    // (11/10/14/14) instead of the clearly better 3-line split (17/19/14),
    // because the scorer compared ABSOLUTE spread across different
    // candidate line counts — shorter lines have a smaller absolute spread
    // even when proportionally just as uneven, unfairly favoring more lines.
    const text = "الماء ومرور الزمن أثرا على هذا السلاح المعدن صدئ وهش";
    expect(text.length).toBe(52);

    const result = splitLongLines(text, 25, "\n");
    const lines = result.split("\n");

    expect(lines.length).toBe(3);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(25);
    expect(lines.join(" ")).toBe(text);
  });
});

describe("getLongestLineLength", () => {
  it("returns the length of the longest logical line", () => {
    const text = "short\nا longer middle line here\nshort";
    const lines = text.split("\n");
    const expected = Math.max(...lines.map((l) => l.length));
    expect(getLongestLineLength(text)).toBe(expected);
  });

  it("matches the 'نصوص طويلة' filter threshold for a single 38-char line", () => {
    const line = "ا".repeat(38);
    expect(getLongestLineLength(line)).toBe(38);
    expect(getLongestLineLength(line) >= 35).toBe(true);
  });

  it("does not match when 200 chars are already split into 30-char lines", () => {
    const lines = Array.from({ length: 7 }, () => "ا".repeat(30));
    const text = lines.join("\n");
    expect(text.length).toBeGreaterThan(200);
    expect(getLongestLineLength(text)).toBe(30);
    expect(getLongestLineLength(text) >= 35).toBe(false);
  });

  it("returns 0 for an empty/untranslated text (never matches the filter)", () => {
    expect(getLongestLineLength("")).toBe(0);
  });
});

describe("hasArabicText", () => {
  it("detects Arabic text", () => {
    expect(hasArabicText("مرحبا")).toBe(true);
  });

  it("rejects pure-Latin text", () => {
    expect(hasArabicText("Hello World")).toBe(false);
  });

  it("detects mixed Arabic/Latin text", () => {
    expect(hasArabicText("Hello مرحبا")).toBe(true);
  });
});

describe("planLineSplit", () => {
  const longArabic = Array.from({ length: 20 }, (_, i) => `كلمة${i}`).join(" ");

  it("scope: only touches entries in the given (already-filtered) list, not others with long text in translations", () => {
    const inScope = { msbtFile: "infos.tab", index: 1, original: "In scope, long dialogue line." };
    const outOfScopeKey = "infos.tab:2";
    const translations: Record<string, string> = {
      "infos.tab:1": longArabic,
      [outOfScopeKey]: longArabic, // also long + Arabic — would qualify if it were passed in
    };

    // Simulates an active filter/search: only `inScope` is part of the
    // currently-visible (filtered) entries passed to the planner.
    const plan = planLineSplit([inScope], translations, 40);

    expect(plan.targetKeys).toEqual(["infos.tab:1"]);
    expect(plan.updates).toHaveProperty("infos.tab:1");
    expect(plan.snapshot).toHaveProperty("infos.tab:1");
    // The out-of-scope entry must be completely untouched.
    expect(plan.updates).not.toHaveProperty(outOfScopeKey);
    expect(plan.snapshot).not.toHaveProperty(outOfScopeKey);
    expect(translations[outOfScopeKey]).toBe(longArabic);
  });

  it("undo: applying the snapshot restores the exact original values", () => {
    const entries = [
      { msbtFile: "infos.tab", index: 1, original: "First long dialogue line here." },
      { msbtFile: "quests.tab", index: 5, original: "Second long quest description line." },
    ];
    const originalTranslations: Record<string, string> = {
      "infos.tab:1": longArabic,
      "quests.tab:5": Array.from({ length: 25 }, (_, i) => `مهمة${i}`).join(" "),
    };

    const plan = planLineSplit(entries, originalTranslations, 40);
    expect(plan.targetKeys.length).toBe(2);

    // Apply.
    const afterApply: Record<string, string> = { ...originalTranslations, ...plan.updates };
    expect(afterApply["infos.tab:1"]).not.toBe(originalTranslations["infos.tab:1"]);
    expect(afterApply["quests.tab:5"]).not.toBe(originalTranslations["quests.tab:5"]);

    // Undo via the snapshot.
    const afterUndo: Record<string, string> = { ...afterApply, ...plan.snapshot };
    expect(afterUndo["infos.tab:1"]).toBe(originalTranslations["infos.tab:1"]);
    expect(afterUndo["quests.tab:5"]).toBe(originalTranslations["quests.tab:5"]);
  });

  it("skips entries that don't need splitting and pure-Latin translations", () => {
    const entries = [
      { msbtFile: "infos.tab", index: 1, original: "Short." },
      { msbtFile: "infos.tab", index: 2, original: "Long English original." },
    ];
    const translations: Record<string, string> = {
      "infos.tab:1": "قصير",
      "infos.tab:2": Array.from({ length: 20 }, (_, i) => `word${i}`).join(" "), // long but pure-Latin
    };

    const plan = planLineSplit(entries, translations, 40);
    expect(plan.targetKeys).toEqual([]);
  });
});

describe("joinLines", () => {
  it("is the exact inverse of splitLongLines — round-trips back to the original text", () => {
    const words = Array.from({ length: 30 }, (_, i) => `كلمة${i}`);
    const text = words.join(" ");
    const split = splitLongLines(text, 40, "\r\n");
    expect(split).not.toBe(text); // sanity: it actually did split into multiple lines
    expect(joinLines(split)).toBe(text);
  });

  it("never glues two words together — always inserts exactly one space at each break", () => {
    const joined = joinLines("الكلمة الأولى\r\nالكلمة الثانية\nالكلمة الثالثة");
    expect(joined).toBe("الكلمة الأولى الكلمة الثانية الكلمة الثالثة");
  });

  it("leaves an already-single-line text unchanged", () => {
    expect(joinLines("نص بلا فواصل أسطر")).toBe("نص بلا فواصل أسطر");
  });
});

describe("planLineJoin", () => {
  it("scope: only touches entries in the given (already-filtered) list, not others with multi-line text in translations", () => {
    const inScope = { msbtFile: "infos.tab", index: 1 };
    const outOfScopeKey = "infos.tab:2";
    const translations: Record<string, string> = {
      "infos.tab:1": "سطر أول\r\nسطر ثاني",
      [outOfScopeKey]: "سطر أول\r\nسطر ثاني", // also multi-line — would qualify if it were passed in
    };

    const plan = planLineJoin([inScope], translations);

    expect(plan.targetKeys).toEqual(["infos.tab:1"]);
    expect(plan.updates["infos.tab:1"]).toBe("سطر أول سطر ثاني");
    expect(plan.updates).not.toHaveProperty(outOfScopeKey);
    expect(plan.snapshot).not.toHaveProperty(outOfScopeKey);
    expect(translations[outOfScopeKey]).toBe("سطر أول\r\nسطر ثاني");
  });

  it("skips single-line and untranslated entries", () => {
    const entries = [
      { msbtFile: "infos.tab", index: 1 },
      { msbtFile: "infos.tab", index: 2 },
      { msbtFile: "infos.tab", index: 3 },
    ];
    const translations: Record<string, string> = {
      "infos.tab:1": "نص بسطر واحد فقط",
      "infos.tab:2": "", // untranslated
      "infos.tab:3": "سطر أول\r\nسطر ثاني", // the only one that should match
    };

    const plan = planLineJoin(entries, translations);
    expect(plan.targetKeys).toEqual(["infos.tab:3"]);
  });

  it("undo: applying the snapshot restores the exact original (multi-line) values", () => {
    const entries = [
      { msbtFile: "infos.tab", index: 1 },
      { msbtFile: "quests.tab", index: 5 },
    ];
    const originalTranslations: Record<string, string> = {
      "infos.tab:1": "أول سطر\r\nثاني سطر\r\nثالث سطر",
      "quests.tab:5": "وصف المهمة\nسطر إضافي",
    };

    const plan = planLineJoin(entries, originalTranslations);
    expect(plan.targetKeys.length).toBe(2);

    const afterApply: Record<string, string> = { ...originalTranslations, ...plan.updates };
    expect(afterApply["infos.tab:1"]).toBe("أول سطر ثاني سطر ثالث سطر");
    expect(afterApply["quests.tab:5"]).toBe("وصف المهمة سطر إضافي");

    const afterUndo: Record<string, string> = { ...afterApply, ...plan.snapshot };
    expect(afterUndo["infos.tab:1"]).toBe(originalTranslations["infos.tab:1"]);
    expect(afterUndo["quests.tab:5"]).toBe(originalTranslations["quests.tab:5"]);
  });
});
