/**
 * The forms Mother 3's font cannot supply, drawn here in its own style.
 *
 * Mother 3's Arabic set stops short of sad, dad, tah, zah and ain: the table
 * that ships with it points those forms at 0xA0-0xAF, and that block still
 * holds the original game's punctuation -- 0xA3 is a dollar sign, 0xA4 a
 * percent, 0xA7 a bracket, 0xAA a star. Four of the missing forms were found
 * unmapped at 0x94-0x97 (tah and zah, initial and medial) and are taken from
 * there; the rest are drawn below, matching the loop, stroke and bowl widths
 * of Mother 3's own sad isolated (0x3A) so they sit with the others.
 *
 * Row 6 is the baseline, the same one the transplanted glyphs land on.
 */
const G = (w, ...rows) => ({ w, rows });

export const DRAWN = new Map([
  // alef with madda, isolated -- Mother 3 has only the final form (0x90)
  [0xFE81, G(3,
    "##.",
    "...",
    "#..",
    "#..",
    "#..",
    "#..",
    "#..")],

  // sad: the loop, plus the descending bowl on the isolated and final forms
  [0xFEBA, G(9,          // final -- joins right
    "......#..",
    ".....#.#.",
    "....#..#.",
    ".#.######",
    "#..#.....",
    "#..#.....",
    ".##......")],
  [0xFEBB, G(7,          // initial -- joins left
    "",
    "",
    "",
    ".....#.",
    "....#.#",
    "...#..#",
    "#######")],
  [0xFEBC, G(8,          // medial -- joins both
    "",
    "",
    "",
    ".....#..",
    "....#.#.",
    "...#..#.",
    "########")],

  // dad is sad with a dot over the loop
  [0xFEBD, G(9,          // isolated
    "......#..",
    ".........",
    "......#..",
    ".....#.#.",
    "....#..#.",
    ".#.####..",
    "#..#.....",
    "#..#.....",
    ".##......")],
  [0xFEBE, G(9,          // final
    "......#..",
    ".........",
    "......#..",
    ".....#.#.",
    "....#..#.",
    ".#.######",
    "#..#.....",
    "#..#.....",
    ".##......")],
  [0xFEBF, G(7,          // initial
    ".....#.",
    ".......",
    ".....#.",
    "....#.#",
    "...#..#",
    "#######")],
  [0xFEC0, G(8,          // medial
    ".....#..",
    "........",
    ".....#..",
    "....#.#.",
    "...#..#.",
    "########")],

  // tah and zah, matched to the initial and medial forms recovered from
  // Mother 3 at 0x94-0x97: stroke, loop, and the bar the letter stands on.
  [0xFEC1, G(6,          // tah isolated
    ".#....",
    ".#....",
    ".#....",
    ".#.##.",
    ".##..#",
    ".#...#",
    ".#####")],
  [0xFEC2, G(7,          // tah final -- the bar carries the join on the right
    ".#.....",
    ".#.....",
    ".#.....",
    ".#.##..",
    ".##..#.",
    ".#...#.",
    ".######")],
  [0xFEC5, G(6,          // zah isolated -- tah with a dot beside the stroke
    ".#....",
    ".#.#..",
    ".#....",
    ".#.##.",
    ".##..#",
    ".#...#",
    ".#####")],
  [0xFEC6, G(7,          // zah final
    ".#.....",
    ".#.#...",
    ".#.....",
    ".#.##..",
    ".##..#.",
    ".#...#.",
    ".######")],

  // ain: the head, and the bowl that drops below the line
  [0xFEC9, G(6,          // isolated
    "",
    "",
    "",
    "..##..",
    ".#..#.",
    ".#....",
    ".###..",
    "#.....",
    "#.....",
    ".###..")],
  [0xFECC, G(7,          // medial -- head on the line, joined both sides
    "",
    "",
    "",
    "..##...",
    ".#..#..",
    ".#.....",
    "#######")],
]);

/** Expands one entry into an 11x12 boolean grid. */
export function drawnGrid(entry) {
  const grid = Array.from({ length: 12 }, () => new Array(11).fill(false));
  entry.rows.forEach((row, y) => {
    for (let x = 0; x < row.length && x < 11; x++) if (row[x] === "#") grid[y][x] = true;
  });
  return grid;
}
