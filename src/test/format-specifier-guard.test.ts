import { describe, it, expect } from "vitest";
import { extractFormatSpecifiers, diffFormatSpecifiers } from "@/lib/format-specifier-guard";

describe("extractFormatSpecifiers", () => {
  it("extracts %s/%d/%i/%f in order of appearance", () => {
    expect(extractFormatSpecifiers("You have %i gold and %s items, %.1f%% done")).toEqual(["%i", "%s", "%.1f"]);
  });

  it("extracts compound forms %1$s and precision specifiers", () => {
    expect(extractFormatSpecifiers("%1$s dealt %2$i damage")).toEqual(["%1$s", "%2$i"]);
  });

  it("returns an empty array when there are none", () => {
    expect(extractFormatSpecifiers("Hello world")).toEqual([]);
    expect(extractFormatSpecifiers("")).toEqual([]);
  });
});

describe("diffFormatSpecifiers", () => {
  it("reports no issue when specifiers survive identically", () => {
    const diff = diffFormatSpecifiers("You have %i gold and %s items", "لديك %i ذهباً و%s غرضاً");
    expect(diff.missing).toEqual([]);
    expect(diff.extra).toEqual([]);
    expect(diff.reordered).toBe(false);
  });

  it("flags a missing specifier", () => {
    const diff = diffFormatSpecifiers("You have %i gold and %s items", "لديك ذهب");
    expect(diff.missing).toEqual(["%i", "%s"]);
    expect(diff.extra).toEqual([]);
    expect(diff.reordered).toBe(false);
  });

  it("flags an extra specifier not present in the original", () => {
    const diff = diffFormatSpecifiers("You have gold", "لديك %s ذهب");
    expect(diff.missing).toEqual([]);
    expect(diff.extra).toEqual(["%s"]);
  });

  it("flags REORDERING — same multiset, different sequence (the exact corruption a translator/BiDi pass could introduce)", () => {
    const diff = diffFormatSpecifiers("You have %i gold and %s items", "لديك %s ذهب و%i غرضاً");
    expect(diff.missing).toEqual([]);
    expect(diff.extra).toEqual([]);
    expect(diff.reordered).toBe(true);
  });

  it("does NOT flag reorder when a specifier is simply missing (missing/extra takes priority, not double-counted as reorder)", () => {
    const diff = diffFormatSpecifiers("%s and %i", "%i");
    expect(diff.missing).toEqual(["%s"]);
    expect(diff.reordered).toBe(false);
  });

  it("no-op when the original has no specifiers at all", () => {
    const diff = diffFormatSpecifiers("Hello world", "مرحباً بالعالم");
    expect(diff.missing).toEqual([]);
    expect(diff.extra).toEqual([]);
    expect(diff.reordered).toBe(false);
  });
});
