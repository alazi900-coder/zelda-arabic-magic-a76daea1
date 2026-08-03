import { describe, it, expect } from "vitest";
import { coverageToSdf, sdfEdgeCrossings, RISEN3_SDF_SPREAD } from "@/lib/risen3-sdf";

/** A filled disc, drawn the way a rasteriser would: full coverage inside. */
function disc(size: number, radius: number): Uint8Array {
  const out = new Uint8Array(size * size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[y * size + x] = Math.hypot(x - c, y - c) <= radius ? 255 : 0;
    }
  }
  return out;
}

describe("Risen 3 signed distance fields", () => {
  const size = 64;
  const radius = 12;
  const field = coverageToSdf(disc(size, radius), size, size);

  it("puts the edge at 128, where the shape's edge is", () => {
    // This is the whole contract: the engine draws the outline wherever the
    // field crosses 128, so a crossing in the wrong place is a wrong letter.
    const mid = Math.floor((size - 1) / 2);
    const row = field.subarray(mid * size, (mid + 1) * size);
    const crossings = sdfEdgeCrossings(row);
    expect(crossings).toHaveLength(2);
    const centre = (size - 1) / 2;
    expect(crossings[0]).toBeCloseTo(centre - radius, 0);
    expect(crossings[1]).toBeCloseTo(centre + radius, 0);
  });

  it("climbs inward and dies outward, in the range the shipped fonts use", () => {
    const centre = field[Math.floor((size - 1) / 2) * size + Math.floor((size - 1) / 2)];
    // Deep inside a stroke the shipped glyphs reach about 173.
    expect(centre).toBeGreaterThan(160);
    expect(centre).toBeLessThanOrEqual(255);
    // Far outside is 0, which is what most of a shipped atlas holds.
    expect(field[0]).toBe(0);
  });

  it("slopes by the spread, so the softness matches", () => {
    const mid = Math.floor((size - 1) / 2);
    const centre = (size - 1) / 2;
    // One pixel outside the edge is one spread-step below it.
    const step = 128 / RISEN3_SDF_SPREAD;
    const justOutside = field[mid * size + Math.round(centre + radius + 1)];
    expect(justOutside).toBeGreaterThan(128 - 2 * step);
    expect(justOutside).toBeLessThan(128);
  });

  it("gives a blank drawing a field that is entirely outside", () => {
    const blank = coverageToSdf(new Uint8Array(16 * 16), 16, 16);
    expect([...blank].every((v) => v < 128)).toBe(true);
  });

  it("survives a shape that touches the border", () => {
    const full = new Uint8Array(8 * 8).fill(255);
    const out = coverageToSdf(full, 8, 8);
    expect([...out].every((v) => v >= 128)).toBe(true);
  });
});
