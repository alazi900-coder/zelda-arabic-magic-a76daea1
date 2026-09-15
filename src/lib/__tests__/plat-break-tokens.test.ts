import { describe, it, expect } from "vitest";
import {
  toBreakTokens,
  fromBreakTokens,
  countBreakTokens,
  PAGE_BREAK_TOKEN,
  SCROLL_BREAK_TOKEN,
} from "@/lib/nds/plat-break-tokens";

describe("plat break tokens", () => {
  it("shows a page break as a triangle followed by a real newline", () => {
    expect(toBreakTokens("A.\rB.")).toBe("A.▼\nB.");
  });

  it("shows a scroll break with its own triangle", () => {
    expect(toBreakTokens("A.\fB.")).toBe("A.▽\nB.");
  });

  it("leaves an ordinary line break alone", () => {
    expect(toBreakTokens("A\nB")).toBe("A\nB");
  });

  it("gives a trailing break no newline, so the message stays one line", () => {
    expect(toBreakTokens("Hello.\r")).toBe("Hello.▼");
  });

  it("swallows the display newline when writing back", () => {
    expect(fromBreakTokens("A.▼\nB.")).toBe("A.\rB.");
    expect(fromBreakTokens("A.▽\nB.")).toBe("A.\fB.");
  });

  it("accepts a token the translator typed without a newline", () => {
    expect(fromBreakTokens("A.▼B.")).toBe("A.\rB.");
  });

  it("keeps a line break the translator added after the token", () => {
    // ▼ eats one newline; a second is the translator's own line break.
    expect(fromBreakTokens("A.▼\n\nB.")).toBe("A.\r\nB.");
  });

  it("round-trips every shape the archive contains", () => {
    for (const text of [
      "",
      "plain",
      "A.\rB.",
      "A.\fB.",
      "A\nB\rC\nD",
      "Hello.\r",
      "Hello.\f",
      "A\r\rB",
      "{STRVAR_1 3, 0, 0}, hi!\rNext page.",
    ]) {
      expect(fromBreakTokens(toBreakTokens(text))).toBe(text);
    }
  });

  it("counts the pauses a message asks for", () => {
    expect(countBreakTokens("A▼\nB▽\nC")).toBe(2);
    expect(countBreakTokens("A\nB")).toBe(0);
  });

  it("names the tokens after the codes they stand for", () => {
    expect(PAGE_BREAK_TOKEN.codePointAt(0)).toBe(0x25bc);
    expect(SCROLL_BREAK_TOKEN.codePointAt(0)).toBe(0x25bd);
  });
});
