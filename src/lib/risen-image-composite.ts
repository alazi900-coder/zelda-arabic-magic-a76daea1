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
 * fit the rect — scaling itself still needs a canvas, done by the caller).
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
