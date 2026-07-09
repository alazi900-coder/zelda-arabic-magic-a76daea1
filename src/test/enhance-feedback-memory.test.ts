import { describe, it, expect } from "vitest";
import { formatFeedbackForPrompt, type FeedbackEntry } from "@/lib/enhance-feedback-memory";

describe("formatFeedbackForPrompt", () => {
  it("returns empty string for no entries", () => {
    expect(formatFeedbackForPrompt([])).toBe("");
  });

  it("formats a dismissed entry", () => {
    const entries: FeedbackEntry[] = [
      { type: "style", original: "Hello there", aiSuggested: "مرحباً هناك", userAction: "dismissed", ts: 1 },
    ];
    const out = formatFeedbackForPrompt(entries);
    expect(out).toContain("Hello there");
    expect(out).toContain("مرحباً هناك");
    expect(out).toContain("رفض المستخدم الاقتراح");
  });

  it("formats an edited entry with the user's final text", () => {
    const entries: FeedbackEntry[] = [
      { type: "accuracy", original: "Save the world", aiSuggested: "أنقذ العالم بسرعة", userAction: "edited", userFinal: "أنقذ العالم", ts: 1 },
    ];
    const out = formatFeedbackForPrompt(entries);
    expect(out).toContain("عدّله المستخدم يدويّاً إلى");
    expect(out).toContain("أنقذ العالم");
  });

  it("numbers multiple entries in order", () => {
    const entries: FeedbackEntry[] = [
      { type: "style", original: "A", aiSuggested: "أ", userAction: "dismissed", ts: 1 },
      { type: "style", original: "B", aiSuggested: "ب", userAction: "dismissed", ts: 2 },
    ];
    const out = formatFeedbackForPrompt(entries);
    expect(out).toContain("1. النص:");
    expect(out).toContain("2. النص:");
  });

  it("truncates very long text to keep the prompt block short", () => {
    const longText = "x".repeat(200);
    const entries: FeedbackEntry[] = [
      { type: "style", original: longText, aiSuggested: "y", userAction: "dismissed", ts: 1 },
    ];
    const out = formatFeedbackForPrompt(entries);
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(longText.length + 100);
  });
});
