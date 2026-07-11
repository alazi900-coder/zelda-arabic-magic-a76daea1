/**
 * Risen 1 `images.pak` (Genome Engine) — G3V0 container header + hierarchical
 * FileInfo tree parser. Read-only navigation only: this module never loads
 * image payload bytes itself (those live in the .ximg entries the tree
 * points to — see risen-ximg.ts) and never loads the whole 563MB archive;
 * callers pass in just the 48-byte head and a tail slice containing the
 * FileInfo tree (random-access reads via File.slice(), done by the caller).
 *
 * Outer 48-byte header is identical to strings.p00's (see risen-p00.ts):
 *   0x00  uint32  headerVersion
 *   0x04  char[4] magic = "G3V0"
 *   0x08  int64   headerUnk1
 *   0x10  int64   headerUnk2
 *   0x18  int64   dataAddress
 *   0x20  int64   offsetToFileInfo   (relative to 0x20 — add 0x20 for absolute)
 *   0x28  int64   totalFileSize
 *
 * Unlike strings.p00 (flat FileInfo, one entry per embedded TAB0 text table),
 * images.pak's FileInfo is a HIERARCHICAL tree of folders/files pointing to
 * raw file blobs elsewhere in the archive (confirmed on a real 563MB file:
 * 14 top-level folders, 1,343 files total, tree parse ends exactly at the
 * file's total size):
 *
 * FileInfoHdr:
 *   uint32 count                 top-level entry count
 *   then `count` entries, each either a folder or a file by marker:
 *
 *   folder (marker == 16):
 *     uint16 marker = 16
 *     uint16 marker2 = 2
 *     uint32 name_len
 *     ascii  name[name_len]
 *     uint8  pad = 0
 *     byte[24] timestamps        (3x int64, opaque, not interpreted)
 *     uint32 marker3
 *     uint32 child_count
 *     then `child_count` entries, recursively (may include sub-folders)
 *
 *   file (marker == 32 or 33):
 *     uint16 marker               (32 or 33 — kept as-is, not interpreted)
 *     uint16 marker2 = 2
 *     uint32 name_len
 *     ascii  name[name_len]
 *     uint8  pad = 0
 *     int64  offset                data offset within images.pak
 *     byte[24] timestamps
 *     uint32 marker3
 *     uint32 zero1, zero2
 *     uint32 size1                 data size
 *     uint32 size2                 same value, repeated
 */

const FOLDER_MARKER = 16;

export interface RisenPakFileEntry {
  type: "file";
  name: string;
  offset: number;
  size: number;
  /** Raw bytes captured verbatim from the original file, needed to losslessly
   * rebuild this exact entry (see buildPakArchive): markerBytes = the 4-byte
   * marker+marker2 pair before the name; tailBytes = everything after
   * `offset` (timestamps, marker3, zero1, zero2, size1, size2 — 44 bytes).
   * We don't know what most of these fields mean, so a rebuilt archive
   * echoes them back unchanged rather than inventing values. Only present
   * on nodes that came from parseImagesPakFileInfoTree. */
  markerBytes?: Uint8Array;
  tailBytes?: Uint8Array;
}

export interface RisenPakFolderEntry {
  type: "folder";
  name: string;
  children: RisenPakNode[];
  /** Same idea as RisenPakFileEntry — markerBytes = marker(16)+marker2 (4
   * bytes); tailBytes = timestamps+marker3 (28 bytes). child_count is
   * intentionally excluded since it's always recomputed from children.length. */
  markerBytes?: Uint8Array;
  tailBytes?: Uint8Array;
}

export type RisenPakNode = RisenPakFileEntry | RisenPakFolderEntry;

export interface RisenPakHeader {
  headerVersion: number;
  dataAddress: number;
  /** Absolute byte offset of the FileInfoHdr `count` field within the whole .pak file. */
  fileInfoOffset: number;
  totalFileSize: number;
}

export interface RisenPakFlatFile {
  /** Full path with "/" separators, e.g. "NoMip/Special_LoadingHint_01.ximg". */
  path: string;
  offset: number;
  size: number;
}

/** Parses the 48-byte G3V0 header. `headBytes` must contain at least the first 48 bytes of the file. */
export function parseImagesPakHeader(headBytes: Uint8Array): RisenPakHeader {
  if (headBytes.length < 48) throw new Error("رأس الملف غير مكتمل (أقل من 48 بايت)");
  const view = new DataView(headBytes.buffer, headBytes.byteOffset, headBytes.byteLength);
  const magic = new TextDecoder("ascii").decode(headBytes.subarray(4, 8));
  if (magic !== "G3V0") throw new Error(`توقيع غير متوقع: "${magic}" — هل هذا فعلاً ملف images.pak؟`);

  const headerVersion = view.getUint32(0, true);
  const dataAddress = Number(view.getBigInt64(0x18, true));
  const offsetToFileInfo = Number(view.getBigInt64(0x20, true));
  const totalFileSize = Number(view.getBigInt64(0x28, true));

  return {
    headerVersion,
    dataAddress,
    fileInfoOffset: 0x20 + offsetToFileInfo,
    totalFileSize,
  };
}

/**
 * Parses the hierarchical FileInfo tree out of a tail slice of the file.
 * `tailBytes` must start exactly at `header.fileInfoOffset` (i.e. the caller
 * sliced the file from that absolute offset onward) and extend to (at
 * least) the end of the file.
 *
 * Returns the tree plus the absolute offset where parsing finished — the
 * caller should assert this equals `header.totalFileSize` to catch a
 * corrupt/unsupported file early.
 */
export function parseImagesPakFileInfoTree(
  tailBytes: Uint8Array,
  header: Pick<RisenPakHeader, "fileInfoOffset">
): { tree: RisenPakNode[]; endOffset: number } {
  const view = new DataView(tailBytes.buffer, tailBytes.byteOffset, tailBytes.byteLength);
  const decoder = new TextDecoder("ascii");
  let p = 0; // relative to tailBytes, which starts at header.fileInfoOffset

  const need = (n: number) => {
    if (p + n > tailBytes.length) throw new Error("نهاية غير متوقعة أثناء قراءة شجرة الملفات (بيانات ناقصة)");
  };

  const readEntries = (count: number): RisenPakNode[] => {
    const nodes: RisenPakNode[] = [];
    for (let i = 0; i < count; i++) {
      const entryStart = p;
      need(2);
      const marker = view.getUint16(p, true);
      p += 2;
      need(2 + 4);
      p += 2; // marker2 = 2, not interpreted
      const nameLen = view.getUint32(p, true);
      p += 4;
      need(nameLen + 1);
      const name = decoder.decode(tailBytes.subarray(p, p + nameLen));
      p += nameLen;
      p += 1; // pad
      const markerBytes = tailBytes.slice(entryStart, entryStart + 4);

      if (marker === FOLDER_MARKER) {
        need(24 + 4 + 4);
        const folderTailStart = p;
        p += 24; // timestamps, opaque
        p += 4; // marker3
        const folderTailBytes = tailBytes.slice(folderTailStart, p);
        const childCount = view.getUint32(p, true);
        p += 4;
        const children = readEntries(childCount);
        nodes.push({ type: "folder", name, children, markerBytes, tailBytes: folderTailBytes });
      } else {
        need(8 + 24 + 4 + 4 + 4 + 4 + 4);
        const offset = Number(view.getBigInt64(p, true));
        p += 8;
        const fileTailStart = p;
        p += 24; // timestamps, opaque
        p += 4; // marker3
        p += 4; // zero1
        p += 4; // zero2
        const size = view.getUint32(p, true);
        p += 4;
        p += 4; // size2, repeated — not re-validated, matches confirmed layout
        const fileTailBytes = tailBytes.slice(fileTailStart, p);
        nodes.push({ type: "file", name, offset, size, markerBytes, tailBytes: fileTailBytes });
      }
    }
    return nodes;
  };

  need(4);
  const topCount = view.getUint32(p, true);
  p += 4;
  const tree = readEntries(topCount);

  return { tree, endOffset: header.fileInfoOffset + p };
}

/** Flattens the tree into a path-indexed file list, in tree order. */
export function flattenPakTree(tree: RisenPakNode[], prefix = ""): RisenPakFlatFile[] {
  const out: RisenPakFlatFile[] = [];
  for (const node of tree) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "folder") {
      out.push(...flattenPakTree(node.children, path));
    } else {
      out.push({ path, offset: node.offset, size: node.size });
    }
  }
  return out;
}

class PakByteWriter {
  private parts: Uint8Array[] = [];
  u32(v: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v, true);
    this.parts.push(b);
    return this;
  }
  i64(v: number): this {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigInt64(0, BigInt(v), true);
    this.parts.push(b);
    return this;
  }
  u8(v: number): this {
    this.parts.push(new Uint8Array([v]));
    return this;
  }
  bytes(b: Uint8Array): this {
    this.parts.push(b);
    return this;
  }
  build(): Uint8Array {
    const total = this.parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

function writePakNode(w: PakByteWriter, node: RisenPakNode): void {
  if (!node.markerBytes || !node.tailBytes) {
    throw new Error(`تعذّر إعادة بناء "${node.name}" — بياناته الأصلية اللازمة لإعادة البناء غير متوفرة (يجب أن يأتي العنصر من ملف مقروء فعلياً بواسطة parseImagesPakFileInfoTree)`);
  }
  const nameBytes = new TextEncoder().encode(node.name);
  w.bytes(node.markerBytes);
  w.u32(nameBytes.length);
  w.bytes(nameBytes);
  w.u8(0); // pad
  if (node.type === "file") {
    w.i64(node.offset); // unchanged — the underlying data is never moved
    w.bytes(node.tailBytes); // timestamps + marker3 + zero1 + zero2 + size1 + size2, echoed verbatim
  } else {
    w.bytes(node.tailBytes); // timestamps + marker3, echoed verbatim
    w.u32(node.children.length); // child_count — recomputed, the only structural field that changes
    for (const child of node.children) writePakNode(w, child);
  }
}

/**
 * Builds a new G3V0 archive containing only the given (already-filtered)
 * tree — meant for removing whole files/folders from an archive, e.g. to
 * ship a smaller mod patch. Reuses the ORIGINAL file byte-for-byte for the
 * header and the entire file-payload region (`originalBytes[0, fileInfoOffset)`
 * — nothing there is moved or altered, so kept files' data is untouched, and
 * removed files' bytes just become unreferenced, not erased). Only a fresh,
 * shorter file-index tree is written afterward, reusing each surviving
 * entry's own captured `markerBytes`/`tailBytes` verbatim (fields whose
 * meaning we don't know are never invented, only echoed back).
 *
 * Immediately re-parses its own output with the same trusted reader used
 * elsewhere in this module and throws if anything is inconsistent — never
 * returns a file it hasn't verified reads back correctly itself.
 */
export function buildPakArchive(originalBytes: Uint8Array, header: RisenPakHeader, tree: RisenPakNode[]): Uint8Array {
  const treeWriter = new PakByteWriter();
  treeWriter.u32(tree.length);
  for (const node of tree) writePakNode(treeWriter, node);
  const treeBytes = treeWriter.build();

  const headBlob = originalBytes.slice(0, header.fileInfoOffset);
  const newTotalFileSize = header.fileInfoOffset + treeBytes.length;

  const out = new Uint8Array(newTotalFileSize);
  out.set(headBlob, 0);
  out.set(treeBytes, header.fileInfoOffset);
  // Patch only the header's totalFileSize field (0x28) — offsetToFileInfo
  // (0x20) is unchanged since the data blob before it never moves.
  new DataView(out.buffer).setBigInt64(0x28, BigInt(newTotalFileSize), true);

  const verifyHeader = parseImagesPakHeader(out.subarray(0, 48));
  if (verifyHeader.totalFileSize !== out.length) {
    throw new Error("فشل التحقق الداخلي من الأرشيف المُعاد بناؤه: حجم الملف الناتج لا يطابق ما هو مسجَّل في رأسه");
  }
  const { tree: verifyTree, endOffset } = parseImagesPakFileInfoTree(out.subarray(verifyHeader.fileInfoOffset), verifyHeader);
  if (endOffset !== out.length) {
    throw new Error("فشل التحقق الداخلي من الأرشيف المُعاد بناؤه: نهاية قراءة شجرة الملفات لا تطابق نهاية الملف الفعلية");
  }
  const expectedFlat = flattenPakTree(tree);
  const actualFlat = flattenPakTree(verifyTree);
  if (actualFlat.length !== expectedFlat.length) {
    throw new Error(`فشل التحقق الداخلي من الأرشيف المُعاد بناؤه: عدد الملفات الناتج (${actualFlat.length}) لا يطابق المتوقع (${expectedFlat.length})`);
  }
  for (let i = 0; i < expectedFlat.length; i++) {
    const a = expectedFlat[i];
    const b = actualFlat[i];
    if (a.path !== b.path || a.offset !== b.offset || a.size !== b.size) {
      throw new Error(`فشل التحقق الداخلي من الأرشيف المُعاد بناؤه: الملف "${a.path}" لا يطابق ما أُعيد قراءته من الأرشيف الناتج`);
    }
  }

  return out;
}
