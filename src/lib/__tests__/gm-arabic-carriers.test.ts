import { describe, it, expect } from "vitest";
import {
  buildGmCarrierMap,
  encodeArabicForGm,
  GM_FIRST_CHAR,
  GM_LAST_CHAR,
  GM_RESERVED_CHARS,
} from "@/lib/gamemaker/gm-arabic-carriers";

describe("GameMaker — Arabic in the font's own cells", () => {
  const map = buildGmCarrierMap();

  it("fits the alphabet in what the font has", () => {
    // The font holds 93 cells and cannot hold one more without moving chunks
    // that ten other chunks point into. Folding the four contextual forms into
    // two is what makes the alphabet fit at all.
    const cells = GM_LAST_CHAR - GM_FIRST_CHAR + 1;
    expect(cells).toBe(93);
    expect(map.formsOf.size + GM_RESERVED_CHARS.length + map.spare.length).toBe(cells);
    expect(map.spare.length).toBeGreaterThanOrEqual(0);
  });

  it("never takes a cell that was kept for digits or punctuation", () => {
    for (const carrier of map.formsOf.keys()) expect(GM_RESERVED_CHARS).not.toContain(carrier);
  });

  it("puts a letter's initial and medial in one cell, and its isolated and final in another", () => {
    // ب: FE8F isolated, FE90 final, FE91 initial, FE92 medial.
    const joined = map.carrierOf.get(0xfe91);
    expect(map.carrierOf.get(0xfe92)).toBe(joined);
    const parted = map.carrierOf.get(0xfe8f);
    expect(map.carrierOf.get(0xfe90)).toBe(parted);
    expect(joined).not.toBe(parted);
  });

  it("gives the same cell to the same form on every build", () => {
    // A file built yesterday has to stay readable by a font built today.
    const again = buildGmCarrierMap();
    for (const [form, carrier] of map.carrierOf) expect(again.carrierOf.get(form)).toBe(carrier);
  });

  it("writes the text in the order the engine draws it", () => {
    // The engine draws left to right and knows nothing of Arabic, so the first
    // letter read must be the last one drawn.
    const encoded = encodeArabicForGm("با", map);
    expect(encoded.length).toBe(2);
    // ا is the last letter, so it is drawn first — in its final form (FE8E).
    expect(encoded.charCodeAt(0)).toBe(map.carrierOf.get(0xfe8e));
  });

  it("keeps digits and punctuation as they are", () => {
    expect(encodeArabicForGm("100%", map)).toBe("100%");
    // The Arabic comma is drawn by the Latin comma's cell, which was kept.
    expect(encodeArabicForGm("،", map)).toBe(",");
  });

  it("keeps line breaks and spaces where they were", () => {
    const encoded = encodeArabicForGm("با\nبا", map);
    expect(encoded.split("\n").length).toBe(2);
    expect(encodeArabicForGm("با با", map)).toContain(" ");
  });
});
