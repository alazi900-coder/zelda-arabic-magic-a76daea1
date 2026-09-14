import { describe, it, expect } from "vitest";
import { archiveLimit } from "@/lib/nds/plat-editor-bridge";

/**
 * Reading an archive and building it back have to agree on how long a line may
 * be. They did not: reading allowed three times the longest original and the
 * build allowed exactly it, so the editor showed a translation as fitting and
 * the build dropped it -- 449 lines in one export, reported only as a count.
 *
 * Both now call `archiveLimit`, and these pin what it answers.
 */
describe("how long a line in an archive may be", () => {
  const codes = (n: number) => new Array(n).fill(0x41);

  it("leaves room for a translation longer than the English it replaces", () => {
    const messages = [codes(10), codes(30), codes(20)];
    const texts = ["a", "b", "c"];
    // A line half again as long as the longest original is ordinary Arabic.
    expect(archiveLimit(messages, texts)).toBeGreaterThan(45);
  });

  it("measures from the longest original in that archive alone", () => {
    expect(archiveLimit([codes(10), codes(30)], ["a", "b"])).toBe(90);
    expect(archiveLimit([codes(10), codes(12)], ["a", "b"])).toBe(36);
  });

  it("ignores packed messages, which carry no translatable text", () => {
    // The packed trainer-name encoding decodes to null and is left alone, so a
    // long packed entry must not raise what everything else is allowed.
    const messages = [codes(10), codes(500)];
    expect(archiveLimit(messages, ["a", null])).toBe(30);
  });

  it("answers zero for an archive with nothing to translate", () => {
    expect(archiveLimit([codes(500)], [null])).toBe(0);
    expect(archiveLimit([], [])).toBe(0);
  });
});
