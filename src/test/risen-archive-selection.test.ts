import { describe, it, expect } from "vitest";
import { collectSelectedFiles, totalSelectionSize, allTopLevelPaths } from "@/lib/risen-archive-selection";
import type { RisenPakNode } from "@/lib/risen-images-pak";

/** Mirrors the real templates.P00 tree confirmed against an actual game file:
 * NPC/World/PC_Hero.tple (offset=48, size=11709), plus a sibling file at the
 * NPC level to exercise partial-folder selection. */
const TREE: RisenPakNode[] = [
  {
    type: "folder",
    name: "NPC",
    children: [
      {
        type: "folder",
        name: "World",
        children: [{ type: "file", name: "PC_Hero.tple", offset: 48, size: 11709 }],
      },
      { type: "file", name: "Sidekick.tple", offset: 11757, size: 200 },
    ],
  },
  { type: "file", name: "Readme.txt", offset: 11957, size: 50 },
];

describe("collectSelectedFiles", () => {
  it("returns nothing when nothing is selected", () => {
    expect(collectSelectedFiles(TREE, new Set())).toEqual([]);
  });

  it("includes a single explicitly selected file", () => {
    const result = collectSelectedFiles(TREE, new Set(["Readme.txt"]));
    expect(result).toEqual([{ path: "Readme.txt", offset: 11957, size: 50 }]);
  });

  it("includes every file under a selected folder, regardless of nesting", () => {
    const result = collectSelectedFiles(TREE, new Set(["NPC"]));
    expect(result).toEqual([
      { path: "NPC/World/PC_Hero.tple", offset: 48, size: 11709 },
      { path: "NPC/Sidekick.tple", offset: 11757, size: 200 },
    ]);
  });

  it("includes a file individually selected inside an unselected folder", () => {
    const result = collectSelectedFiles(TREE, new Set(["NPC/World/PC_Hero.tple"]));
    expect(result).toEqual([{ path: "NPC/World/PC_Hero.tple", offset: 48, size: 11709 }]);
  });

  it("does not double-count a file selected both directly and via its selected parent folder", () => {
    const result = collectSelectedFiles(TREE, new Set(["NPC", "NPC/Sidekick.tple"]));
    expect(result).toHaveLength(2);
  });

  it("selecting every top-level path covers the whole tree", () => {
    const result = collectSelectedFiles(TREE, new Set(allTopLevelPaths(TREE)));
    expect(result.map((f) => f.path).sort()).toEqual(
      ["NPC/World/PC_Hero.tple", "NPC/Sidekick.tple", "Readme.txt"].sort()
    );
  });
});

describe("totalSelectionSize", () => {
  it("sums the sizes of the given files", () => {
    const files = collectSelectedFiles(TREE, new Set(["NPC"]));
    expect(totalSelectionSize(files)).toBe(11709 + 200);
  });

  it("returns 0 for an empty selection", () => {
    expect(totalSelectionSize([])).toBe(0);
  });
});

describe("allTopLevelPaths", () => {
  it("returns the name of each top-level node", () => {
    expect(allTopLevelPaths(TREE)).toEqual(["NPC", "Readme.txt"]);
  });
});
