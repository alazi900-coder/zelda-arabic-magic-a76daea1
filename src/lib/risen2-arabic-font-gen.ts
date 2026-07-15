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
 * Measurement record fields[5..8] are left at 0 for new glyphs — their
 * meaning is still unresolved (see risen2-xgfn.ts docblock); fields[0..4]
 * (atlas bbox + advance width) are the confirmed ones and are what actually
 * matters for placement/spacing.
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

  // Only the TRUE final record may be short (DDS-boundary truncation) — pad
  // the previous last record to a full 36 bytes before appending after it.
  const newMeasurements: XgfnMeasurement[] = doc.measurements.map((m) => m);
  if (glyphs.length > 0 && newMeasurements.length > 0) {
    const lastIdx = newMeasurements.length - 1;
    const last = newMeasurements[lastIdx];
    if (last.rawBytes.length < 36) {
      const padded = new Uint8Array(36);
      padded.set(last.rawBytes);
      const dv = new DataView(padded.buffer);
      const fields: number[] = [];
      for (let k = 0; k < 9; k++) fields.push(dv.getInt32(k * 4, true));
      newMeasurements[lastIdx] = { rawBytes: padded, fields };
    }
  }

  const newCharmap: XgfnGlyphRecord[] = [...doc.charmap];
  let nextGlyphIndex = newMeasurements.length;
  for (const g of glyphs) {
    const glyphIndex = nextGlyphIndex++;
    newCharmap.push({ charCode: g.codepoint, glyphIndex });

    const pos = placements.get(g.codepoint);
    const x0 = pos?.x ?? 0;
    const y0 = pos?.y ?? 0;
    const x1 = pos ? pos.x + g.width : 0;
    const y1 = pos ? pos.y + g.height : 0;
    const fields = [x0, y0, x1, y1, g.advance, 0, 0, 0, 0];
    const rawBytes = new Uint8Array(36);
    const dv = new DataView(rawBytes.buffer);
    fields.forEach((v, i) => dv.setInt32(i * 4, v, true));
    newMeasurements.push({ rawBytes, fields });
  }

  const headerPrefix = doc.headerPrefix.slice();
  const headerView = new DataView(headerPrefix.buffer, headerPrefix.byteOffset, headerPrefix.byteLength);
  headerView.setUint32(0xf6, newCharmap.length, true); // authoritative charmap pair count (confirmed field)
  const oldGlyphCountField = headerView.getUint32(0xea, true);
  headerView.setUint32(0xea, oldGlyphCountField + glyphs.length, true); // meaning unresolved, kept proportional

  return {
    headerPrefix,
    glyphCount: headerView.getUint32(0xea, true),
    charmap: newCharmap,
    measurements: newMeasurements,
    ddsBytes: newDdsBytes,
  };
}
