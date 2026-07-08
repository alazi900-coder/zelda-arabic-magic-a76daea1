import { describe, it, expect } from "vitest";
import { splitLongLines, getLongestLineLength, hasArabicText } from "@/lib/risen-line-split";

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
