import { describe, it, expect } from "vitest";
import { checkTagSequenceMatch, diffTechnicalTags } from "@/lib/xc3-build-tag-guard";
import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";

describe("checkTagSequenceMatch", () => {
  it("returns true when tags are in same order", () => {
    const orig = "[XENO:wait wait=key ] text [XENO:del del=key ]";
    const trans = "[XENO:wait wait=key ] نص [XENO:del del=key ]";
    expect(checkTagSequenceMatch(orig, trans)).toBe(true);
  });

  it("returns false when tags are swapped", () => {
    const orig = "[XENO:wait wait=key ] text [XENO:del del=key ]";
    const trans = "[XENO:del del=key ] نص [XENO:wait wait=key ]";
    expect(checkTagSequenceMatch(orig, trans)).toBe(false);
  });

  it("returns true when no tags present", () => {
    expect(checkTagSequenceMatch("hello", "مرحبا")).toBe(true);
  });

  it("returns false when tag count differs", () => {
    const orig = "[ML:Dash 4] text [ML:Dash 5]";
    const trans = "[ML:Dash 4] نص";
    expect(checkTagSequenceMatch(orig, trans)).toBe(false);
  });
});

describe("diffTechnicalTags with sequenceMatch", () => {
  it("exactTagMatch true but sequenceMatch false when order flipped", () => {
    const orig = "[XENO:wait wait=key ] [XENO:del del=key ]";
    const trans = "[XENO:del del=key ] [XENO:wait wait=key ]";
    const diff = diffTechnicalTags(orig, trans);
    expect(diff.exactTagMatch).toBe(true);
    expect(diff.sequenceMatch).toBe(false);
  });

  it("both true when perfect match", () => {
    const orig = "[XENO:wait wait=key ] [XENO:del del=key ]";
    const trans = "[XENO:wait wait=key ] [XENO:del del=key ]";
    const diff = diffTechnicalTags(orig, trans);
    expect(diff.exactTagMatch).toBe(true);
    expect(diff.sequenceMatch).toBe(true);
  });
});

describe("restoreTagsLocally preserves tag order", () => {
  it("does not flip order of adjacent XENO tags", () => {
    const orig = "[XENO:wait wait=key ] text [XENO:del del=key ]";
    const damaged = "نص";
    const result = restoreTagsLocally(orig, damaged);
    const waitIdx = result.indexOf("[XENO:wait");
    const delIdx = result.indexOf("[XENO:del");
    expect(waitIdx).toBeGreaterThanOrEqual(0);
    expect(delIdx).toBeGreaterThanOrEqual(0);
    expect(waitIdx).toBeLessThan(delIdx);
  });

  it("preserves order of 3 consecutive tags at same position", () => {
    const orig = "[XENO:a a=1 ][XENO:b b=2 ][XENO:c c=3 ] text";
    const damaged = "نص";
    const result = restoreTagsLocally(orig, damaged);
    const aIdx = result.indexOf("[XENO:a");
    const bIdx = result.indexOf("[XENO:b");
    const cIdx = result.indexOf("[XENO:c");
    expect(aIdx).toBeLessThan(bIdx);
    expect(bIdx).toBeLessThan(cIdx);
  });

  it("preserves order when tags are at similar proportional positions", () => {
    const orig = "A [ML:Dash 1] B [ML:Dash 2] C";
    const damaged = "أ ب ج";
    const result = restoreTagsLocally(orig, damaged);
    const idx1 = result.indexOf("[ML:Dash 1]");
    const idx2 = result.indexOf("[ML:Dash 2]");
    expect(idx1).toBeLessThan(idx2);
  });

  it("keeps adjacent same-type tags as atomic block (no text between)", () => {
    const orig = "[XENO:wait wait=key ][XENO:del del=key ] text";
    const damaged = "نص";
    const result = restoreTagsLocally(orig, damaged);
    // Must stay together as one block with no text splitting them
    expect(result).toMatch(/\[XENO:wait wait=key \]\[XENO:del del=key \]/);
  });

  it("does NOT merge tags separated by content in original", () => {
    const orig = "[XENO:wait wait=key ]Hello[XENO:del del=key ]";
    const damaged = "مرحبا";
    const result = restoreTagsLocally(orig, damaged);
    // They must NOT be adjacent — there should be text between them
    expect(result).not.toMatch(/\[XENO:wait wait=key \]\[XENO:del del=key \]/);
  });

  it("does NOT merge PUA with bracket tags even if adjacent", () => {
    const orig = "\uE000[XENO:wait wait=key ] text";
    const damaged = "نص";
    const result = restoreTagsLocally(orig, damaged);
    expect(result).toContain("\uE000");
    expect(result).toContain("[XENO:wait wait=key ]");
    // PUA and bracket are different types — should not form one atomic block
  });

  it("groups adjacent PUA chars as one block", () => {
    const orig = "\uE000\uE001\uE002 text \uE003";
    const damaged = "نص";
    const result = restoreTagsLocally(orig, damaged);
    // First 3 PUA chars must stay together
    expect(result).toMatch(/\uE000\uE001\uE002/);
  });
});
