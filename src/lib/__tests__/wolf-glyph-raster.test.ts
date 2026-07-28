import { describe, it, expect } from "vitest";
import { placeGlyphInCell, findConnector } from "@/lib/wolfrpg/wolf-glyph-raster";
import { buildWolfCategories, categorizeWolfSection } from "@/lib/wolfrpg/wolf-categories";

/** A glyph bitmap from an ASCII picture: `#` is ink, `.` is empty. */
function glyph(rows: string[]) {
  const w = rows[0].length;
  const cov = new Uint8Array(w * rows.length);
  rows.forEach((row, y) => [...row].forEach((c, x) => (cov[y * w + x] = c === "#" ? 255 : 0)));
  return { cov, w, h: rows.length };
}

function picture(cov: Uint8Array, w: number, h: number): string[] {
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) row += cov[y * w + x] >= 128 ? "#" : ".";
    out.push(row);
  }
  return out;
}

describe("Wolfenstein RPG glyph placement", () => {
  it("runs a baseline stroke out to both cell edges", () => {
    // A medial form: body above the baseline, connecting stroke reaching both
    // edges of its advance box. The engine advances a whole cell per byte, so
    // the stroke has to reach the cell edge or the word comes apart.
    const g = glyph([
      "..##..",
      "..##..",
      "######", // baseline
    ]);
    const cell = placeGlyphInCell(g.cov, g.w, g.h, 10, 5, 2);
    expect(picture(cell.coverage, 10, 5)).toEqual([
      "..........",
      "....##....",
      "....##....",
      "##########",
      "..........",
    ]);
  });

  it("leaves a non-joining form alone", () => {
    // Isolated alef: no ink at either edge of its advance box, so no stroke.
    // Extending it anyway would glue it to its neighbour, which Arabic does
    // not do after an alef.
    const g = glyph([
      "..##..",
      "..##..",
      "..##..",
    ]);
    const cell = placeGlyphInCell(g.cov, g.w, g.h, 10, 5, 2);
    expect(picture(cell.coverage, 10, 5)).toEqual([
      "..........",
      "....##....",
      "....##....",
      "....##....",
      "..........",
    ]);
  });

  it("does not turn the dots of ت and the hamza of أ into bars", () => {
    // Ink at the edge above the baseline is a dot, not a connector. Extending
    // every edge run — which the first build did — drew a horizontal bar the
    // width of the cell at dot height, and that is what the game showed.
    const g = glyph([
      "#....#", // dots touching both edges of the advance box
      "..##..",
      "######", // baseline
    ]);
    const cell = placeGlyphInCell(g.cov, g.w, g.h, 10, 5, 2);
    expect(picture(cell.coverage, 10, 5)).toEqual([
      "..........",
      "..#....#..",
      "....##....",
      "##########",
      "..........",
    ]);
  });

  it("pushes a one-sided form toward the side it does not join", () => {
    // ـا: joins on the right, nothing on the left. Centring it put half the
    // spare cell on its left, and the initial ب beside it did the same on its
    // right, so 8 px of a 12 px cell sat empty between them and the word read
    // as two. One pixel of margin on the non-joining side is enough to show a
    // letter break without opening a gap that reads as a space.
    const g = glyph([
      "..##..",
      "..##..",
      "..####", // joins right only
    ]);
    const cell = placeGlyphInCell(g.cov, g.w, g.h, 10, 5, 2);
    expect(picture(cell.coverage, 10, 5)).toEqual([
      "..........",
      "...##.....",
      "...##.....",
      "...#######",
      "..........",
    ]);
  });

  it("mirrors that for a form joining on the left only", () => {
    const g = glyph([
      "..##..",
      "..##..",
      "####..",
    ]);
    const cell = placeGlyphInCell(g.cov, g.w, g.h, 10, 5, 2);
    expect(picture(cell.coverage, 10, 5)).toEqual([
      "..........",
      ".....##...",
      ".....##...",
      "#######...",
      "..........",
    ]);
  });

  it("picks the run on the baseline when a column has several", () => {
    const g = glyph([
      "#.....",
      "......",
      "#.....",
    ]);
    expect(findConnector(g.cov, g.w, g.h, 0, 2)).toEqual([2, 2]);
    expect(findConnector(g.cov, g.w, g.h, 0, 0)).toEqual([0, 0]);
  });

  it("reports no connector when the edge ink is far from the baseline", () => {
    const g = glyph(["#.....", "......", "......", "......", "......"]);
    expect(findConnector(g.cov, g.w, g.h, 0, 4)).toBeNull();
  });
});

describe("Wolfenstein RPG categories", () => {
  it("labels a section by its bank and number, never by a guess", () => {
    // The index file names nothing — it has banks and numbered sections — so a
    // plain label costs a translator less than a wrong one.
    expect(categorizeWolfSection("wolf_b1_s4")).toEqual({
      id: "wolf-b1-s4",
      label: "الملف 1 — القسم 5",
      emoji: "📄",
    });
  });

  it("lists each section present exactly once", () => {
    const cats = buildWolfCategories([
      { msbtFile: "wolf_b0_s0" },
      { msbtFile: "wolf_b0_s0" },
      { msbtFile: "wolf_b1_s2" },
    ]);
    expect(cats.map((c) => c.id)).toEqual(["wolf-b0-s0", "wolf-b1-s2"]);
  });
});
