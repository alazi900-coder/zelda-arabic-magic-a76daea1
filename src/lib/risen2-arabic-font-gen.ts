/**
 * Risen 2 Arabic glyph generator — Phase 3 (preview only, no fonts.pak
 * injection yet).
 *
 * Renders every codepoint `shapeArabicForRisen` (risen/arabic-shaper.ts) can
 * emit using a real Arabic TTF, then appends them as new glyphs to an
 * already-parsed `.xgfn` document (risen2-xgfn.ts) for visual inspection in
 * the diagnostic grid tool.
 *
 * Two-part design, deliberately split:
 *   - `renderArabicGlyphsFromFont` — browser-only (uses FontFace + Canvas
 *     2D), turns TTF bytes into cropped RGBA glyph bitmaps.
 *   - `appendArabicGlyphsToXgfn` — pure data transform, no DOM dependency,
 *     unit-testable with synthetic glyph bitmaps in Vitest/Node.
 *
 * Atlas packing: new glyphs are shelf-packed into new rows appended BELOW
 * the existing atlas content (existing pixels/rows are untouched, byte-for-
 * byte). Reuses the existing raw-RGB DDS encode/build helpers from
 * risen-ximg.ts rather than reimplementing DDS writing.
 *
 * Measurement record fields for new glyphs: fields[0..4] (atlas bbox +
 * advance) are fully confirmed; fields[7]/[8] are set to the glyph's visible
 * width / negative height (see the inline comment at the fields assignment);
 * fields[5]/[6] stay 0.
 */
import {
  decodeDdsToRgba,
  readDdsHeader,
  encodeRawRgbDds,
  buildRawRgbDdsFile,
} from "./risen-ximg";
import { getRisenArabicGlyphCodepoints } from "./risen/arabic-shaper";
import type { XgfnDocument, XgfnGlyphRecord, XgfnMeasurement } from "./risen2-xgfn";

export interface RenderedArabicGlyph {
  codepoint: number;
  width: number;
  height: number;
  /** RGBA, width*height*4, already cropped to the ink bounding box. Empty
   * (width=height=0) for codepoints that render with no visible ink (e.g.
   * blank marks) — they still carry a real `advance`. */
  rgba: Uint8Array;
  advance: number;
}

/** Rounds up to the next power of two (n itself if already one). DX9-era
 * texture loaders (this game's engine included, confirmed by a real in-game
 * test: a non-power-of-2 atlas height silently failed to load, leaving a
 * structurally-valid but imageless font — charmap fine, no visible glyphs)
 * require power-of-2 texture dimensions. */
function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(n));
}

function inkBoundingBox(data: Uint8ClampedArray, width: number, height: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

/** Renders every required Arabic glyph codepoint from a TTF's bytes.
 * `rowHeightPx` should match the target font's atlas row height (fields[3]
 * - fields[1] on an existing glyph) so the generated glyphs are drawn at a
 * comparable visual size. Browser-only (FontFace/Canvas 2D). */
export async function renderArabicGlyphsFromFont(
  fontBytes: ArrayBuffer,
  rowHeightPx: number
): Promise<RenderedArabicGlyph[]> {
  const fontFace = new FontFace("RisenArabicGen", fontBytes);
  await fontFace.load();
  document.fonts.add(fontFace);

  try {
    const drawSize = Math.round(rowHeightPx * 1.6);
    const pad = drawSize;
    const canvas = document.createElement("canvas");
    canvas.width = pad * 2;
    canvas.height = pad * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذّر إنشاء سياق Canvas 2D لرسم الحروف العربية");
    ctx.font = `${drawSize}px RisenArabicGen`;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff";

    const glyphs: RenderedArabicGlyph[] = [];
    for (const cp of getRisenArabicGlyphCodepoints()) {
      const ch = String.fromCharCode(cp);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillText(ch, pad, pad);
      const advance = Math.round(ctx.measureText(ch).width);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bbox = inkBoundingBox(imageData.data, canvas.width, canvas.height);
      if (!bbox) {
        glyphs.push({ codepoint: cp, width: 0, height: 0, rgba: new Uint8Array(0), advance });
        continue;
      }

      const w = bbox.maxX - bbox.minX + 1;
      const h = bbox.maxY - bbox.minY + 1;
      const cropped = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) {
        const srcRowStart = ((bbox.minY + y) * canvas.width + bbox.minX) * 4;
        const dstRowStart = y * w * 4;
        cropped.set(imageData.data.subarray(srcRowStart, srcRowStart + w * 4), dstRowStart);
      }
      glyphs.push({ codepoint: cp, width: w, height: h, rgba: cropped, advance });
    }
    return glyphs;
  } finally {
    document.fonts.delete(fontFace);
  }
}

/** Appends rendered Arabic glyphs to an existing `.xgfn` document: grows the
 * DDS atlas downward (shelf-packing new rows below the untouched original
 * content), and appends matching charmap + measurement records. Pure data
 * transform — no DOM dependency, safe to unit test with synthetic glyphs. */
export function appendArabicGlyphsToXgfn(doc: XgfnDocument, glyphs: RenderedArabicGlyph[]): XgfnDocument {
  const ddsHeader = readDdsHeader(doc.ddsBytes);
  if (!ddsHeader.isRawRgb || ddsHeader.rgbBitCount !== 32) {
    throw new Error("توليد الحروف العربية يدعم حالياً فقط أطلس DDS خام BGRA32 غير مضغوط");
  }
  const decoded = decodeDdsToRgba(doc.ddsBytes);
  if (!decoded.supported) throw new Error("تعذّر فك ضغط أطلس DDS الأصلي");

  const atlasWidth = decoded.width;
  const oldHeight = decoded.height;

  // Shelf-pack new (non-empty) glyphs into rows appended below the existing atlas.
  const placements = new Map<number, { x: number; y: number }>();
  let cursorX = 0;
  let cursorY = oldHeight;
  let rowHeight = 0;
  for (const g of glyphs) {
    if (g.width === 0 || g.height === 0) continue;
    if (cursorX + g.width > atlasWidth) {
      cursorY += rowHeight;
      cursorX = 0;
      rowHeight = 0;
    }
    placements.set(g.codepoint, { x: cursorX, y: cursorY });
    cursorX += g.width;
    rowHeight = Math.max(rowHeight, g.height);
  }
  const neededHeight = cursorY + rowHeight;
  // Pad up to a power-of-2 height (the DX9-era engine rejects NPOT texture
  // dimensions — see nextPowerOfTwo's docs). The extra rows stay transparent
  // (Uint8Array is zero-initialized), which is harmless. Width never grows
  // (new glyphs wrap to new rows instead), and it's already power-of-2 in
  // every real font sampled, so it needs no rounding of its own.
  const newHeight = nextPowerOfTwo(neededHeight);

  const newRgba = new Uint8Array(atlasWidth * newHeight * 4);
  newRgba.set(decoded.rgba.subarray(0, atlasWidth * oldHeight * 4), 0);
  for (const g of glyphs) {
    const pos = placements.get(g.codepoint);
    if (!pos) continue;
    for (let y = 0; y < g.height; y++) {
      const dstOffset = ((pos.y + y) * atlasWidth + pos.x) * 4;
      const srcOffset = y * g.width * 4;
      newRgba.set(g.rgba.subarray(srcOffset, srcOffset + g.width * 4), dstOffset);
    }
  }

  const bytesPerPixel = ddsHeader.rgbBitCount / 8;
  const pixelData = encodeRawRgbDds(
    newRgba, atlasWidth, newHeight, ddsHeader.rgbBitCount,
    ddsHeader.rMask, ddsHeader.gMask, ddsHeader.bMask, ddsHeader.aMask,
    atlasWidth * newHeight * bytesPerPixel
  );
  if (!pixelData) throw new Error("فشل ترميز أطلس DDS الموسّع");

  const newDdsBytes = buildRawRgbDdsFile(
    atlasWidth, newHeight, ddsHeader.rgbBitCount,
    ddsHeader.rMask, ddsHeader.gMask, ddsHeader.bMask, ddsHeader.aMask,
    pixelData, ddsHeader.hasPitchFlag, atlasWidth * bytesPerPixel,
    ddsHeader.ddspfFlags, ddsHeader.caps
  );

  // New glyph indices start at the ORIGINAL recordCount (= highest existing
  // glyphIndex + 1, confirmed on all 112 real fonts), and their records are
  // appended to the measurement table so record[glyphIndex] stays aligned.
  // New charmap pairs are appended after the existing pairs — sorting is
  // confirmed unnecessary (the working Chinese mod's charmaps are unsorted).
  const newMeasurements: XgfnMeasurement[] = doc.measurements.map((m) => m);
  const newCharmap: XgfnGlyphRecord[] = [...doc.charmap];
  let nextGlyphIndex = doc.recordCount;
  for (const g of glyphs) {
    const glyphIndex = nextGlyphIndex++;
    newCharmap.push({ charCode: g.codepoint, glyphIndex });

    const pos = placements.get(g.codepoint);
    const x0 = pos?.x ?? 0;
    const y0 = pos?.y ?? 0;
    const x1 = pos ? pos.x + g.width : 0;
    const y1 = pos ? pos.y + g.height : 0;
    // fields[5..8] = 0 for added glyphs — matches the working Chinese mod
    // exactly: inspected its ADDED (CJK) records directly and all four are
    // zero on every added glyph, while only pre-existing Latin records carry
    // nonzero bearing-like values. An earlier guess set [7]/[8] from the
    // glyph's dimensions; the proven reference doesn't, so neither do we.
    const fields = [x0, y0, x1, y1, g.advance, 0, 0, 0, 0];
    const rawBytes = new Uint8Array(36);
    const dv = new DataView(rawBytes.buffer);
    fields.forEach((v, i) => dv.setInt32(i * 4, v, true));
    newMeasurements.push({ rawBytes, fields });
  }
  const newRecordCount = doc.recordCount + glyphs.length;

  const headerPrefix = doc.headerPrefix.slice();
  const headerView = new DataView(headerPrefix.buffer, headerPrefix.byteOffset, headerPrefix.byteLength);
  headerView.setUint32(0xf6, newCharmap.length, true); // authoritative charmap pair count (confirmed field)

  // 0x1C = total decompressed file size - 0x66 (internal payload size,
  // confirmed exactly on two real samples of different sizes: 263,010 and
  // 1,409,526 bytes both satisfy field == length - 0x66 precisely). Left
  // stale at the pre-merge file size, this caused the engine to misread
  // payload boundaries once the file actually grew — read garbage
  // counts/sizes from data past the (wrongly) declared end, request a
  // bogus huge heap allocation, and crash with STATUS_NO_MEMORY (matches
  // a real in-game crash log, including the file staying fully unusable —
  // English glyphs included — once the engine can't parse it at all).
  const measurementsTotalLen = newMeasurements.reduce((sum, m) => sum + m.rawBytes.length, 0);
  const totalSize =
    headerPrefix.length +
    newCharmap.length * 4 +
    4 /* recordCount field */ +
    measurementsTotalLen +
    doc.trailingBytes.length +
    newDdsBytes.length;
  headerView.setUint32(0x1c, totalSize - 0x66, true);

  // 0xEA is intentionally left untouched. It was previously bumped
  // proportionally to the added glyph count, on the assumption it was some
  // kind of glyph counter — but a real, working, heavily-modified font from
  // a successful Chinese mod (276 -> 3197 charmap pairs, twelvefold growth)
  // leaves this exact field completely unchanged (27, identical to the
  // unmodified original). Bumping it was writing a wrong value into a field
  // whose real meaning is still unknown; the in-game crash (STATUS_NO_MEMORY
  // during asset loading, consistent with a corrupted size/count field
  // driving a bad heap allocation) went away only once this stopped
  // happening. Do not "fix" this again without new evidence.

  // The u32 between the measurement table and the DDS payload is the DDS
  // BYTE LENGTH — confirmed exactly on 112/112 real fonts (77 original + 35
  // Chinese-mod), and the working Chinese mod updates it when its atlases
  // grow. Leaving it stale at the original DDS size (as an earlier revision
  // did) makes the engine read a too-short texture payload and reject the
  // whole font — every glyph invisible, Latin included.
  const newTrailingBytes = new Uint8Array(4);
  new DataView(newTrailingBytes.buffer).setUint32(0, newDdsBytes.length, true);

  return {
    headerPrefix,
    glyphCount: headerView.getUint32(0xea, true),
    charmap: newCharmap,
    recordCount: newRecordCount,
    measurements: newMeasurements,
    trailingBytes: newTrailingBytes,
    ddsBytes: newDdsBytes,
  };
}
