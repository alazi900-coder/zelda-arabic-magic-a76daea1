import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { encodePngRawNoCanvas } from "@/lib/png-encode";
import { decodePngRawNoCanvas } from "@/lib/png-decode";

describe("encodePngRawNoCanvas", () => {
  it("round-trips a simple 2x2 RGBA buffer exactly through decodePngRawNoCanvas", async () => {
    const width = 2, height = 2;
    const rgba = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 128,
      0, 0, 255, 1,
      10, 20, 30, 255,
    ]);
    const png = await encodePngRawNoCanvas(rgba, width, height);
    expect(png).not.toBeNull();
    const decoded = await decodePngRawNoCanvas(png!);
    expect(decoded).not.toBeNull();
    expect(decoded!.width).toBe(width);
    expect(decoded!.height).toBe(height);
    expect(Array.from(decoded!.rgba)).toEqual(Array.from(rgba));
  });

  it("preserves a fully-transparent pixel's arbitrary RGB — the exact case Canvas2D zeroes out", async () => {
    // alpha=0 with non-zero "garbage"/deliberate border-color RGB — confirmed
    // via a real browser test that ctx.putImageData()+toDataURL() zeroes this
    // out (premultiplied backing store can't recover straight RGB at alpha=0).
    const width = 1, height = 1;
    const rgba = new Uint8Array([226, 211, 172, 0]);
    const png = await encodePngRawNoCanvas(rgba, width, height);
    const decoded = await decodePngRawNoCanvas(png!);
    expect(Array.from(decoded!.rgba)).toEqual([226, 211, 172, 0]);
  });

  it("round-trips a larger gradient image exactly (many distinct rows/filters on the decode side)", async () => {
    const width = 10, height = 10;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        rgba[o] = x * 25; rgba[o + 1] = y * 25; rgba[o + 2] = (x + y) * 12; rgba[o + 3] = (x * y * 3) % 256;
      }
    }
    const png = await encodePngRawNoCanvas(rgba, width, height);
    const decoded = await decodePngRawNoCanvas(png!);
    expect(Array.from(decoded!.rgba)).toEqual(Array.from(rgba));
  });

  it("produces a real, spec-valid PNG: signature, IHDR fields, and inflatable filter-type-0 scanlines", async () => {
    const width = 3, height = 2;
    const rgba = new Uint8Array(width * height * 4).fill(7);
    const png = await encodePngRawNoCanvas(rgba, width, height);
    expect(png).not.toBeNull();

    expect(Array.from(png!.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png!.buffer, png!.byteOffset, png!.byteLength);
    expect(new TextDecoder().decode(png!.subarray(12, 16))).toBe("IHDR");
    expect(view.getUint32(16, false)).toBe(width);
    expect(view.getUint32(20, false)).toBe(height);
    expect(png![24]).toBe(8); // bit depth
    expect(png![25]).toBe(6); // color type: RGBA

    // Locate the IDAT chunk and confirm Node's zlib can inflate it (a real,
    // independent decoder — not just our own decodePngRawNoCanvas) into the
    // expected filter-type-0 scanline layout.
    const idatLength = view.getUint32(33, false);
    const idatData = png!.subarray(33 + 8, 33 + 8 + idatLength);
    const inflated = inflateSync(Buffer.from(idatData));
    const stride = width * 4;
    expect(inflated.length).toBe((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      expect(inflated[y * (stride + 1)]).toBe(0); // filter type None
      expect(Array.from(inflated.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride))).toEqual(Array.from(rgba.subarray(y * stride, y * stride + stride)));
    }
  });
});
