import { describe, it, expect } from "vitest";
import { buildM3WolfGlyphs, m3CellFit, m3Form } from "@/lib/wolfrpg/wolf-m3-glyphs";
import { wolfFontSlots } from "@/lib/wolfrpg/wolf-charmap";
import { arabicFormJoining } from "@/lib/risen/arabic-shaper";

const SLOT_CODEPOINTS = wolfFontSlots().filter((cp): cp is number => cp !== null);
const MAIN_CELL = { width: 12, height: 16 };

describe("Mother 3 glyphs as Wolfenstein's Arabic", () => {
  it("has a drawing for every slot the game gives Arabic", () => {
    // A form with no drawing leaves the Latin glyph in its cell, which prints
    // an English letter in the middle of an Arabic word.
    const missing = SLOT_CODEPOINTS.filter((cp) => !m3Form(cp));
    expect(missing).toEqual([]);
  });

  it("takes the two main cells at the drawing's own size", () => {
    // The point of the transplant: at 12x16 and 13x18 nothing is resampled.
    expect(m3CellFit({ width: 12, height: 16 })).toBe("native");
    expect(m3CellFit({ width: 13, height: 18 })).toBe("native");
    expect(m3CellFit({ width: 10, height: 12 })).toBe("scaled");
    expect(m3CellFit({ width: 22, height: 25 })).toBe("scaled");
  });

  it("leaves the misfitting cells out when told to skip them", () => {
    const cells = [MAIN_CELL, { width: 10, height: 12 }];
    const glyphs = buildM3WolfGlyphs(cells, SLOT_CODEPOINTS, "skip");
    expect(glyphs.has(`12x16:${SLOT_CODEPOINTS[0]}`)).toBe(true);
    expect(glyphs.has(`10x12:${SLOT_CODEPOINTS[0]}`)).toBe(false);
  });

  it("never fills a whole cell", () => {
    // The first sheet rendered came out with solid blocks in it: the stem of ا
    // sits at the edge of its box, so probing for edge ink read it as a
    // joining stroke and ran it across every row of the cell.
    const glyphs = buildM3WolfGlyphs([MAIN_CELL], SLOT_CODEPOINTS, "scale");
    const blocks = [...glyphs].filter(([, g]) => g.coverage.every((v) => v === 255));
    expect(blocks).toEqual([]);
    for (const [, g] of glyphs) {
      const inked = g.coverage.reduce((n, v) => (v > 0 ? n + 1 : n), 0);
      expect(inked / g.coverage.length).toBeLessThan(0.75);
    }
  });

  it("runs a final form's stroke out to the edge the previous letter is on", () => {
    // ـب joins backwards, and in a right-to-left line the letter before it
    // sits to its right, so its cell must be inked all the way to the right.
    const glyphs = buildM3WolfGlyphs([MAIN_CELL], [0xfe90], "scale");
    const g = glyphs.get(`12x16:${0xfe90}`)!;
    const rightEdge = [...Array(MAIN_CELL.height).keys()].some(
      (y) => g.coverage[y * MAIN_CELL.width + MAIN_CELL.width - 1] > 0
    );
    expect(rightEdge).toBe(true);
  });

  it("leaves an isolated form clear of both edges", () => {
    // ا standing alone joins nothing; ink at either edge would glue it to its
    // neighbours.
    const glyphs = buildM3WolfGlyphs([MAIN_CELL], [0xfe8d], "scale");
    const g = glyphs.get(`12x16:${0xfe8d}`)!;
    const edge = (x: number) =>
      [...Array(MAIN_CELL.height).keys()].some((y) => g.coverage[y * MAIN_CELL.width + x] > 0);
    expect(edge(0)).toBe(false);
    expect(edge(MAIN_CELL.width - 1)).toBe(false);
  });
});

describe("which side a presentation form joins on", () => {
  it("reads the sides off the shaping tables", () => {
    expect(arabicFormJoining(0xfe92)).toEqual({ before: true, after: true }); // ـبـ
    expect(arabicFormJoining(0xfe90)).toEqual({ before: true, after: false }); // ـب
    expect(arabicFormJoining(0xfe91)).toEqual({ before: false, after: true }); // بـ
    expect(arabicFormJoining(0xfe8f)).toEqual({ before: false, after: false }); // ب
  });

  it("calls ء joinless even though its table lists it twice", () => {
    // ء has the same code as its isolated and final form; taken as a final it
    // would grow a stroke toward a letter that never connects to it.
    expect(arabicFormJoining(0xfe80)).toEqual({ before: false, after: false });
  });
});
