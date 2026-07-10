/**
 * Pure pixel-array compositing for the Risen images tool's "paste into a
 * region" feature (e.g. dropping a translated logo into one spot of a larger
 * UI atlas). Deliberately does the splice in raw typed-array space rather
 * than via a second canvas draw+read: Canvas2D's getImageData can round
 * semi-transparent pixels by ±1 due to internal premultiplied-alpha storage
 * (confirmed by browser testing — every corrupted pixel had alpha < 255,
 * every alpha=255 pixel was untouched), which would otherwise quietly alter
 * pixels *outside* the edited region on every composite. This function never
 * touches the canvas, so pixels outside `rect` are guaranteed byte-identical
 * to `baseData`.
 *
 * Replaces (not alpha-blends) pixels inside `rect` with the overlay's own
 * values — pasting a logo should show exactly the logo's own pixels/edges,
 * not a blend with whatever was underneath.
 */

export interface CompositeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * `baseData` is the full base image's RGBA bytes (baseWidth*baseHeight*4).
 * `overlayData` must be exactly `rect.w*rect.h*4` bytes (already scaled to
 * fit the rect — see `scaleRgbaContainFit` below for a canvas-free scaler).
 * Returns a new array; `baseData` is never mutated. Any part of `rect` that
 * falls outside the base image bounds is silently clipped.
 */
export function compositeIntoRegion(
  baseData: Uint8ClampedArray,
  baseWidth: number,
  baseHeight: number,
  overlayData: Uint8ClampedArray,
  rect: CompositeRect
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(baseData);
  for (let y = 0; y < rect.h; y++) {
    const destY = rect.y + y;
    if (destY < 0 || destY >= baseHeight) continue;
    for (let x = 0; x < rect.w; x++) {
      const destX = rect.x + x;
      if (destX < 0 || destX >= baseWidth) continue;
      const srcOff = (y * rect.w + x) * 4;
      const dstOff = (destY * baseWidth + destX) * 4;
      out[dstOff] = overlayData[srcOff];
      out[dstOff + 1] = overlayData[srcOff + 1];
      out[dstOff + 2] = overlayData[srcOff + 2];
      out[dstOff + 3] = overlayData[srcOff + 3];
    }
  }
  return out;
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Cheap yes/no check for whether an image actually uses transparency
 * anywhere (vs. being effectively fully opaque, where alpha-based region
 * detection would be useless). Stride-samples instead of checking every
 * pixel — a full scan is wasteful for a multi-megapixel atlas just to
 * answer "does alpha vary." 97 is prime so the stride doesn't alias with
 * common power-of-two image dimensions. */
function imageHasVariedAlpha(data: Uint8ClampedArray): boolean {
  const stride = 97 * 4;
  for (let o = 3; o < data.length; o += stride) {
    if (data[o] < 250) return true;
  }
  return false;
}

/**
 * "Magic wand"-style region detection: flood-fills outward from a clicked
 * point across the connected foreground blob touching it and returns its
 * bounding box. Lets the composite tool auto-fill the selection rect from a
 * single click instead of requiring a precise manual drag — most valuable
 * when the target (e.g. a small logo) is tiny relative to a large shared UI
 * atlas, where dragging a pixel-accurate box by hand is impractical.
 *
 * Foreground is defined automatically:
 *  - Alpha-based, when the image has any real transparency: a pixel is
 *    foreground once its alpha exceeds `alphaThreshold`. This matches how
 *    these atlases are actually built — sprites cut out against a
 *    transparent background via per-pixel alpha.
 *  - Color-tolerance ("magic wand" against the seed color), for effectively
 *    fully-opaque images: foreground is any 4-connected pixel whose color is
 *    within `colorTolerance` of the seed pixel's own color.
 *
 * Returns null when the seed itself isn't foreground (user clicked empty
 * background) or when the flood fill spans almost the entire image (a
 * near-uniform background got selected by mistake) — signals to the caller
 * to fall back to manual selection instead of a useless/degenerate rect.
 */
export function detectRegionBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  options?: { alphaThreshold?: number; colorTolerance?: number }
): CompositeRect | null {
  if (width <= 0 || height <= 0 || seedX < 0 || seedX >= width || seedY < 0 || seedY >= height) return null;
  const alphaThreshold = options?.alphaThreshold ?? 10;
  const colorTolerance = options?.colorTolerance ?? 24;

  const seedOff = (seedY * width + seedX) * 4;
  const isForeground = imageHasVariedAlpha(data)
    ? (o: number) => data[o + 3] >= alphaThreshold
    : ((sr: number, sg: number, sb: number) => (o: number) => colorDistance(data[o], data[o + 1], data[o + 2], sr, sg, sb) <= colorTolerance)(
        data[seedOff], data[seedOff + 1], data[seedOff + 2]
      );

  if (!isForeground(seedOff)) return null;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [seedY * width + seedX];
  visited[seedY * width + seedX] = 1;
  let minX = seedX, maxX = seedX, minY = seedY, maxY = seedY;

  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % width, y = (idx / width) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    const neighbors: [number, number][] = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (visited[nIdx]) continue;
      if (!isForeground(nIdx * 4)) continue;
      visited[nIdx] = 1;
      stack.push(nIdx);
    }
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w > width * 0.9 && h > height * 0.9) return null; // near-whole-image flood — background mistaken for foreground.
  return { x: minX, y: minY, w, h };
}

/**
 * Scales `src` to fit inside a `dstWidth`×`dstHeight` box without distorting
 * its aspect ratio (centered, transparent padding on the shorter axis) —
 * same "contain fit" behavior the composite tool needs, but computed with
 * plain typed-array math instead of `ctx.drawImage()` + `ctx.getImageData()`.
 *
 * Confirmed via a real in-game screenshot that the canvas path corrupts
 * pixels here too (irregular black blobs on a shared UI texture, appearing
 * even when compositing the *unmodified* overlay) — the same premultiplied-
 * alpha rounding already fixed for the plain-replace PNG path. Interpolates
 * in premultiplied space (so a fully-transparent neighbor's arbitrary RGB
 * never bleeds into a semi-transparent edge pixel) but does it in one
 * floating-point pass with a single rounding step at the end, avoiding the
 * repeated 8-bit round-trips Canvas2D's internal backing store does.
 */
export function scaleRgbaContainFit(
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstWidth * dstHeight * 4); // zero-filled = transparent padding
  if (srcWidth <= 0 || srcHeight <= 0 || dstWidth <= 0 || dstHeight <= 0) return out;

  const scale = Math.min(dstWidth / srcWidth, dstHeight / srcHeight);
  const drawW = srcWidth * scale;
  const drawH = srcHeight * scale;
  const offsetX = (dstWidth - drawW) / 2;
  const offsetY = (dstHeight - drawH) / 2;

  const srcIdx = (x: number, y: number) => (y * srcWidth + x) * 4;

  for (let dy = 0; dy < dstHeight; dy++) {
    const sy = (dy + 0.5 - offsetY) / scale - 0.5;
    if (sy < -0.5 || sy > srcHeight - 0.5) continue;
    const cy = Math.max(0, Math.min(srcHeight - 1, sy));
    const y0 = Math.floor(cy);
    const y1 = Math.min(y0 + 1, srcHeight - 1);
    const fy = cy - y0;

    for (let dx = 0; dx < dstWidth; dx++) {
      const sx = (dx + 0.5 - offsetX) / scale - 0.5;
      if (sx < -0.5 || sx > srcWidth - 0.5) continue;
      const cx = Math.max(0, Math.min(srcWidth - 1, sx));
      const x0 = Math.floor(cx);
      const x1 = Math.min(x0 + 1, srcWidth - 1);
      const fx = cx - x0;

      const p00 = srcIdx(x0, y0), p10 = srcIdx(x1, y0), p01 = srcIdx(x0, y1), p11 = srcIdx(x1, y1);
      let pr = 0, pg = 0, pb = 0, pa = 0;
      for (const [p, weight] of [
        [p00, (1 - fx) * (1 - fy)], [p10, fx * (1 - fy)], [p01, (1 - fx) * fy], [p11, fx * fy],
      ] as [number, number][]) {
        const a = src[p + 3];
        pa += a * weight;
        pr += src[p] * a * weight;
        pg += src[p + 1] * a * weight;
        pb += src[p + 2] * a * weight;
      }

      const o = (dy * dstWidth + dx) * 4;
      if (pa <= 0) continue; // stays transparent
      out[o] = pr / pa;
      out[o + 1] = pg / pa;
      out[o + 2] = pb / pa;
      out[o + 3] = pa;
    }
  }
  return out;
}

/**
 * Scales `src` to fill exactly `dstWidth`×`dstHeight` — stretching, not
 * preserving aspect ratio (unlike `scaleRgbaContainFit`). Used for the erase
 * tool: covering an old-text region with a same-shaped patch of clean
 * background texture from *anywhere* in the image (any size/aspect ratio),
 * where leaving letterbox padding would defeat the point — the whole target
 * area must be covered. Same premultiplied-space bilinear interpolation as
 * `scaleRgbaContainFit` (single rounding pass, no fully-transparent
 * neighbor's arbitrary RGB bleeding into an edge pixel), just without the
 * aspect-preserving offset/scale-clamping.
 */
export function scaleRgbaStretch(
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  if (srcWidth <= 0 || srcHeight <= 0 || dstWidth <= 0 || dstHeight <= 0) return out;

  const scaleX = dstWidth / srcWidth;
  const scaleY = dstHeight / srcHeight;
  const srcIdx = (x: number, y: number) => (y * srcWidth + x) * 4;

  for (let dy = 0; dy < dstHeight; dy++) {
    const sy = (dy + 0.5) / scaleY - 0.5;
    const cy = Math.max(0, Math.min(srcHeight - 1, sy));
    const y0 = Math.floor(cy), y1 = Math.min(y0 + 1, srcHeight - 1), fy = cy - y0;
    for (let dx = 0; dx < dstWidth; dx++) {
      const sx = (dx + 0.5) / scaleX - 0.5;
      const cx = Math.max(0, Math.min(srcWidth - 1, sx));
      const x0 = Math.floor(cx), x1 = Math.min(x0 + 1, srcWidth - 1), fx = cx - x0;

      const p00 = srcIdx(x0, y0), p10 = srcIdx(x1, y0), p01 = srcIdx(x0, y1), p11 = srcIdx(x1, y1);
      let pr = 0, pg = 0, pb = 0, pa = 0;
      for (const [p, weight] of [
        [p00, (1 - fx) * (1 - fy)], [p10, fx * (1 - fy)], [p01, (1 - fx) * fy], [p11, fx * fy],
      ] as [number, number][]) {
        const a = src[p + 3];
        pa += a * weight;
        pr += src[p] * a * weight;
        pg += src[p + 1] * a * weight;
        pb += src[p + 2] * a * weight;
      }

      const o = (dy * dstWidth + dx) * 4;
      if (pa <= 0) continue; // stays transparent
      out[o] = pr / pa;
      out[o + 1] = pg / pa;
      out[o + 2] = pb / pa;
      out[o + 3] = pa;
    }
  }
  return out;
}

/**
 * Extracts just `rect` out of a larger image's RGBA bytes — for exporting a
 * single atlas element (e.g. one icon inside a shared UI texture) as its own
 * small PNG at full quality/transparency, to edit externally and paste back
 * with the existing overlay tool instead of round-tripping the whole atlas.
 * Any part of `rect` outside the base image bounds comes back fully
 * transparent (alpha 0) rather than throwing. Pure typed-array copy.
 */
export function cropRegion(
  baseData: Uint8ClampedArray,
  baseWidth: number,
  baseHeight: number,
  rect: CompositeRect
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const srcY = rect.y + y;
    if (srcY < 0 || srcY >= baseHeight) continue;
    for (let x = 0; x < rect.w; x++) {
      const srcX = rect.x + x;
      if (srcX < 0 || srcX >= baseWidth) continue;
      const srcOff = (srcY * baseWidth + srcX) * 4;
      const dstOff = (y * rect.w + x) * 4;
      out[dstOff] = baseData[srcOff];
      out[dstOff + 1] = baseData[srcOff + 1];
      out[dstOff + 2] = baseData[srcOff + 2];
      out[dstOff + 3] = baseData[srcOff + 3];
    }
  }
  return out;
}

/**
 * "In-game-like" approximation preview #1: resizes with plain per-channel
 * bilinear interpolation — deliberately WITHOUT the premultiplied-alpha-safe
 * handling `scaleRgbaContainFit` uses. This is the opposite of that function
 * on purpose: it simulates what a naive (non-premultiplied-aware) GPU texture
 * sampler would show, so a "safe" border color hidden behind alpha=0 that got
 * zeroed out by a lossy tool becomes visibly wrong (black fringing) here
 * *before* injecting into the game, instead of only being discoverable by
 * actually launching Risen. This does NOT reproduce Risen's real renderer —
 * it targets specifically the corruption class already confirmed this
 * session (canvas.toDataURL zeroing transparent-pixel RGB).
 */
export function simulateNaiveBilinearPreview(
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  scale: number
): { rgba: Uint8ClampedArray; width: number; height: number } {
  const dstWidth = Math.max(1, Math.round(srcWidth * scale));
  const dstHeight = Math.max(1, Math.round(srcHeight * scale));
  const out = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  if (srcWidth <= 0 || srcHeight <= 0) return { rgba: out, width: dstWidth, height: dstHeight };

  const srcIdx = (x: number, y: number) => (y * srcWidth + x) * 4;

  for (let dy = 0; dy < dstHeight; dy++) {
    const sy = (dy + 0.5) / scale - 0.5;
    const cy = Math.max(0, Math.min(srcHeight - 1, sy));
    const y0 = Math.floor(cy), y1 = Math.min(y0 + 1, srcHeight - 1), fy = cy - y0;
    for (let dx = 0; dx < dstWidth; dx++) {
      const sx = (dx + 0.5) / scale - 0.5;
      const cx = Math.max(0, Math.min(srcWidth - 1, sx));
      const x0 = Math.floor(cx), x1 = Math.min(x0 + 1, srcWidth - 1), fx = cx - x0;
      const p00 = srcIdx(x0, y0), p10 = srcIdx(x1, y0), p01 = srcIdx(x0, y1), p11 = srcIdx(x1, y1);
      const o = (dy * dstWidth + dx) * 4;
      for (let c = 0; c < 4; c++) {
        // Straight per-channel blend — NOT weighted by alpha. This is what
        // lets a fully-transparent neighbor's RGB bleed into the result.
        const top = src[p00 + c] + (src[p10 + c] - src[p00 + c]) * fx;
        const bottom = src[p01 + c] + (src[p11 + c] - src[p01 + c]) * fx;
        out[o + c] = top + (bottom - top) * fy;
      }
    }
  }
  return { rgba: out, width: dstWidth, height: dstHeight };
}

export interface SuspiciousPixel {
  x: number;
  y: number;
}

/**
 * "In-game-like" approximation preview #2: deterministically flags pixels
 * matching the exact corruption signature confirmed this session — a
 * transparent/near-transparent pixel whose RGB is near-black, sitting right
 * next to an opaque pixel with a clearly different (non-black) color. A
 * legitimate transparent pixel's RGB doesn't matter for rendering on its
 * own, but *this specific pattern* (near-black next to bright/colored) is
 * what a lossy export (Chrome's premultiplied canvas backing store zeroing
 * out "safe" border colors) produces, and is exactly what caused visible
 * black fringing once the game's GPU sampled across that edge. Purely
 * deterministic byte comparison — no AI/heuristic guessing involved.
 */
export function findSuspiciousTransparentPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { alphaThreshold?: number; nearBlackThreshold?: number; neighborContrastThreshold?: number }
): SuspiciousPixel[] {
  const alphaThreshold = options?.alphaThreshold ?? 200;
  const nearBlackThreshold = options?.nearBlackThreshold ?? 20;
  const neighborContrastThreshold = options?.neighborContrastThreshold ?? 60;

  const idx = (x: number, y: number) => (y * width + x) * 4;
  const isNearBlack = (o: number) =>
    rgba[o] <= nearBlackThreshold && rgba[o + 1] <= nearBlackThreshold && rgba[o + 2] <= nearBlackThreshold;

  const result: SuspiciousPixel[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = idx(x, y);
      if (rgba[o + 3] >= alphaThreshold) continue; // opaque-ish — not a candidate
      if (!isNearBlack(o)) continue; // only the specific "zeroed" signature

      const neighbors: [number, number][] = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const no = idx(nx, ny);
        if (rgba[no + 3] < alphaThreshold) continue; // neighbor must itself be opaque-ish
        const dist = Math.abs(rgba[no] - rgba[o]) + Math.abs(rgba[no + 1] - rgba[o + 1]) + Math.abs(rgba[no + 2] - rgba[o + 2]);
        if (dist >= neighborContrastThreshold) {
          result.push({ x, y });
          break;
        }
      }
    }
  }
  return result;
}
