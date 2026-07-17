/**
 * Risen 2 Arabic glyph generator — Phase 3 (preview only, no fonts.pak
 * injection yet).
 *
 * Renders every codepoint `shapeArabicForRisen` (risen/arabic-shaper.ts) can
 * emit using a real Arabic TTF, then appends them as new glyphs to an
 * already-parsed `.xgfn` document (risen2-xgfn.ts) for visual inspection in
 * the diagnostic grid tool.
 *
 * Three-part design, deliberately split:
 *   - `measureFontCellMetrics` — pure, measures the target font's uniform
 *     cell height + baseline from its own glyph ink (Vitest-testable).
 *   - `renderArabicGlyphsFromFont` — browser-only (uses FontFace + Canvas
 *     2D), turns TTF bytes into uniform-height baseline-aligned cell
 *     bitmaps sized to those metrics.
 *   - `appendArabicGlyphsToXgfn` — pure data transform, no DOM dependency,
 *     unit-testable with synthetic glyph bitmaps in Vitest/Node.
 *
 * Atlas packing: new glyphs are shelf-packed into new rows appended BELOW
 * the existing atlas content (existing pixels/rows are untouched, byte-for-
 * byte), 1px gap between neighbours like the Chinese mod. Reuses the
 * existing raw-RGB DDS encode/build helpers from risen-ximg.ts rather than
 * reimplementing DDS writing.
 *
 * Measurement record fields for new glyphs: fields[0..4] (atlas bbox +
 * advance) are fully confirmed; fields[5..8] stay 0 exactly like every
 * added record in the working Chinese mod.
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
  /** RGBA, width*height*4 — a full uniform-height CELL (baseline-aligned),
   * matching how the original fonts and the working Chinese mod store their
   * glyphs. Empty (width=height=0) for codepoints that render with no
   * visible ink (e.g. blank marks) — they still carry a real `advance`. */
  rgba: Uint8Array;
  advance: number;
}

/** Cell geometry of an existing font, measured from its own glyphs:
 * `cellHeight` is the uniform box height every original glyph uses, and
 * `baseline` is the writing baseline's offset from the box top (measured
 * from the ink bottom of flat-bottomed reference characters). New Arabic
 * glyphs must be rendered as same-height cells aligned to this baseline —
 * the engine draws each box top-aligned on a fixed line, so any deviation
 * shows up in-game as characters hanging at the wrong height. */
export interface FontCellMetrics {
  cellHeight: number;
  baseline: number;
}

/** Characters whose ink bottom sits exactly ON the baseline (no descender,
 * no rounded overshoot): digits + flat-bottomed Latin capitals. */
const BASELINE_REF_CHARS = "0123456789ABDEFHIKLMNPRTUVWXZ";

/** Measures the uniform cell height and baseline position of an existing
 * font document. Pure (no DOM) — testable in Vitest.
 *
 * Evidence this is how the format works (measured directly): the original
 * Georgia_16 stores every one of its 275 non-empty glyph boxes at exactly
 * 27px tall, Trajan Pro_16 at 29px, Trajan Pro_24 at 46px — full cells, NOT
 * tight ink boxes. The working Chinese mod's added glyphs are also uniform
 * cells (30px / 46px). Our earlier tight-ink-cropped boxes of varying
 * heights rendered top-aligned in-game: every letter hung from the line top
 * (ر looked like ا) and nudging any glyph immediately sampled its
 * neighbour's ink. */
export function measureFontCellMetrics(doc: XgfnDocument): FontCellMetrics {
  // Cell height = mode of non-degenerate box heights.
  const heightCounts = new Map<number, number>();
  for (const m of doc.measurements) {
    if (m.fields.length < 4) continue;
    const h = m.fields[3] - m.fields[1];
    if (m.fields[2] > m.fields[0] && h > 0) heightCounts.set(h, (heightCounts.get(h) ?? 0) + 1);
  }
  let cellHeight = 20;
  let bestCount = 0;
  for (const [h, count] of heightCounts) {
    if (count > bestCount) { cellHeight = h; bestCount = count; }
  }

  // Baseline = mode of (ink bottom + 1, relative to box top) across the
  // flat-bottomed reference characters actually present in this font.
  let baseline = Math.round(cellHeight * 0.8); // fallback if no refs/ink
  const decoded = decodeDdsToRgba(doc.ddsBytes);
  if (decoded.supported) {
    const byChar = new Map(doc.charmap.map((p) => [p.charCode, p.glyphIndex]));
    const bottomCounts = new Map<number, number>();
    for (const ch of BASELINE_REF_CHARS) {
      const gi = byChar.get(ch.charCodeAt(0));
      if (gi === undefined || gi >= doc.measurements.length) continue;
      const [x0, y0, x1, y1] = doc.measurements[gi].fields;
      if (x1 <= x0 || y1 <= y0) continue;
      let inkMaxY = -1;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (decoded.rgba[(y * decoded.width + x) * 4 + 3] > 10 && y > inkMaxY) inkMaxY = y;
        }
      }
      if (inkMaxY >= 0) {
        const rel = inkMaxY - y0 + 1;
        bottomCounts.set(rel, (bottomCounts.get(rel) ?? 0) + 1);
      }
    }
    let bestBottom = 0;
    for (const [rel, count] of bottomCounts) {
      if (count > bestBottom) { baseline = rel; bestBottom = count; }
    }
  }
  return { cellHeight, baseline };
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

/** How far below the original cell height an added glyph's cell may extend,
 * to give Arabic descenders (ر, ج, و…) room under the baseline. The working
 * Chinese mod's added cells overhang the original cell height by up to 3px
 * (30px cells in the 27px Georgia_16) and render fine in-game. */
const DESCENT_EXTRA_PX = 3;

/** Per-character alternate font: the listed codepoints are rendered from
 * `fontBytes` instead of the primary TTF (fix for primary-font glyphs drawn
 * badly, e.g. a medial ع designed like an initial one). Alternate glyphs go
 * through the exact same cell/baseline fitting, so their coordinates and
 * spacing come out consistent with the rest automatically. */
export interface AlternateFontOverride {
  fontBytes: ArrayBuffer;
  codepoints: Set<number>;
}

/** Picks the font size at which the given glyph set fits the cell: tallest
 * ascender stays above the baseline, deepest descender inside the cell. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  family: string,
  codepoints: number[],
  baseline: number,
  descentRoom: number,
  cellHeight: number
): number {
  const trialSize = cellHeight * 4;
  ctx.font = `${trialSize}px ${family}`;
  let maxAscent = 1;
  let maxDescent = 1;
  for (const cp of codepoints) {
    const m = ctx.measureText(String.fromCharCode(cp));
    if (m.actualBoundingBoxAscent > maxAscent) maxAscent = m.actualBoundingBoxAscent;
    if (m.actualBoundingBoxDescent > maxDescent) maxDescent = m.actualBoundingBoxDescent;
  }
  const scale = Math.min(baseline / maxAscent, descentRoom / maxDescent);
  return Math.max(5, Math.floor(trialSize * scale));
}

/** Renders every required Arabic glyph codepoint from a TTF's bytes as
 * uniform-height baseline-aligned CELLS (the same geometry the original
 * fonts and the working Chinese mod use — see measureFontCellMetrics).
 * The font size is chosen automatically so that NO glyph's ascender rises
 * above the cell top and NO descender falls below the cell bottom. Pass an
 * `override` to source selected codepoints from a second TTF (sized with
 * the same fitting, so everything stays on one baseline).
 * Browser-only (FontFace/Canvas 2D). */
export async function renderArabicGlyphsFromFont(
  fontBytes: ArrayBuffer,
  metrics: FontCellMetrics,
  override?: AlternateFontOverride
): Promise<RenderedArabicGlyph[]> {
  const fontFace = new FontFace("RisenArabicGen", fontBytes);
  await fontFace.load();
  document.fonts.add(fontFace);
  let altFace: FontFace | null = null;
  if (override && override.codepoints.size > 0) {
    altFace = new FontFace("RisenArabicGenAlt", override.fontBytes);
    await altFace.load();
    document.fonts.add(altFace);
  }

  try {
    const { cellHeight, baseline } = metrics;
    const cellH = cellHeight + DESCENT_EXTRA_PX;
    const descentRoom = cellH - baseline;
    const codepoints = getRisenArabicGlyphCodepoints();

    const canvas = document.createElement("canvas");
    canvas.width = cellHeight * 16;
    canvas.height = cellH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذّر إنشاء سياق Canvas 2D لرسم الحروف العربية");

    // Each font family is fitted over the FULL glyph set with the same
    // formula — both end up sharing the cell and baseline, so mixed-source
    // text stays level without any manual coordinate work.
    const mainSize = fitFontSize(ctx, "RisenArabicGen", codepoints, baseline, descentRoom, cellHeight);
    const altSize = altFace ? fitFontSize(ctx, "RisenArabicGenAlt", codepoints, baseline, descentRoom, cellHeight) : 0;

    const glyphs: RenderedArabicGlyph[] = [];
    for (const cp of codepoints) {
      const useAlt = altFace !== null && override!.codepoints.has(cp);
      const fontSpec = useAlt ? `${altSize}px RisenArabicGenAlt` : `${mainSize}px RisenArabicGen`;
      ctx.font = fontSpec;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#fff";

      const ch = String.fromCharCode(cp);
      const m = ctx.measureText(ch);
      const advance = Math.max(1, Math.round(m.width));
      // Cell width covers the advance plus any right-side ink overhang
      // (connected forms may paint slightly past their advance — the engine
      // draws the full box, so the overlap keeps the joining stroke intact).
      const cellW = Math.max(advance, Math.ceil(m.actualBoundingBoxRight), 1);
      if (canvas.width < cellW) {
        canvas.width = cellW;
        canvas.height = cellH;
        ctx.font = fontSpec;
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#fff";
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillText(ch, 0, baseline);
      const imageData = ctx.getImageData(0, 0, cellW, cellH);
      const bbox = inkBoundingBox(imageData.data, cellW, cellH);
      if (!bbox) {
        glyphs.push({ codepoint: cp, width: 0, height: 0, rgba: new Uint8Array(0), advance });
        continue;
      }
      // Full uniform cell — deliberately NOT cropped to the ink box: the
      // engine top-aligns every box on the text line, so only equal-height
      // baseline-aligned cells render at consistent heights in-game.
      glyphs.push({ codepoint: cp, width: cellW, height: cellH, rgba: new Uint8Array(imageData.data.buffer.slice(0)), advance });
    }
    return glyphs;
  } finally {
    document.fonts.delete(fontFace);
    if (altFace) document.fonts.delete(altFace);
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

  // Shelf-pack new (non-empty) glyphs into rows appended below the existing
  // atlas, with a 1px gap between neighbours in both directions — exactly
  // like the working Chinese mod (its added cells are separated by 1px
  // horizontally and vertically). Zero-gap packing made glyphs touch, so any
  // manual box nudge immediately sampled the neighbouring letter's ink.
  const GAP = 1;
  const placements = new Map<number, { x: number; y: number }>();
  let cursorX = 0;
  let cursorY = oldHeight;
  let rowHeight = 0;
  for (const g of glyphs) {
    if (g.width === 0 || g.height === 0) continue;
    if (cursorX + g.width > atlasWidth) {
      cursorY += rowHeight + GAP;
      cursorX = 0;
      rowHeight = 0;
    }
    placements.set(g.codepoint, { x: cursorX, y: cursorY });
    cursorX += g.width + GAP;
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
