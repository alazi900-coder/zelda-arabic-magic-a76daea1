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
