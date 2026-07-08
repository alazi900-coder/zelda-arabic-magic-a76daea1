import { describe, it, expect } from "vitest";
import { parseImagesPakHeader, parseImagesPakFileInfoTree, flattenPakTree } from "@/lib/risen-images-pak";

/**
 * Synthetic images.pak-shaped FileInfo tree builder, matching the confirmed
 * real hierarchical layout (see risen-images-pak.ts docblock — verified on a
 * real 563MB images.pak: 14 top-level folders, 1,343 files, tree parse ends
 * exactly at the file's total size).
 */
class ByteWriter {
  private parts: Uint8Array[] = [];

  u16(v: number): this {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, true);
    this.parts.push(b);
    return this;
  }
  u32(v: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v, true);
    this.parts.push(b);
    return this;
  }
  i64(v: number | bigint): this {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigInt64(0, BigInt(v), true);
    this.parts.push(b);
    return this;
  }
  u8(v: number): this {
    this.parts.push(new Uint8Array([v]));
    return this;
  }
  ascii(s: string): this {
    this.parts.push(new TextEncoder().encode(s));
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

type SyntheticNode =
  | { type: "folder"; name: string; children: SyntheticNode[] }
  | { type: "file"; name: string; offset: number; size: number };

function writeEntries(w: ByteWriter, nodes: SyntheticNode[]): void {
  const ZERO24 = new Uint8Array(24);
  for (const node of nodes) {
    if (node.type === "folder") {
      w.u16(16).u16(2).u32(node.name.length).ascii(node.name).u8(0);
      w.bytes(ZERO24); // timestamps
      w.u32(0); // marker3
      w.u32(node.children.length); // child_count
      writeEntries(w, node.children);
    } else {
      w.u16(32).u16(2).u32(node.name.length).ascii(node.name).u8(0);
      w.i64(node.offset);
      w.bytes(ZERO24); // timestamps
      w.u32(0); // marker3
      w.u32(0).u32(0); // zero1, zero2
      w.u32(node.size).u32(node.size); // size1, size2
    }
  }
}

/** Builds a full G3V0 header + hierarchical FileInfo tree, no actual file payload data. */
function buildSyntheticImagesPak(tree: SyntheticNode[]): ArrayBuffer {
  const HEADER_SIZE = 48;
  const fileInfoOffset = HEADER_SIZE; // no data section for this test — tree starts right after the header

  const treeWriter = new ByteWriter();
  treeWriter.u32(tree.length);
  writeEntries(treeWriter, tree);
  const treeBytes = treeWriter.build();

  const totalFileSize = fileInfoOffset + treeBytes.length;

  const header = new Uint8Array(HEADER_SIZE);
  const dv = new DataView(header.buffer);
  dv.setUint32(0, 1, true); // headerVersion
  header.set(new TextEncoder().encode("G3V0"), 4);
  dv.setBigInt64(0x08, 0n, true);
  dv.setBigInt64(0x10, 0n, true);
  dv.setBigInt64(0x18, 0x30n, true); // dataAddress
  dv.setBigInt64(0x20, BigInt(fileInfoOffset - 0x20), true);
  dv.setBigInt64(0x28, BigInt(totalFileSize), true);

  const out = new Uint8Array(totalFileSize);
  out.set(header, 0);
  out.set(treeBytes, fileInfoOffset);
  return out.buffer;
}

describe("risen-images-pak", () => {
  it("parses the 48-byte G3V0 header", () => {
    const buffer = buildSyntheticImagesPak([{ type: "file", name: "a.ximg", offset: 999, size: 10 }]);
    const header = parseImagesPakHeader(new Uint8Array(buffer, 0, 48));
    expect(header.dataAddress).toBe(0x30);
    expect(header.fileInfoOffset).toBe(48);
    expect(header.totalFileSize).toBe(buffer.byteLength);
  });

  it("rejects a non-G3V0 file", () => {
    const bad = new Uint8Array(48);
    bad.set(new TextEncoder().encode("XXXX"), 4);
    expect(() => parseImagesPakHeader(bad)).toThrow();
  });

  it("parses a two-nested-folder, three-file tree and ends exactly at the file size", () => {
    // GUI/icon.ximg
    // NoMip/Special_LoadingHint_01.ximg
    // NoMip/sub/deep.ximg   <- nested subfolder
    const tree: SyntheticNode[] = [
      { type: "folder", name: "GUI", children: [{ type: "file", name: "icon.ximg", offset: 1000, size: 200 }] },
      {
        type: "folder",
        name: "NoMip",
        children: [
          { type: "file", name: "Special_LoadingHint_01.ximg", offset: 2000, size: 300 },
          { type: "folder", name: "sub", children: [{ type: "file", name: "deep.ximg", offset: 3000, size: 50 }] },
        ],
      },
    ];
    const buffer = buildSyntheticImagesPak(tree);
    const bytes = new Uint8Array(buffer);
    const header = parseImagesPakHeader(bytes.subarray(0, 48));

    const tail = bytes.subarray(header.fileInfoOffset);
    const { tree: parsedTree, endOffset } = parseImagesPakFileInfoTree(tail, header);

    expect(endOffset).toBe(header.totalFileSize);
    expect(endOffset).toBe(buffer.byteLength);

    const flat = flattenPakTree(parsedTree);
    expect(flat).toEqual([
      { path: "GUI/icon.ximg", offset: 1000, size: 200 },
      { path: "NoMip/Special_LoadingHint_01.ximg", offset: 2000, size: 300 },
      { path: "NoMip/sub/deep.ximg", offset: 3000, size: 50 },
    ]);
  });

  it("throws a clear error on truncated tree data instead of reading out of bounds", () => {
    const buffer = buildSyntheticImagesPak([{ type: "file", name: "a.ximg", offset: 1, size: 1 }]);
    const bytes = new Uint8Array(buffer);
    const header = parseImagesPakHeader(bytes.subarray(0, 48));
    const truncatedTail = bytes.subarray(header.fileInfoOffset, header.fileInfoOffset + 5);
    expect(() => parseImagesPakFileInfoTree(truncatedTail, header)).toThrow();
  });
});
