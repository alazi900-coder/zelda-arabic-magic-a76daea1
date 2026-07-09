import { describe, it, expect } from "vitest";
import { compositeIntoRegion, detectRegionBounds } from "@/lib/risen-image-composite";

/** Builds a 4-byte-per-pixel RGBA buffer where each pixel is `(x, y, x+y, alpha)`
 * — a value distinct enough per position to catch any off-by-one/misindexing bug. */
function buildTestImage(width: number, height: number, alpha = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      data[o] = x;
      data[o + 1] = y;
      data[o + 2] = (x + y) % 256;
      data[o + 3] = alpha;
    }
  }
  return data;
}

describe("compositeIntoRegion", () => {
  it("replaces pixels inside the rect with the overlay's own values (not blended)", () => {
    const base = buildTestImage(6, 6, 200); // base alpha=200 everywhere
    const overlay = new Uint8ClampedArray(2 * 2 * 4);
    for (let i = 0; i < 4; i++) {
      overlay[i * 4] = 10; overlay[i * 4 + 1] = 20; overlay[i * 4 + 2] = 30; overlay[i * 4 + 3] = 255;
    }
    const result = compositeIntoRegion(base, 6, 6, overlay, { x: 2, y: 2, w: 2, h: 2 });

    for (let y = 2; y < 4; y++) {
      for (let x = 2; x < 4; x++) {
        const o = (y * 6 + x) * 4;
        expect([result[o], result[o + 1], result[o + 2], result[o + 3]]).toEqual([10, 20, 30, 255]);
      }
    }
  });

  it("leaves every pixel outside the rect byte-identical to the base", () => {
    const base = buildTestImage(8, 8, 128); // semi-transparent everywhere — the exact case that regressed
    const overlay = new Uint8ClampedArray(3 * 3 * 4).fill(99);
    const result = compositeIntoRegion(base, 8, 8, overlay, { x: 2, y: 2, w: 3, h: 3 });

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const inside = x >= 2 && x < 5 && y >= 2 && y < 5;
        if (inside) continue;
        const o = (y * 8 + x) * 4;
        expect([result[o], result[o + 1], result[o + 2], result[o + 3]])
          .toEqual([base[o], base[o + 1], base[o + 2], base[o + 3]]);
      }
    }
  });

  it("does not mutate the original base array", () => {
    const base = buildTestImage(4, 4);
    const baseCopy = new Uint8ClampedArray(base);
    const overlay = new Uint8ClampedArray(1 * 1 * 4).fill(255);
    compositeIntoRegion(base, 4, 4, overlay, { x: 0, y: 0, w: 1, h: 1 });
    expect(Array.from(base)).toEqual(Array.from(baseCopy));
  });

  it("clips a rect that extends past the base image bounds instead of throwing or corrupting memory", () => {
    const base = buildTestImage(4, 4);
    const overlay = new Uint8ClampedArray(3 * 3 * 4).fill(50);
    // Rect starts near the bottom-right corner and overhangs both edges.
    expect(() => compositeIntoRegion(base, 4, 4, overlay, { x: 3, y: 3, w: 3, h: 3 })).not.toThrow();
    const result = compositeIntoRegion(base, 4, 4, overlay, { x: 3, y: 3, w: 3, h: 3 });
    // Only the single in-bounds pixel (3,3) should have changed.
    const o = (3 * 4 + 3) * 4;
    expect([result[o], result[o + 1], result[o + 2], result[o + 3]]).toEqual([50, 50, 50, 50]);
    // Everything else stays untouched.
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (x === 3 && y === 3) continue;
        const off = (y * 4 + x) * 4;
        expect([result[off], result[off + 1], result[off + 2], result[off + 3]])
          .toEqual([base[off], base[off + 1], base[off + 2], base[off + 3]]);
      }
    }
  });

  it("is a no-op for a zero-size rect", () => {
    const base = buildTestImage(4, 4);
    const overlay = new Uint8ClampedArray(0);
    const result = compositeIntoRegion(base, 4, 4, overlay, { x: 1, y: 1, w: 0, h: 0 });
    expect(Array.from(result)).toEqual(Array.from(base));
  });
});

/** Builds an RGBA buffer filled with `bg`, with a solid `fg`-colored
 * rectangle painted at the given bounds — for exercising region detection. */
function buildBlobImage(
  width: number, height: number,
  bg: [number, number, number, number],
  blob: { x: number; y: number; w: number; h: number },
  fg: [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const inside = x >= blob.x && x < blob.x + blob.w && y >= blob.y && y < blob.y + blob.h;
      const c = inside ? fg : bg;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = c[3];
    }
  }
  return data;
}

describe("detectRegionBounds", () => {
  it("finds the bounding box of an opaque blob against a transparent background (alpha mode)", () => {
    const img = buildBlobImage(20, 20, [0, 0, 0, 0], { x: 5, y: 6, w: 4, h: 3 }, [200, 50, 50, 255]);
    const rect = detectRegionBounds(img, 20, 20, 6, 7); // click inside the blob
    expect(rect).toEqual({ x: 5, y: 6, w: 4, h: 3 });
  });

  it("returns null when clicking transparent background", () => {
    const img = buildBlobImage(20, 20, [0, 0, 0, 0], { x: 5, y: 6, w: 4, h: 3 }, [200, 50, 50, 255]);
    expect(detectRegionBounds(img, 20, 20, 0, 0)).toBeNull();
  });

  it("falls back to color-tolerance flood fill for a fully-opaque image", () => {
    const img = buildBlobImage(20, 20, [10, 10, 10, 255], { x: 3, y: 3, w: 5, h: 6 }, [230, 230, 230, 255]);
    const rect = detectRegionBounds(img, 20, 20, 5, 5);
    expect(rect).toEqual({ x: 3, y: 3, w: 5, h: 6 });
  });

  it("does not leak across two disconnected same-color blobs", () => {
    const data = new Uint8ClampedArray(20 * 20 * 4); // transparent background everywhere
    // Two separate 2x2 opaque blobs, far apart.
    const paint = (bx: number, by: number) => {
      for (let y = by; y < by + 2; y++) {
        for (let x = bx; x < bx + 2; x++) {
          const o = (y * 20 + x) * 4;
          data[o] = 255; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 255;
        }
      }
    };
    paint(1, 1);
    paint(15, 15);
    const rect = detectRegionBounds(data, 20, 20, 1, 1);
    expect(rect).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });

  it("returns null when the flood fill spans almost the entire image (mistaken background click)", () => {
    // Uniform opaque color everywhere except a 1px differently-colored border —
    // clicking the middle should not select "everything but a thin border."
    const img = buildBlobImage(30, 30, [255, 255, 255, 255], { x: 1, y: 1, w: 28, h: 28 }, [40, 40, 40, 255]);
    expect(detectRegionBounds(img, 30, 30, 15, 15)).toBeNull();
  });

  it("returns null for an out-of-bounds seed point", () => {
    const img = buildBlobImage(10, 10, [0, 0, 0, 0], { x: 2, y: 2, w: 2, h: 2 }, [255, 0, 0, 255]);
    expect(detectRegionBounds(img, 10, 10, -1, 5)).toBeNull();
    expect(detectRegionBounds(img, 10, 10, 5, 10)).toBeNull();
  });
});
