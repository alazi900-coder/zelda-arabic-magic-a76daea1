import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseImagesPakHeader,
  parseImagesPakFileInfoTree,
  inflateFontsPakEntry,
  buildFontsPakArchive,
  buildFontsPatchArchive,
  type RisenPakFileEntry,
} from "@/lib/risen2-fontspak";

const FIXTURE_PATH = join(__dirname, "fixtures", "risen2-fonts-sample.pak");

function loadFixtureBytes(): Uint8Array {
  const buf = readFileSync(FIXTURE_PATH);
  const bytes = new Uint8Array(buf.length);
  bytes.set(buf);
  return bytes;
}

function openArchive(bytes: Uint8Array) {
  const header = parseImagesPakHeader(bytes.slice(0, 48));
  const { tree, endOffset } = parseImagesPakFileInfoTree(bytes.subarray(header.fileInfoOffset), header);
  if (endOffset !== bytes.length) throw new Error("tree parse mismatch");
  return { header, tree };
}

function flattenFileNodes(tree: ReturnType<typeof openArchive>["tree"], prefix = ""): { path: string; node: RisenPakFileEntry }[] {
  const out: { path: string; node: RisenPakFileEntry }[] = [];
  for (const n of tree) {
    const path = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === "folder") out.push(...flattenFileNodes(n.children, path));
    else out.push({ path, node: n });
  }
  return out;
}

describe("Risen 2 fonts.pak (real 2.4MB archive, 78 entries)", () => {
  it("parses the confirmed header markers (headerUnk2 = 0xFEEDFACE00000001)", () => {
    const bytes = loadFixtureBytes();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0x10, true)).toBe(1);
    expect(view.getUint32(0x14, true)).toBe(0xfeedface);
  });

  it("font_headers.whdr is stored raw (size1 === size2, not a zlib stream) — mixed compression like strings.pak", () => {
    const bytes = loadFixtureBytes();
    const { tree } = openArchive(bytes);
    const files = flattenFileNodes(tree);
    const whdr = files.find((f) => f.path === "font_headers.whdr")!;
    const whdrFirstBytes = bytes.subarray(whdr.node.offset, whdr.node.offset + 2);
    expect(whdrFirstBytes[0] === 0x78 && whdrFirstBytes[1] === 0x9c).toBe(false); // not a zlib header
    const magic = new TextDecoder("ascii").decode(bytes.subarray(whdr.node.offset, whdr.node.offset + 4));
    expect(magic).toBe("GAR3");
    const raw = inflateFontsPakEntry(bytes, whdr.node);
    expect(raw.length).toBe(whdr.node.size); // untouched by inflate, same length as stored

    const xgfnEntry = files.find((f) => f.path === "Trajan Pro_7_o_numbers._xgfn")!;
    const firstBytes = bytes.subarray(xgfnEntry.node.offset, xgfnEntry.node.offset + 2);
    expect(firstBytes[0]).toBe(0x78);
    expect(firstBytes[1]).toBe(0x9c);
  });

  it("parses exactly 78 flat entries (77 .xgfn + font_headers.whdr), no folders", () => {
    const bytes = loadFixtureBytes();
    const { tree } = openArchive(bytes);
    const files = flattenFileNodes(tree);
    expect(files.length).toBe(78);
    expect(files.every((f) => !f.path.includes("/"))).toBe(true);
    expect(files.filter((f) => f.path.endsWith("._xgfn")).length).toBe(77);
    expect(files.some((f) => f.path === "font_headers.whdr")).toBe(true);
  });

  it("the 35-file Chinese-mod target list is exactly all Trajan Pro + all Georgia entries", () => {
    const bytes = loadFixtureBytes();
    const { tree } = openArchive(bytes);
    const files = flattenFileNodes(tree);
    const trajan = files.filter((f) => f.path.startsWith("Trajan Pro_"));
    const georgia = files.filter((f) => f.path.startsWith("Georgia_"));
    expect(trajan.length + georgia.length).toBe(35);
  });

  it("decompresses the numbers font entry to match the standalone fixture byte-for-byte", () => {
    const bytes = loadFixtureBytes();
    const { tree } = openArchive(bytes);
    const files = flattenFileNodes(tree);
    const entry = files.find((f) => f.path === "Trajan Pro_7_o_numbers._xgfn")!;
    const decompressed = inflateFontsPakEntry(bytes, entry.node);

    const standalone = readFileSync(join(__dirname, "fixtures", "risen2-numbers-font-sample.xgfn"));
    expect(decompressed.length).toBe(standalone.length);
    for (let i = 0; i < decompressed.length; i++) {
      if (decompressed[i] !== standalone[i]) throw new Error(`mismatch at byte ${i}`);
    }
  });

  it("round-trips with zero replacements: every entry decompresses to the same content after rebuild", () => {
    const bytes = loadFixtureBytes();
    const { header, tree } = openArchive(bytes);
    const result = buildFontsPakArchive(bytes, header, tree);

    const { tree: rebuiltTree } = openArchive(result.bytes);
    const originalFiles = flattenFileNodes(tree);
    const rebuiltFiles = flattenFileNodes(rebuiltTree);
    expect(rebuiltFiles.length).toBe(originalFiles.length);

    for (const { path, node } of rebuiltFiles) {
      const original = originalFiles.find((f) => f.path === path)!;
      const originalContent = inflateFontsPakEntry(bytes, original.node);
      const rebuiltContent = inflateFontsPakEntry(result.bytes, node);
      expect(rebuiltContent.length).toBe(originalContent.length);
    }
  });

  it("does not mutate the caller's tree object (tailBytes restored after build)", () => {
    const bytes = loadFixtureBytes();
    const { header, tree } = openArchive(bytes);
    const files = flattenFileNodes(tree);
    const snapshot = files.map((f) => f.node.tailBytes!.slice());

    buildFontsPakArchive(bytes, header, tree);

    files.forEach((f, i) => {
      expect(f.node.tailBytes).toEqual(snapshot[i]);
    });
  });

  it("injects a replacement LARGER than the original entry: offsets/sizes/header stay correct and content round-trips", () => {
    const bytes = loadFixtureBytes();
    const { header, tree } = openArchive(bytes);
    const files = flattenFileNodes(tree);
    const target = files.find((f) => f.path === "Trajan Pro_7_o_numbers._xgfn")!;
    const originalDecompressed = inflateFontsPakEntry(bytes, target.node);

    // A synthetic "larger" replacement: original content + extra padding bytes appended.
    const biggerReplacement = new Uint8Array(originalDecompressed.length + 50_000);
    biggerReplacement.set(originalDecompressed);
    biggerReplacement.fill(0xab, originalDecompressed.length);

    const replacements = new Map([["Trajan Pro_7_o_numbers._xgfn", biggerReplacement]]);
    const result = buildFontsPakArchive(bytes, header, tree, replacements);

    expect(result.bytes.length).toBeGreaterThan(bytes.length);

    const { header: rebuiltHeader, tree: rebuiltTree } = openArchive(result.bytes);
    expect(rebuiltHeader.totalFileSize).toBe(result.bytes.length);

    const rebuiltFiles = flattenFileNodes(rebuiltTree);
    expect(rebuiltFiles.length).toBe(files.length);

    const rebuiltTarget = rebuiltFiles.find((f) => f.path === "Trajan Pro_7_o_numbers._xgfn")!;
    const rebuiltContent = inflateFontsPakEntry(result.bytes, rebuiltTarget.node);
    expect(rebuiltContent.length).toBe(biggerReplacement.length);
    for (let i = 0; i < rebuiltContent.length; i++) {
      if (rebuiltContent[i] !== biggerReplacement[i]) throw new Error(`mismatch at byte ${i}`);
    }

    // Every untouched entry still decompresses to its original content.
    for (const { path, node } of rebuiltFiles) {
      if (path === "Trajan Pro_7_o_numbers._xgfn") continue;
      const original = files.find((f) => f.path === path)!;
      const originalContent = inflateFontsPakEntry(bytes, original.node);
      const rebuiltEntryContent = inflateFontsPakEntry(result.bytes, node);
      expect(rebuiltEntryContent.length).toBe(originalContent.length);
    }
  });
});

describe("buildFontsPatchArchive (standalone fonts.p00-style patch archive)", () => {
  it("builds a self-contained archive with ONLY the replaced entries — not the full 78", () => {
    const bytes = loadFixtureBytes();
    const { header, tree } = openArchive(bytes);
    const files = flattenFileNodes(tree);

    const targetPaths = ["Trajan Pro_7_o_numbers._xgfn", "Georgia_8_o._xgfn", "Georgia_7_bo._xgfn"];
    const replacements = new Map<string, Uint8Array>();
    for (const path of targetPaths) {
      const node = files.find((f) => f.path === path)!.node;
      const decompressed = inflateFontsPakEntry(bytes, node);
      replacements.set(path, decompressed);
    }

    const result = buildFontsPatchArchive(bytes, header, tree, replacements);

    // Same G3V0 header markers as fonts.pak (confirmed on the real Chinese
    // fonts.p00 mod: identical header format to fonts.pak, just fewer entries).
    const view = new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength);
    expect(view.getUint32(0x10, true)).toBe(1);
    expect(view.getUint32(0x14, true)).toBe(0xfeedface);

    const { header: patchHeader, tree: patchTree } = openArchive(result.bytes);
    expect(patchHeader.totalFileSize).toBe(result.bytes.length);
    const patchFiles = flattenFileNodes(patchTree);

    // Exactly the 3 replaced entries — not 78, not any untouched original entry.
    expect(patchFiles.length).toBe(3);
    expect(new Set(patchFiles.map((f) => f.path))).toEqual(new Set(targetPaths));

    for (const path of targetPaths) {
      const entry = patchFiles.find((f) => f.path === path)!;
      const content = inflateFontsPakEntry(result.bytes, entry.node);
      const expected = replacements.get(path)!;
      expect(content.length).toBe(expected.length);
      expect(Buffer.from(content).equals(Buffer.from(expected))).toBe(true);
    }
  });

  it("stores a replacement raw (not zlib) when its original entry was raw — mixed-compression rule preserved", () => {
    const bytes = loadFixtureBytes();
    const { header, tree } = openArchive(bytes);
    const files = flattenFileNodes(tree);
    const whdrNode = files.find((f) => f.path === "font_headers.whdr")!.node;
    const original = inflateFontsPakEntry(bytes, whdrNode);

    const replacements = new Map([["font_headers.whdr", original]]);
    const result = buildFontsPatchArchive(bytes, header, tree, replacements);

    const { tree: patchTree } = openArchive(result.bytes);
    const patchFiles = flattenFileNodes(patchTree);
    expect(patchFiles.length).toBe(1);
    const rebuiltContent = inflateFontsPakEntry(result.bytes, patchFiles[0].node);
    expect(rebuiltContent.length).toBe(original.length);
  });

  it("throws on an empty replacements map instead of building a useless empty archive", () => {
    const bytes = loadFixtureBytes();
    const { header, tree } = openArchive(bytes);
    expect(() => buildFontsPatchArchive(bytes, header, tree, new Map())).toThrow();
  });
});
