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
import { verifyDocumentSafe, type XgfnAuditReport } from "./risen2-xgfn-audit";

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

/** ح (isolated form) — no dots, no ascender, no descender in virtually any
 * Arabic type style, and guaranteed present in getRisenArabicGlyphCodepoints
 * (part of the standard shaping table). A stable, always-comparable anchor
 * for judging whether two different fonts LOOK the same size at their
 * respective fitted sizes — "doesn't clip" (fitFontSize) and "looks the same
 * size as the rest of the font" (this) are different properties; a font with
 * naturally short ascenders/descenders fits a much bigger em-size into the
 * same cell than one with tall ones, so two fonts fitted to the same cell
 * can still visually differ a lot in body size. */
const SIZE_CALIBRATION_REF_CODEPOINT = 0xfea1;

function measureTextInkHeight(ctx: CanvasRenderingContext2D, family: string, size: number, ch: string): number {
  ctx.font = `${size}px ${family}`;
  const m = ctx.measureText(ch);
  return m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
}

/** Reads the real ink height (pixels) of an already-present glyph directly
 * from a parsed `.xgfn` document's own atlas — null if the codepoint isn't
 * mapped, its box is degenerate, or it has no ink. Pure (no DOM/Canvas),
 * unit-testable. */
export function measureDocGlyphInkHeight(doc: XgfnDocument, codepoint: number): number | null {
  const pair = doc.charmap.find((p) => p.charCode === codepoint);
  if (!pair || pair.glyphIndex >= doc.measurements.length) return null;
  const [x0, y0, x1, y1] = doc.measurements[pair.glyphIndex].fields;
  if (x1 <= x0 || y1 <= y0) return null;
  const decoded = decodeDdsToRgba(doc.ddsBytes);
  if (!decoded.supported) return null;
  let minY = Infinity, maxY = -Infinity;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (decoded.rgba[(y * decoded.width + x) * 4 + 3] > 10) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return minY === Infinity ? null : maxY - minY + 1;
}

/** Corrects `sizeToCalibrate` so its reference-letter ink height visually
 * matches `targetRefHeight`, WITHOUT ever exceeding `safeSize` (the
 * anti-clipping ceiling already computed by fitFontSize) — calibration can
 * only bring an undersized font up to (at most) the full safe size, or bring
 * an oversized one down; it can never introduce clipping. Falls back to
 * `safeSize` unchanged when either reference height is unavailable (e.g. a
 * brand-new document with no Arabic merged yet to compare against). Pure,
 * unit-testable. */
export function calibrateSize(ownRefHeight: number | null, targetRefHeight: number | null, safeSize: number): number {
  if (!ownRefHeight || !targetRefHeight) return safeSize;
  const ratio = targetRefHeight / ownRefHeight;
  return Math.max(1, Math.min(safeSize, Math.round(safeSize * ratio)));
}

/** Renders every required Arabic glyph codepoint from a TTF's bytes as
 * uniform-height baseline-aligned CELLS (the same geometry the original
 * fonts and the working Chinese mod use — see measureFontCellMetrics).
 * The font size is chosen automatically so that NO glyph's ascender rises
 * above the cell top and NO descender falls below the cell bottom. Pass an
 * `override` to source selected codepoints from a second TTF (sized with
 * the same fitting, so everything stays on one baseline).
 * `codepointsOverride`, when given, renders only that codepoint list instead
 * of the full Risen Arabic set — used by the instant single-letter replace
 * feature so testing one letter doesn't re-render all 140 codepoints.
 * `calibrateAgainstDoc`, when given, visually SIZE-MATCHES this render
 * against an already-merged document's own reference letter ink (see
 * calibrateSize) — "doesn't clip" alone doesn't guarantee two different
 * fonts look the same size at the same cell. Only meaningful with no
 * `override` (i.e. this whole call sources characters from one foreign
 * font being spliced into an existing document, as the instant single-
 * letter replace feature does); the override path calibrates internally
 * against its own main font instead, so calibrateAgainstDoc is ignored
 * when override is set. Browser-only (FontFace/Canvas 2D). */
export async function renderArabicGlyphsFromFont(
  fontBytes: ArrayBuffer,
  metrics: FontCellMetrics,
  override?: AlternateFontOverride,
  codepointsOverride?: number[],
  calibrateAgainstDoc?: XgfnDocument
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
    const fullCodepoints = getRisenArabicGlyphCodepoints();
    const codepoints = codepointsOverride ?? fullCodepoints;

    const canvas = document.createElement("canvas");
    canvas.width = cellHeight * 16;
    canvas.height = cellH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذّر إنشاء سياق Canvas 2D لرسم الحروف العربية");

    // Each family's anti-clipping ceiling is fitted against ONLY the
    // codepoints it actually renders in THIS call — the full 140-codepoint
    // set for a normal/batch generate (mainFamily renders all of it, so it
    // must stay internally consistent across all of them), but just the
    // narrow requested subset for an instant single-letter replace or an
    // alt-font override (altFamily only ever draws override.codepoints).
    // Fitting a narrow replace against the full alphabet was needlessly
    // conservative whenever some UNRELATED letter was the alphabet's tallest
    // — narrowing gives calibration below all the headroom that's actually
    // available. It does NOT help when the requested letter's OWN forms are
    // themselves the bottleneck: a live test replacing ح from a calligraphic
    // Naskh-style font (Amiri) found its joined/final forms need real curve
    // depth even for a "plain" dotless letter, capping the safe ceiling at
    // ~15px against a 20px target — a genuine limit of that font's own
    // proportions in this cell, not something size calibration can work
    // around without risking clipping.
    let mainSize = fitFontSize(ctx, "RisenArabicGen", codepoints, baseline, descentRoom, cellHeight);
    const altCodepoints = override ? [...override.codepoints] : [];
    let altSize = altFace ? fitFontSize(ctx, "RisenArabicGenAlt", altCodepoints, baseline, descentRoom, cellHeight) : 0;

    const refChar = String.fromCharCode(SIZE_CALIBRATION_REF_CODEPOINT);
    if (altFace) {
      // Override path: calibrate the ALT font's body size against the MAIN
      // font's — both are being rendered in this same call, so no doc lookup
      // is needed. Never exceeds altSize (the anti-clipping ceiling).
      const mainRef = measureTextInkHeight(ctx, "RisenArabicGen", mainSize, refChar);
      const altRef = measureTextInkHeight(ctx, "RisenArabicGenAlt", altSize, refChar);
      altSize = calibrateSize(altRef, mainRef, altSize);
    } else if (calibrateAgainstDoc) {
      // Instant single-letter replace: this whole call sources characters
      // from ONE foreign font — calibrate its body size against the ink the
      // target document's OWN already-merged reference letter actually has,
      // read straight from its atlas. Never exceeds mainSize (the
      // anti-clipping ceiling for exactly the codepoints being replaced).
      const targetRef = measureDocGlyphInkHeight(calibrateAgainstDoc, SIZE_CALIBRATION_REF_CODEPOINT);
      const ownRef = measureTextInkHeight(ctx, "RisenArabicGen", mainSize, refChar);
      mainSize = calibrateSize(ownRef, targetRef, mainSize);
    }

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

interface GrownAtlas {
  headerPrefix: Uint8Array;
  measurements: XgfnMeasurement[];
  recordCount: number;
  ddsBytes: Uint8Array;
  trailingBytes: Uint8Array;
  /** codepoint -> its newly-appended glyph index (one entry per input glyph,
   * including zero-ink ones, which still get a record — just no atlas box). */
  glyphIndexByCode: Map<number, number>;
  /** Row range occupied by this call's newly-placed glyphs — lets a later
   * call reclaim it via `reuseFromHeight` once it's confirmed orphaned. */
  appendedFromY: number;
  newHeight: number;
}

/** Shared core of both append (new characters) and replace (existing
 * characters, new source glyph) operations: shelf-packs the given glyphs
 * into new atlas rows below the existing content and appends their
 * measurement records — WITHOUT touching doc.charmap at all, since the two
 * callers disagree on what to do with the charmap (append new pairs vs.
 * repoint existing ones). Does not patch 0xF6/0x1C — callers do that once
 * they know the final charmap, since pair count differs between the two.
 *
 * `reuseFromHeight`, when given, drops any existing atlas rows at/after that
 * height before packing — used by the instant single-letter replace to
 * reclaim its own previous, now-orphaned append instead of growing the atlas
 * forever on repeated clicks. Callers only pass this when they've confirmed
 * nothing still-reachable lives in the reclaimed rows (see replaceGlyphsInXgfn
 * callers in RisenFonts.tsx). */
function growAtlasAndAppendRecords(doc: XgfnDocument, glyphs: RenderedArabicGlyph[], reuseFromHeight?: number): GrownAtlas {
  const ddsHeader = readDdsHeader(doc.ddsBytes);
  if (!ddsHeader.isRawRgb || ddsHeader.rgbBitCount !== 32) {
    throw new Error("توليد الحروف العربية يدعم حالياً فقط أطلس DDS خام BGRA32 غير مضغوط");
  }
  const decoded = decodeDdsToRgba(doc.ddsBytes);
  if (!decoded.supported) throw new Error("تعذّر فك ضغط أطلس DDS الأصلي");

  const atlasWidth = decoded.width;
  const oldHeight = reuseFromHeight !== undefined && reuseFromHeight <= decoded.height ? reuseFromHeight : decoded.height;

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
  const newMeasurements: XgfnMeasurement[] = doc.measurements.map((m) => m);
  const glyphIndexByCode = new Map<number, number>();
  let nextGlyphIndex = doc.recordCount;
  for (const g of glyphs) {
    const glyphIndex = nextGlyphIndex++;
    glyphIndexByCode.set(g.codepoint, glyphIndex);

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

  // The u32 between the measurement table and the DDS payload is the DDS
  // BYTE LENGTH — confirmed exactly on 112/112 real fonts (77 original + 35
  // Chinese-mod), and the working Chinese mod updates it when its atlases
  // grow. Leaving it stale at the original DDS size (as an earlier revision
  // did) makes the engine read a too-short texture payload and reject the
  // whole font — every glyph invisible, Latin included.
  const newTrailingBytes = new Uint8Array(4);
  new DataView(newTrailingBytes.buffer).setUint32(0, newDdsBytes.length, true);

  // 0xEA is intentionally left untouched — see appendArabicGlyphsToXgfn's
  // docblock history; a real working Chinese mod (12x charmap growth) never
  // changes it.
  return {
    headerPrefix: doc.headerPrefix.slice(),
    measurements: newMeasurements,
    recordCount: newRecordCount,
    ddsBytes: newDdsBytes,
    trailingBytes: newTrailingBytes,
    glyphIndexByCode,
    appendedFromY: oldHeight,
    newHeight,
  };
}

/** Patches 0xF6 (pair count) and 0x1C (payload size = total size - 0x66,
 * confirmed exactly on every real sample) to match a document's actual
 * content. Shared by append and replace so both stay byte-formula-identical. */
function patchHeaderCounts(headerPrefix: Uint8Array, charmap: XgfnGlyphRecord[], measurements: XgfnMeasurement[], trailingBytes: Uint8Array, ddsBytes: Uint8Array): void {
  const view = new DataView(headerPrefix.buffer, headerPrefix.byteOffset, headerPrefix.byteLength);
  view.setUint32(0xf6, charmap.length, true);
  const measurementsTotalLen = measurements.reduce((sum, m) => sum + m.rawBytes.length, 0);
  const totalSize = headerPrefix.length + charmap.length * 4 + 4 /* recordCount field */ + measurementsTotalLen + trailingBytes.length + ddsBytes.length;
  view.setUint32(0x1c, totalSize - 0x66, true);
}

/** Appends rendered Arabic glyphs to an existing `.xgfn` document: grows the
 * DDS atlas downward (shelf-packing new rows below the untouched original
 * content), and appends matching charmap + measurement records. Pure data
 * transform — no DOM dependency, safe to unit test with synthetic glyphs. */
export function appendArabicGlyphsToXgfn(doc: XgfnDocument, glyphs: RenderedArabicGlyph[]): XgfnDocument {
  const grown = growAtlasAndAppendRecords(doc, glyphs);
  // New charmap pairs are appended after the existing pairs — sorting is
  // confirmed unnecessary (the working Chinese mod's charmaps are unsorted).
  const newCharmap: XgfnGlyphRecord[] = [
    ...doc.charmap,
    ...glyphs.map((g) => ({ charCode: g.codepoint, glyphIndex: grown.glyphIndexByCode.get(g.codepoint)! })),
  ];
  patchHeaderCounts(grown.headerPrefix, newCharmap, grown.measurements, grown.trailingBytes, grown.ddsBytes);
  const headerView = new DataView(grown.headerPrefix.buffer, grown.headerPrefix.byteOffset, grown.headerPrefix.byteLength);
  return {
    headerPrefix: grown.headerPrefix,
    glyphCount: headerView.getUint32(0xea, true),
    charmap: newCharmap,
    recordCount: grown.recordCount,
    measurements: grown.measurements,
    trailingBytes: grown.trailingBytes,
    ddsBytes: grown.ddsBytes,
  };
}

export interface ReplaceGlyphsResult {
  doc: XgfnDocument;
  report: XgfnAuditReport;
  /** codepoint -> the glyph index it pointed at BEFORE this replace. The old
   * record and its atlas pixels are never deleted (same orphan-record policy
   * as risen2-xgfn-edit.ts), so undoing is just re-pointing back to these —
   * no re-render needed. Only includes codepoints that already had a pair
   * (a codepoint newly introduced by this call has nothing to revert to). */
  previousGlyphIndex: Map<number, number>;
  /** Row range this call's glyphs were placed in — pass its `y` back in as
   * `reuseFromHeight` on a LATER call (once it's confirmed orphaned, i.e. the
   * later call doesn't touch any of the same codepoints) to reclaim the
   * space instead of growing the atlas again. */
  appendedRegion: { y: number; height: number };
}

/** Re-sources specific EXISTING characters from a different set of rendered
 * glyphs (typically from an alternate TTF) — the instant single-letter
 * "replace and preview" operation. Unlike appendArabicGlyphsToXgfn, this
 * does NOT add new charmap pairs for characters that already have one; it
 * repoints their existing pair at the newly-appended record instead, so the
 * font gains a handful of extra (orphaned but harmless) records rather than
 * duplicate mappings. Goes through the same rebuild→reparse→audit safety
 * gate as every hand-edit in risen2-xgfn-edit.ts.
 *
 * `reuseFromHeight`: see ReplaceGlyphsResult.appendedRegion — pass a PRIOR
 * call's region here to reclaim it instead of growing the atlas further.
 * Only safe when this call's glyphs don't overlap the codepoints that
 * occupied that region (the caller in RisenFonts.tsx enforces this). */
export function replaceGlyphsInXgfn(doc: XgfnDocument, glyphs: RenderedArabicGlyph[], reuseFromHeight?: number): ReplaceGlyphsResult {
  const grown = growAtlasAndAppendRecords(doc, glyphs, reuseFromHeight);
  const newCharmap: XgfnGlyphRecord[] = doc.charmap.map((p) => ({ ...p }));
  const previousGlyphIndex = new Map<number, number>();
  for (const g of glyphs) {
    const newIndex = grown.glyphIndexByCode.get(g.codepoint)!;
    const existing = newCharmap.find((p) => p.charCode === g.codepoint);
    if (existing) {
      previousGlyphIndex.set(g.codepoint, existing.glyphIndex);
      existing.glyphIndex = newIndex;
    } else {
      newCharmap.push({ charCode: g.codepoint, glyphIndex: newIndex });
    }
  }
  patchHeaderCounts(grown.headerPrefix, newCharmap, grown.measurements, grown.trailingBytes, grown.ddsBytes);
  const next: XgfnDocument = {
    headerPrefix: grown.headerPrefix,
    glyphCount: doc.glyphCount,
    charmap: newCharmap,
    recordCount: grown.recordCount,
    measurements: grown.measurements,
    trailingBytes: grown.trailingBytes,
    ddsBytes: grown.ddsBytes,
  };
  const { doc: verified, report } = verifyDocumentSafe(next);
  return {
    doc: verified,
    report,
    previousGlyphIndex,
    appendedRegion: { y: grown.appendedFromY, height: grown.newHeight - grown.appendedFromY },
  };
}
