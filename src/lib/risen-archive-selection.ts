/**
 * Pure selection-set logic for the Risen archive file manager: given a
 * G3V0 file/folder tree (see risen-images-pak.ts) and a set of explicitly
 * checked paths, resolves which flat files are actually included in an
 * export — checking a folder implicitly includes every file beneath it,
 * regardless of whether any of its children are individually checked too.
 */
import { type RisenPakNode, type RisenPakFlatFile, flattenPakTree } from "./risen-images-pak";

export function collectSelectedFiles(
  tree: RisenPakNode[],
  selectedPaths: Set<string>,
  prefix = "",
): RisenPakFlatFile[] {
  const out: RisenPakFlatFile[] = [];
  for (const node of tree) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "folder") {
      if (selectedPaths.has(path)) {
        out.push(...flattenPakTree(node.children, path));
      } else {
        out.push(...collectSelectedFiles(node.children, selectedPaths, path));
      }
    } else if (selectedPaths.has(path)) {
      out.push({ path, offset: node.offset, size: node.size });
    }
  }
  return out;
}

export function totalSelectionSize(files: RisenPakFlatFile[]): number {
  return files.reduce((sum, f) => sum + f.size, 0);
}

/** All top-level node paths — selecting these covers the whole tree, since a selected folder implicitly includes its descendants. */
export function allTopLevelPaths(tree: RisenPakNode[]): string[] {
  return tree.map((n) => n.name);
}
