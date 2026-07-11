import { describe, it, expect } from "vitest";
import {
  collectSelectedFiles, totalSelectionSize, allTopLevelPaths,
  filterTreeByQuery, filterTreeByPaths, excludeTreeByPaths, sortTree, allFolderPaths,
} from "@/lib/risen-archive-selection";
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

describe("filterTreeByQuery", () => {
  it("returns the tree unchanged for an empty query", () => {
    expect(filterTreeByQuery(TREE, "")).toEqual(TREE);
    expect(filterTreeByQuery(TREE, "   ")).toEqual(TREE);
  });

  it("keeps a matching file and prunes its non-matching siblings", () => {
    const result = filterTreeByQuery(TREE, "readme");
    expect(result).toEqual([{ type: "file", name: "Readme.txt", offset: 11957, size: 50 }]);
  });

  it("keeps ancestor folders of a deeply nested match", () => {
    const result = filterTreeByQuery(TREE, "PC_Hero");
    expect(result).toEqual([
      { type: "folder", name: "NPC", children: [
        { type: "folder", name: "World", children: [{ type: "file", name: "PC_Hero.tple", offset: 48, size: 11709 }] },
      ] },
    ]);
  });

  it("keeps a whole subtree when a folder's own name matches", () => {
    const result = filterTreeByQuery(TREE, "world");
    expect(result).toEqual([
      { type: "folder", name: "NPC", children: [
        { type: "folder", name: "World", children: [{ type: "file", name: "PC_Hero.tple", offset: 48, size: 11709 }] },
      ] },
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterTreeByQuery(TREE, "nonexistent")).toEqual([]);
  });

  it("matches case-insensitively", () => {
    expect(filterTreeByQuery(TREE, "readme")).toHaveLength(1);
    expect(filterTreeByQuery(TREE, "README")).toHaveLength(1);
  });
});

describe("filterTreeByPaths", () => {
  it("keeps only files whose full path is in the allowed set, plus ancestor folders", () => {
    const result = filterTreeByPaths(TREE, new Set(["NPC/World/PC_Hero.tple", "Readme.txt"]));
    expect(result).toEqual([
      { type: "folder", name: "NPC", children: [
        { type: "folder", name: "World", children: [{ type: "file", name: "PC_Hero.tple", offset: 48, size: 11709 }] },
      ] },
      { type: "file", name: "Readme.txt", offset: 11957, size: 50 },
    ]);
  });

  it("drops a folder entirely when none of its descendants are allowed", () => {
    const result = filterTreeByPaths(TREE, new Set(["Readme.txt"]));
    expect(result).toEqual([{ type: "file", name: "Readme.txt", offset: 11957, size: 50 }]);
  });

  it("returns an empty array when the allowed set is empty", () => {
    expect(filterTreeByPaths(TREE, new Set())).toEqual([]);
  });

  it("keeps a sibling file inside a partially-allowed folder", () => {
    const result = filterTreeByPaths(TREE, new Set(["NPC/Sidekick.tple"]));
    expect(result).toEqual([
      { type: "folder", name: "NPC", children: [{ type: "file", name: "Sidekick.tple", offset: 11757, size: 200 }] },
    ]);
  });
});

describe("excludeTreeByPaths", () => {
  it("removes a single excluded file, keeping its siblings", () => {
    const result = excludeTreeByPaths(TREE, new Set(["Readme.txt"]));
    expect(result).toEqual([TREE[0]]);
  });

  it("removes a whole folder subtree when the folder itself is excluded", () => {
    const result = excludeTreeByPaths(TREE, new Set(["NPC"]));
    expect(result).toEqual([{ type: "file", name: "Readme.txt", offset: 11957, size: 50 }]);
  });

  it("removes only a deeply nested file, keeping its ancestor folders with remaining siblings", () => {
    const result = excludeTreeByPaths(TREE, new Set(["NPC/World/PC_Hero.tple"]));
    expect(result).toEqual([
      { type: "folder", name: "NPC", children: [{ type: "file", name: "Sidekick.tple", offset: 11757, size: 200 }] },
      { type: "file", name: "Readme.txt", offset: 11957, size: 50 },
    ]);
  });

  it("drops a folder entirely once all its children are excluded", () => {
    const result = excludeTreeByPaths(TREE, new Set(["NPC/World/PC_Hero.tple", "NPC/Sidekick.tple"]));
    expect(result).toEqual([{ type: "file", name: "Readme.txt", offset: 11957, size: 50 }]);
  });

  it("returns the tree unchanged when the excluded set is empty", () => {
    expect(excludeTreeByPaths(TREE, new Set())).toEqual(TREE);
  });
});

describe("sortTree", () => {
  it("sorts top-level and nested children by name ascending", () => {
    const result = sortTree(TREE, "name", "asc");
    expect(result.map((n) => n.name)).toEqual(["NPC", "Readme.txt"]);
    const npc = result[0] as Extract<RisenPakNode, { type: "folder" }>;
    expect(npc.children.map((n) => n.name)).toEqual(["Sidekick.tple", "World"]);
  });

  it("sorts by name descending", () => {
    const result = sortTree(TREE, "name", "desc");
    expect(result.map((n) => n.name)).toEqual(["Readme.txt", "NPC"]);
  });

  it("sorts by total size (folders use the sum of their descendants)", () => {
    // NPC total size = 11709 + 200 = 11909, Readme.txt = 50 — NPC is larger.
    const result = sortTree(TREE, "size", "asc");
    expect(result.map((n) => n.name)).toEqual(["Readme.txt", "NPC"]);
  });

  it("does not mutate the original tree", () => {
    const before = JSON.stringify(TREE);
    sortTree(TREE, "name", "desc");
    expect(JSON.stringify(TREE)).toBe(before);
  });
});

describe("allFolderPaths", () => {
  it("returns every folder path, nested included", () => {
    expect(allFolderPaths(TREE)).toEqual(["NPC", "NPC/World"]);
  });

  it("returns an empty array for a tree with no folders", () => {
    expect(allFolderPaths([{ type: "file", name: "a.txt", offset: 0, size: 1 }])).toEqual([]);
  });
});
