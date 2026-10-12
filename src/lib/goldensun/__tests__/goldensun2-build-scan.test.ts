import { describe, it, expect } from "vitest";
import { scanGoldenSun2BuildTranslations } from "../goldensun2-build-scan";
import { GS2_TEXT_FILE } from "../goldensun2-huffman-rom";

describe("Golden Sun II deep-scan / ROM-build consistency", () => {
  const entries = [{ msbtFile: GS2_TEXT_FILE, index: 9, original: String.raw`Hello\x03` }];

  it("reports a hidden ESC and an RTL mark even if ordinary review sees no language issues", () => {
    const key = GS2_TEXT_FILE + ":9";
    const current = "Welcome" + "\u001B\u200F" + String.raw`\x03`;
    const findings = scanGoldenSun2BuildTranslations(entries, { [key]: current });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      key, index: 9, removed: 2, type: "auto-clean",
      fix: String.raw`Welcome\x03`,
    });
    expect(findings[0].issue).toContain("سيُزال تلقائيًا");
  });

  it("reports truly missing controls as blocking and does not invent a fix", () => {
    const findings = scanGoldenSun2BuildTranslations(entries, { [GS2_TEXT_FILE + ":9"]: "Welcome" });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ type: "blocking", fix: "" });
    expect(findings[0].issue).toContain("مانع بناء");
  });

  it("reports unencodable non-control Unicode before ROM building", () => {
    const findings = scanGoldenSun2BuildTranslations(entries, {
      [GS2_TEXT_FILE + ":9"]: "Welcome©" + String.raw`\x03`,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("blocking");
    expect(findings[0].issue).toContain("U+A9");
  });

  it("does not report a clean translation or another game's entries", () => {
    expect(scanGoldenSun2BuildTranslations(entries, {
      [GS2_TEXT_FILE + ":9"]: "Welcome" + String.raw`\x03`,
    })).toHaveLength(0);
    expect(scanGoldenSun2BuildTranslations([
      { msbtFile: "unrelated/file", index: 9, original: "Hello" },
    ], { "unrelated/file:9": "أهلا" })).toHaveLength(0);
  });
});
