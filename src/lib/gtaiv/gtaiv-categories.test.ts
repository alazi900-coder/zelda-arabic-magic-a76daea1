import { describe, expect, it } from "vitest";
import { categorizeGtaIvEntry, GTAIV_CATEGORIES } from "./gtaiv-categories";

function entry(table: string, original: string) {
  return { msbtFile: `gtaiv/${table}`, original } as Parameters<typeof categorizeGtaIvEntry>[0];
}

describe("categorizeGtaIvEntry", () => {
  it("uses AUD table evidence for spoken dialogue even when a line mentions an item", () => {
    expect(categorizeGtaIvEntry(entry("PM3AUD", "Open the door and take the gun."))).toBe("gtaiv-dialogue");
  });

  it("groups the dedicated credits table separately", () => {
    expect(categorizeGtaIvEntry(entry("CREDIT", "Marcy Maguigan"))).toBe("gtaiv-credits");
  });

  it("separates verified internal labels and numeric payloads from user-facing text", () => {
    expect(categorizeGtaIvEntry(entry("GM3AUD", "GM3_A_NA"))).toBe("gtaiv-internal");
    expect(categorizeGtaIvEntry(entry("GM3AUD", "200020"))).toBe("gtaiv-internal");
    expect(categorizeGtaIvEntry(entry("MAIN", "REVERSE"))).not.toBe("gtaiv-internal");
  });

  it("gives every GTA IV entry a named category rather than the generic other bucket", () => {
    const samples = [
      entry("MAIN", "Player Is Invincible"),
      entry("MAIN", "REVERSE"),
      entry("UNKNOWN", "A plain world description."),
      entry("F2AUD", "~z~We are your friends."),
      entry("CREDIT", "Rob Cross"),
    ];
    const declared = new Set(GTAIV_CATEGORIES.map((category) => category.id));
    for (const sample of samples) {
      const result = categorizeGtaIvEntry(sample);
      expect(result).not.toBe("other");
      expect(declared).toContain(result);
    }
  });
});
