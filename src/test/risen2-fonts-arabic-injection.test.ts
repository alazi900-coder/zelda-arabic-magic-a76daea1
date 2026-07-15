import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseImagesPakHeader,
  parseImagesPakFileInfoTree,
  inflateFontsPakEntry,
  buildFontsPakArchive,
  type RisenPakFileEntry,
} from "@/lib/risen2-fontspak";
import { parseXgfn, buildXgfn } from "@/lib/risen2-xgfn";
import { appendArabicGlyphsToXgfn, type RenderedArabicGlyph } from "@/lib/risen2-arabic-font-gen";
import { decodeDdsToRgba } from "@/lib/risen-ximg";

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

function makeGlyph(codepoint: number, w = 5, h = 7, advance = 6): RenderedArabicGlyph {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = 255;
  }
  return { codepoint, width: w, height: h, rgba, advance };
}

describe("End-to-end: generate Arabic glyphs -> merge -> inject into real fonts.pak", () => {
  it("injects the Arabic-merged font back into a real fonts.pak and every other entry stays untouched", () => {
    const bytes = loadFixtureBytes();
    const { header, tree } = openArchive(bytes);
    const files = flattenFileNodes(tree);
    const target = files.find((f) => f.path === "Trajan Pro_7_o_numbers._xgfn")!;

    const decompressed = inflateFontsPakEntry(bytes, target.node);
    const buf = decompressed.buffer.slice(decompressed.byteOffset, decompressed.byteOffset + decompressed.byteLength);
    const doc = parseXgfn(buf);

    const glyphs = [makeGlyph(0xfe8e), makeGlyph(0xfeee), makeGlyph(0x0660)];
    const merged = appendArabicGlyphsToXgfn(doc, glyphs);
    const mergedXgfnBytes = new Uint8Array(buildXgfn(merged));

    const result = buildFontsPakArchive(bytes, header, tree, new Map([[target.path, mergedXgfnBytes]]));

    // Injected file's content matches the merged .xgfn exactly.
    const { tree: rebuiltTree } = openArchive(result.bytes);
    const rebuiltFiles = flattenFileNodes(rebuiltTree);
    const rebuiltTarget = rebuiltFiles.find((f) => f.path === target.path)!;
    const rebuiltContent = inflateFontsPakEntry(result.bytes, rebuiltTarget.node);
    expect(rebuiltContent.length).toBe(mergedXgfnBytes.length);
    expect(Buffer.from(rebuiltContent).equals(Buffer.from(mergedXgfnBytes))).toBe(true);

    // The injected font re-parses correctly and contains the new Arabic charmap entries.
    const reparsed = parseXgfn(rebuiltContent.buffer.slice(rebuiltContent.byteOffset, rebuiltContent.byteOffset + rebuiltContent.byteLength));
    const byChar = new Map(reparsed.charmap.map((r) => [r.charCode, r.glyphIndex]));
    expect(byChar.get(0xfe8e)).toBeDefined();
    expect(byChar.get(0xfeee)).toBeDefined();
    expect(byChar.get(0x0660)).toBeDefined();
    // Original numbers glyphs still intact.
    expect(byChar.get(48)).toBe(2); // '0'

    const reDecoded = decodeDdsToRgba(reparsed.ddsBytes);
    if (!reDecoded.supported) throw new Error("re-decoded DDS unsupported");
    const origDecoded = decodeDdsToRgba(doc.ddsBytes);
    if (!origDecoded.supported) throw new Error("original DDS unsupported");
    expect(reDecoded.height).toBeGreaterThan(origDecoded.height);

    // Every OTHER entry in the archive (all 77 remaining) decompresses to
    // exactly its original content — the injection touched nothing else.
    expect(rebuiltFiles.length).toBe(files.length);
    for (const { path, node } of rebuiltFiles) {
      if (path === target.path) continue;
      const original = files.find((f) => f.path === path)!;
      const originalContent = inflateFontsPakEntry(bytes, original.node);
      const rebuiltEntryContent = inflateFontsPakEntry(result.bytes, node);
      expect(rebuiltEntryContent.length).toBe(originalContent.length);
      expect(Buffer.from(rebuiltEntryContent).equals(Buffer.from(originalContent))).toBe(true);
    }
  });
});
