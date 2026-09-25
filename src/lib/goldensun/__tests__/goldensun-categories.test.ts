import { describe, it, expect } from "vitest";
import { categorizeGoldenSunEntry } from "../goldensun-categories";

function entry(original: string) {
  return { msbtFile: "goldensun/strings", index: 0, label: original.slice(0, 60), original, maxBytes: 0 };
}

describe("categorizeGoldenSunEntry", () => {
  it("puts a damage/target-name line in battle", () => {
    expect(categorizeGoldenSunEntry(entry("\\x12\\x01 takes \\x16 damage."))).toBe("gs-battle");
  });
  it("puts a move-name line in battle", () => {
    expect(categorizeGoldenSunEntry(entry("\\x15 is set to \\x12\\x01!"))).toBe("gs-battle");
  });
  it("puts a yes/no line in prompt", () => {
    expect(categorizeGoldenSunEntry(entry("Do you wish to save?\\x1e"))).toBe("gs-prompt");
  });
  it("puts a multi-line spoken box in dialogue", () => {
    expect(categorizeGoldenSunEntry(entry("Come on, \\x11\\x01.\\x03We have to go\\x18now!\\x02"))).toBe("gs-dialogue");
  });
  it("puts a short single-word line in short", () => {
    expect(categorizeGoldenSunEntry(entry("Mimic"))).toBe("gs-short");
    expect(categorizeGoldenSunEntry(entry("Venus"))).toBe("gs-short");
  });
  it("leaves an item description with no clear signal in other", () => {
    expect(categorizeGoldenSunEntry(entry("Restore 80 HP to the whole party."))).toBe("gs-other");
  });
});
