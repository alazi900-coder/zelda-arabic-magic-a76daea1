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

/** Keeps only files whose name matches the query, plus their ancestor folders
 * (a folder whose own name matches is kept whole, including every descendant). */
export function filterTreeByQuery(tree: RisenPakNode[], query: string): RisenPakNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  const filterNode = (node: RisenPakNode): RisenPakNode | null => {
    if (node.type === "file") {
      return node.name.toLowerCase().includes(q) ? node : null;
    }
    if (node.name.toLowerCase().includes(q)) return node;
    const children = node.children.map(filterNode).filter((n): n is RisenPakNode => n !== null);
    return children.length > 0 ? { ...node, children } : null;
  };
  return tree.map(filterNode).filter((n): n is RisenPakNode => n !== null);
}

/** Keeps only files whose full path is in `allowedPaths`, plus their ancestor
 * folders (folders with no surviving descendant are dropped entirely). */
export function filterTreeByPaths(tree: RisenPakNode[], allowedPaths: Set<string>, prefix = ""): RisenPakNode[] {
  const filterNode = (node: RisenPakNode, path: string): RisenPakNode | null => {
    if (node.type === "file") {
      return allowedPaths.has(path) ? node : null;
    }
    const children = node.children
      .map((child) => filterNode(child, `${path}/${child.name}`))
      .filter((n): n is RisenPakNode => n !== null);
    return children.length > 0 ? { ...node, children } : null;
  };
  return tree
    .map((node) => filterNode(node, prefix ? `${prefix}/${node.name}` : node.name))
    .filter((n): n is RisenPakNode => n !== null);
}

export type TreeSortBy = "name" | "size";
export type TreeSortDir = "asc" | "desc";

function nodeSize(node: RisenPakNode): number {
  return node.type === "file" ? node.size : node.children.reduce((sum, c) => sum + nodeSize(c), 0);
}

/** Sorts a tree (and every folder's children, recursively) by name or total size. */
export function sortTree(tree: RisenPakNode[], by: TreeSortBy, dir: TreeSortDir): RisenPakNode[] {
  const factor = dir === "asc" ? 1 : -1;
  const cmp = (a: RisenPakNode, b: RisenPakNode) =>
    by === "name" ? factor * a.name.localeCompare(b.name) : factor * (nodeSize(a) - nodeSize(b));
  const sortNode = (node: RisenPakNode): RisenPakNode =>
    node.type === "file" ? node : { ...node, children: [...node.children].sort(cmp).map(sortNode) };
  return [...tree].sort(cmp).map(sortNode);
}

/** Every folder path present in a tree — used to force-expand search results. */
export function allFolderPaths(tree: RisenPakNode[], prefix = ""): string[] {
  const out: string[] = [];
  for (const node of tree) {
    if (node.type === "folder") {
      const path = prefix ? `${prefix}/${node.name}` : node.name;
      out.push(path, ...allFolderPaths(node.children, path));
    }
  }
  return out;
}
