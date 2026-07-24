import { describe, expect, it } from "vitest";
import { textToCodes } from "@/lib/mother3/m3-codec";
import { encodeNamesString } from "@/lib/mother3/m3-names-codec";

describe("Mother 3 text normalization", () => {
  it("encodes dialogue with real newlines and common AI punctuation without manual cleanup", () => {
    expect(() => textToCodes("[F001]السُّلامـ عليكم\n«نعم»… (اختبار) ١٢٣")).not.toThrow();
  });

  it("keeps malformed control tags as build-stopping errors instead of hiding tag corruption", () => {
    expect(() => textToCodes("[F001 السلام")).toThrow(/حرف غير قابل للترميز/);
  });

  it("encodes name/menu text after normalizing digits, newlines, and accented Latin letters", () => {
    expect(() => encodeNamesString("Pokémon’s\nمفتاح ٢")).not.toThrow();
  });
});