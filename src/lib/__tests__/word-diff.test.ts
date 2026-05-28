import { describe, it, expect } from "vitest";
import { diffWords } from "@/lib/word-diff";

describe("diffWords", () => {
  it("returns all equal for identical strings", () => {
    const out = diffWords("مرحبا يا صديقي", "مرحبا يا صديقي");
    expect(out.every((t) => t.op === "equal")).toBe(true);
  });

  it("marks added words", () => {
    const out = diffWords("مرحبا صديقي", "مرحبا يا صديقي");
    const added = out.filter((t) => t.op === "add").map((t) => t.text.trim());
    expect(added).toContain("يا");
  });

  it("marks removed words", () => {
    const out = diffWords("مرحبا يا صديقي", "مرحبا صديقي");
    const removed = out.filter((t) => t.op === "del").map((t) => t.text.trim());
    expect(removed).toContain("يا");
  });

  it("handles complete replacement", () => {
    const out = diffWords("القديم", "الجديد");
    expect(out.some((t) => t.op === "del" && t.text === "القديم")).toBe(true);
    expect(out.some((t) => t.op === "add" && t.text === "الجديد")).toBe(true);
  });

  it("preserves whitespace as equal tokens when content matches", () => {
    const out = diffWords("a b c", "a b c");
    expect(out.map((t) => t.text).join("")).toBe("a b c");
  });
});
