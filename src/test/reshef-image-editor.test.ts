import { describe, expect, it } from "vitest";
import {
  buildReshefImagesRom,
  decodeReshefImage,
  normalizeReshefReplacementPixels,
  RESHEF_IMAGE_RESOURCES,
} from "@/lib/yugioh/reshef-image-editor-bridge";

const NEW_GAME_TOP = 0xDB3D8;
const NEW_GAME_BOTTOM = 0xDB5D8;

describe("Reshef title image editor", () => {
  it("decodes and rewrites the verified raw NEW GAME sprite without mutating the source ROM", () => {
    const source = new Uint8Array(0xE00000);
    source[NEW_GAME_TOP] = 0x21;
    source[NEW_GAME_BOTTOM] = 0x43;

    expect(RESHEF_IMAGE_RESOURCES).toEqual([expect.objectContaining({
      id: "title-new-game",
      width: 64,
      height: 16,
      chunks: [{ offset: NEW_GAME_TOP, sourceY: 0 }, { offset: NEW_GAME_BOTTOM, sourceY: 8 }],
    })]);

    const decoded = decodeReshefImage(source, "title-new-game");
    expect(decoded.pixels).toHaveLength(64 * 16 * 4);
    expect(decoded.pixels[3]).toBe(255);

    const replacement = decoded.pixels.slice();
    replacement.set([0, 0, 0, 0], 0);
    const result = buildReshefImagesRom(source, { "title-new-game": replacement });

    expect(result.changed).toEqual(["title-new-game"]);
    expect(source[NEW_GAME_TOP]).toBe(0x21);
    expect(result.rom[NEW_GAME_TOP]).toBe(0x20);
    expect(result.rom[NEW_GAME_BOTTOM]).toBe(0x43);
  });

  it("converts an imported flat edge backdrop to title-screen transparency while retaining artwork", () => {
    const replacement = new Uint8ClampedArray(64 * 16 * 4);
    for (let pixel = 0; pixel < 64 * 16; pixel++) replacement.set([12, 12, 12, 255], pixel * 4);
    const letterOffset = (7 * 64 + 25) * 4;
    replacement.set([255, 208, 64, 255], letterOffset);

    const normalized = normalizeReshefReplacementPixels("title-new-game", replacement);

    expect(normalized[3]).toBe(0);
    expect(normalized[letterOffset]).toBe(255);
    expect(normalized[letterOffset + 1]).toBe(208);
    expect(normalized[letterOffset + 3]).toBe(255);
  });
});
