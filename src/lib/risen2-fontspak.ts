/**
 * Risen 2 `fonts.pak` — container-level read/rebuild.
 *
 * Same G3V0 outer header and FileInfo tree shape as images.pak/templates.pak
 * (see risen-images-pak.ts's docblock — this module reuses its header/tree
 * parser directly, confirmed to already read fonts.pak correctly since a
 * flat archive is just the degenerate case of that hierarchical format with
 * zero folders). The ONE difference, confirmed on a real 2.4MB fonts.pak
 * (78 entries: 77 `.xgfn` + `font_headers.whdr`):
 *
 *   - headerUnk2 (the int64 at file offset 0x10) reads as 0xFEEDFACE00000001
 *     when split into two u32s (0x10 = 1, 0x14 = 0xFEEDFACE) — the signal
 *     that entries MAY be individually zlib-compressed.
 *   - Most file entries' data at `offset` is a zlib stream (starts `78 9c`),
 *     size1 = compressed (stored) length, size2 = decompressed length —
 *     confirmed by decompressing the real "Trajan Pro_7_o_numbers._xgfn"
 *     entry and finding it byte-for-byte identical to an independently
 *     obtained already-decompressed copy of the same file. BUT — same mixed-
 *     compression pattern already confirmed on Risen 2's strings.pak — not
 *     every entry is compressed: `font_headers.whdr` has size1 === size2 and
 *     starts with "GAR3" (not a zlib header), i.e. stored raw. The reliable
 *     per-entry signal (same as strings.pak): size1 === size2 means raw,
 *     anything else means zlib.
 *
 * Rebuilding (buildFontsPakArchive) must lay out the ENTIRE data region
 * fresh — unlike buildPakArchive (risen-images-pak.ts, deletion-only, reuses
 * the original data region verbatim) entries here may change compressed
 * size even with byte-identical content (different zlib encoder/level), so
 * every entry's offset gets recomputed. Untouched entries are re-emitted
 * with their EXACT original compressed bytes (no gratuitous recompression),
 * so a build with zero replacements changes offsets but not entry content.
 */
import { inflate, deflate } from "pako";
import {
  parseImagesPakHeader,
  parseImagesPakFileInfoTree,
  type RisenPakHeader,
  type RisenPakNode,
  type RisenPakFileEntry,
} from "./risen-images-pak";

export { parseImagesPakHeader, parseImagesPakFileInfoTree };
export type { RisenPakHeader, RisenPakNode, RisenPakFileEntry };

/** Reads size2 (decompressed length) out of a file entry's 44-byte tailBytes
 * blob — not otherwise exposed on RisenPakFileEntry (folded into the opaque
 * blob shared with images.pak/templates.pak, which never need it). */
function readSize2(node: RisenPakFileEntry): number {
  const tail = node.tailBytes!;
  return new DataView(tail.buffer, tail.byteOffset, tail.byteLength).getUint32(40, true);
}

/** Decompresses one file entry's payload from the archive's raw bytes — or
 * returns it verbatim when the entry is stored raw (size1 === size2, see
 * module docblock: confirmed on font_headers.whdr). */
export function inflateFontsPakEntry(archiveBytes: Uint8Array, node: RisenPakFileEntry): Uint8Array {
  const stored = archiveBytes.subarray(node.offset, node.offset + node.size);
  if (node.size === readSize2(node)) return stored;
  return inflate(stored);
}

/** Full path (folder-joined with "/") for every file node in the tree, alongside the node itself. */
function walkFileNodes(tree: RisenPakNode[], prefix = ""): { path: string; node: RisenPakFileEntry }[] {
  const out: { path: string; node: RisenPakFileEntry }[] = [];
  for (const n of tree) {
    const path = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === "folder") out.push(...walkFileNodes(n.children, path));
    else out.push({ path, node: n });
  }
  return out;
}

/** Patches the size1 (bytes 36-40) and size2 (bytes 40-44) fields inside a
 * file entry's 44-byte tailBytes blob (timestamps[24] + marker3[4] + zero1[4]
 * + zero2[4] + size1[4] + size2[4]) — everything else is echoed verbatim. */
function patchTailSizes(tailBytes: Uint8Array, size1: number, size2: number): Uint8Array {
  const patched = tailBytes.slice();
  const view = new DataView(patched.buffer);
  view.setUint32(36, size1, true);
  view.setUint32(40, size2, true);
  return patched;
}

class PakByteWriter {
  private parts: Uint8Array[] = [];
  u32(v: number): this { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); this.parts.push(b); return this; }
  i64(v: number): this { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(v), true); this.parts.push(b); return this; }
  u8(v: number): this { this.parts.push(new Uint8Array([v])); return this; }
  bytes(b: Uint8Array): this { this.parts.push(b); return this; }
  build(): Uint8Array {
    const total = this.parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

/** Writes one node. `node.tailBytes` must already carry the correct
 * (possibly patched) size1/size2 for file nodes — see buildFontsPakArchive,
 * which patches it before calling this. */
function writeNode(w: PakByteWriter, node: RisenPakNode, newOffsets: Map<RisenPakFileEntry, number>): void {
  if (!node.markerBytes || !node.tailBytes) {
    throw new Error(`تعذّر إعادة بناء "${node.name}" — بياناته الأصلية اللازمة لإعادة البناء غير متوفرة`);
  }
  const nameBytes = new TextEncoder().encode(node.name);
  w.bytes(node.markerBytes);
  w.u32(nameBytes.length);
  w.bytes(nameBytes);
  w.u8(0); // pad
  if (node.type === "file") {
    const offset = newOffsets.get(node);
    if (offset === undefined) throw new Error(`لا يوجد إزاحة محسوبة للملف "${node.name}"`);
    w.i64(offset);
    w.bytes(node.tailBytes);
  } else {
    w.bytes(node.tailBytes);
    w.u32(node.children.length);
    for (const child of node.children) writeNode(w, child, newOffsets);
  }
}

export interface FontsPakBuildResult {
  bytes: Uint8Array;
  /** Per-path new compressed size, for diagnostics. */
  sizes: Record<string, { compressed: number; decompressed: number }>;
}

/**
 * Rebuilds the archive. `replacements` maps a file's path (as returned by
 * flattenPakTree — top-level name for fonts.pak since it has no folders) to
 * DECOMPRESSED replacement bytes; every other entry is re-emitted with its
 * original compressed bytes unchanged. Re-parses and decompresses its own
 * output before returning, throwing if anything doesn't round-trip.
 */
export function buildFontsPakArchive(
  originalBytes: Uint8Array,
  header: RisenPakHeader,
  tree: RisenPakNode[],
  replacements: Map<string, Uint8Array> = new Map()
): FontsPakBuildResult {
  const fileNodes = walkFileNodes(tree);

  const compressedByNode = new Map<RisenPakFileEntry, Uint8Array>();
  const decompressedSizeByNode = new Map<RisenPakFileEntry, number>();
  const sizes: Record<string, { compressed: number; decompressed: number }> = {};

  for (const { path, node } of fileNodes) {
    const replacement = replacements.get(path);
    if (replacement) {
      // Preserve the original entry's raw-vs-zlib storage — every real
      // .xgfn entry is compressed, but this stays correct even for the one
      // raw entry (font_headers.whdr) should it ever need replacing too.
      const wasRaw = node.size === readSize2(node);
      const stored = wasRaw ? replacement : deflate(replacement);
      compressedByNode.set(node, stored);
      decompressedSizeByNode.set(node, replacement.length);
      sizes[path] = { compressed: stored.length, decompressed: replacement.length };
    } else {
      const stored = originalBytes.slice(node.offset, node.offset + node.size);
      compressedByNode.set(node, stored);
      const originalSize2 = readSize2(node);
      decompressedSizeByNode.set(node, originalSize2);
      sizes[path] = { compressed: stored.length, decompressed: originalSize2 };
    }
  }

  // Lay out the data region sequentially in tree order, starting at dataAddress.
  const newOffsets = new Map<RisenPakFileEntry, number>();
  let cursor = header.dataAddress;
  for (const { node } of fileNodes) {
    newOffsets.set(node, cursor);
    cursor += compressedByNode.get(node)!.length;
  }
  const dataEnd = cursor;

  // Patch each file node's tailBytes with its new size1/size2 BEFORE writing
  // the tree (writeNode just echoes tailBytes verbatim).
  const originalTailBytes = new Map<RisenPakFileEntry, Uint8Array>();
  for (const { node } of fileNodes) {
    originalTailBytes.set(node, node.tailBytes!);
    const compressed = compressedByNode.get(node)!;
    const decompressedSize = decompressedSizeByNode.get(node)!;
    node.tailBytes = patchTailSizes(node.tailBytes!, compressed.length, decompressedSize);
  }

  try {
    const treeWriter = new PakByteWriter();
    treeWriter.u32(tree.length);
    for (const node of tree) writeNode(treeWriter, node, newOffsets);
    const treeBytes = treeWriter.build();

    const totalFileSize = dataEnd + treeBytes.length;
    const out = new Uint8Array(totalFileSize);

    // Header: copy the original 48 bytes verbatim, then patch offsetToFileInfo + totalFileSize.
    out.set(originalBytes.subarray(0, 48), 0);
    const outView = new DataView(out.buffer);
    outView.setBigInt64(0x20, BigInt(dataEnd - 0x20), true);
    outView.setBigInt64(0x28, BigInt(totalFileSize), true);

    // Data region: each file's compressed bytes at its new offset.
    for (const { node } of fileNodes) {
      out.set(compressedByNode.get(node)!, newOffsets.get(node)!);
    }

    // FileInfo tree.
    out.set(treeBytes, dataEnd);

    // --- verify our own output before returning it ---
    const verifyHeader = parseImagesPakHeader(out.subarray(0, 48));
    if (verifyHeader.totalFileSize !== out.length) {
      throw new Error("فشل التحقق: حجم الملف الناتج لا يطابق رأسه");
    }
    const { tree: verifyTree, endOffset } = parseImagesPakFileInfoTree(out.subarray(verifyHeader.fileInfoOffset), verifyHeader);
    if (endOffset !== out.length) {
      throw new Error("فشل التحقق: نهاية شجرة الملفات لا تطابق نهاية الملف");
    }
    const originalByPath = new Map(fileNodes.map(({ path, node }) => [path, node]));
    for (const { path, node } of walkFileNodes(verifyTree)) {
      const originalNode = originalByPath.get(path)!;
      const expected = replacements.get(path) ?? inflateFontsPakEntry(originalBytes, originalNode);
      const actual = inflateFontsPakEntry(out, node);
      if (actual.length !== expected.length) {
        throw new Error(`فشل التحقق لـ"${path}": طول المحتوى المفكوك لا يطابق المتوقع`);
      }
      for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) {
          throw new Error(`فشل التحقق لـ"${path}": محتوى مختلف بعد إعادة البناء`);
        }
      }
    }

    return { bytes: out, sizes };
  } finally {
    // Restore mutated tailBytes on the input tree so this function has no
    // observable side effect on its caller's tree object on success or failure.
    for (const { node } of fileNodes) node.tailBytes = originalTailBytes.get(node)!;
  }
}
