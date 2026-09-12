import { describe, expect, it } from "vitest";
import { buildNarc } from "@/lib/nds/narc";
import { compressLz10 } from "@/lib/fireemblem12/nds-lz";
import {
  buildTitleBin,
  decodeTitleTexture,
  encodeTitleTexture,
  TITLE_TEXTURE_HEIGHT,
  TITLE_TEXTURE_WIDTH,
  type RgbaImage,
} from "./ph-title-texture";

/** A minimal but real title.bin: same NARC/LZ10 shape as the game's asset,
 * just with placeholder texture bytes — enough to exercise `buildTitleBin`'s
 * btnf reuse without depending on the actual game file. */
function fakeSourceTitleBin(): Uint8Array {
  const ntfp = new Uint8Array(4); // 2 colors
  const ntft = new Uint8Array(TITLE_TEXTURE_WIDTH * TITLE_TEXTURE_HEIGHT);
  const btnfBody = new Uint8Array([
    0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x0a, ..."title.ntfp".split("").map((c) => c.charCodeAt(0)),
    0x0a, ..."title.ntft".split("").map((c) => c.charCodeAt(0)),
    0x00, 0xff,
  ]);
  // parseNarc's `btnf` includes the "BTNF" magic + u32 size prefix verbatim
  // (it's the whole block, not just its content) — buildNarc writes it back
  // the same way, so a hand-built one needs that same 8-byte header.
  const btnf = new Uint8Array(8 + btnfBody.length);
  btnf.set([0x42, 0x54, 0x4e, 0x46], 0); // "BTNF"
  const size = btnf.length;
  btnf[4] = size & 0xff; btnf[5] = (size >> 8) & 0xff; btnf[6] = (size >> 16) & 0xff; btnf[7] = (size >> 24) & 0xff;
  btnf.set(btnfBody, 8);
  return compressLz10(buildNarc({ files: [ntfp, ntft], btnf }));
}

function solidImage(w: number, h: number, r: number, g: number, b: number, a: number): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  }
  return { width: w, height: h, data };
}

describe("ph-title-texture", () => {
  it("rejects an image with the wrong dimensions", () => {
    const img = solidImage(100, 50, 255, 0, 0, 255);
    expect(() => encodeTitleTexture(img)).toThrow();
  });

  it("round-trips a two-color image with a transparent half exactly", () => {
    // 255/0/0 is chosen because it maps onto RGB555 without rounding loss —
    // this test is about transparency and NARC/LZ10 plumbing, not the 15-bit
    // color format's inherent precision loss (which the quantizer test below
    // isn't sensitive to either, since it only checks the color count).
    const img = solidImage(TITLE_TEXTURE_WIDTH, TITLE_TEXTURE_HEIGHT, 255, 0, 0, 255);
    // make the left half transparent
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width / 2; x++) {
        const i = y * img.width + x;
        img.data[i * 4 + 3] = 0;
      }
    }
    const encoded = encodeTitleTexture(img);
    const built = buildTitleBin(encoded, fakeSourceTitleBin());
    expect(built[0]).toBe(0x10); // LZ10 header

    const decoded = decodeTitleTexture(built);
    expect(decoded.width).toBe(TITLE_TEXTURE_WIDTH);
    expect(decoded.height).toBe(TITLE_TEXTURE_HEIGHT);
    for (let y = 0; y < decoded.height; y++) {
      for (let x = 0; x < decoded.width; x++) {
        const i = y * decoded.width + x;
        if (x < decoded.width / 2) {
          expect(decoded.data[i * 4 + 3]).toBe(0); // still transparent
        } else {
          expect(decoded.data[i * 4]).toBe(255);
          expect(decoded.data[i * 4 + 1]).toBe(0);
          expect(decoded.data[i * 4 + 2]).toBe(0);
          expect(decoded.data[i * 4 + 3]).toBe(255);
        }
      }
    }
  });

  it("caps the palette at 255 opaque colors for a gradient with more than 255", () => {
    const img = solidImage(TITLE_TEXTURE_WIDTH, TITLE_TEXTURE_HEIGHT, 0, 0, 0, 255);
    for (let i = 0; i < img.width * img.height; i++) {
      img.data[i * 4] = i % 256; // 256 distinct reds across the image
    }
    const encoded = encodeTitleTexture(img);
    expect(encoded.sourceColorCount).toBeGreaterThan(255);
    expect(encoded.ntfp.length).toBe(256 * 2); // 255 colors + the transparent slot
  });
});
