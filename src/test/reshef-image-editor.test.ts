import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  buildReshefImagesRom,
  decodeReshefImage,
  decodeReshefTitleLogo,
  normalizeReshefReplacementPixels,
  readReshefTitleLogoPalette,
  RESHEF_IMAGE_RESOURCES,
  TITLE_OBJ_PALETTE_OFFSET,
} from "@/lib/yugioh/reshef-image-editor-bridge";

const NEW_GAME_TOP = 0xDB3D8;
const NEW_GAME_BOTTOM = 0xDB5D8;

describe("Reshef title image editor", () => {
  it("decodes and rewrites the verified raw NEW GAME sprite without mutating the source ROM", () => {
    const source = new Uint8Array(0xE00000);
    source[NEW_GAME_TOP] = 0x21;
    source[NEW_GAME_BOTTOM] = 0x43;
    source[TITLE_OBJ_PALETTE_OFFSET + 2] = 0xff;
    source[TITLE_OBJ_PALETTE_OFFSET + 3] = 0x7f;
    source[TITLE_OBJ_PALETTE_OFFSET + 6] = 0xe0;
    source[TITLE_OBJ_PALETTE_OFFSET + 7] = 0x03;
    source[TITLE_OBJ_PALETTE_OFFSET + 8] = 0x00;
    source[TITLE_OBJ_PALETTE_OFFSET + 9] = 0x7c;

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

  it("writes only the verified 16-word OBJ0 palette when palette editing is requested", () => {
    const source = new Uint8Array(0xE00000);
    source[TITLE_OBJ_PALETTE_OFFSET + 2] = 0x11;
    source[TITLE_OBJ_PALETTE_OFFSET + 3] = 0x22;
    source[NEW_GAME_TOP] = 0x5a;
    const palette = new Uint16Array(16);
    palette[1] = 0x001f;
    palette[2] = 0x03e0;

    const result = buildReshefImagesRom(source, {}, { "title-new-game": palette });

    expect(source[TITLE_OBJ_PALETTE_OFFSET + 2]).toBe(0x11);
    expect(result.rom[TITLE_OBJ_PALETTE_OFFSET + 2]).toBe(0x1f);
    expect(result.rom[TITLE_OBJ_PALETTE_OFFSET + 3]).toBe(0);
    expect(result.rom[TITLE_OBJ_PALETTE_OFFSET + 4]).toBe(0xe0);
    expect(result.rom[TITLE_OBJ_PALETTE_OFFSET + 5]).toBe(0x03);
    expect(result.rom[NEW_GAME_TOP]).toBe(0x5a);
    expect(result.changed).toEqual(["title-new-game"]);
  });

  it("re-encodes the locally available original title resource within its fixed ROM capacity", () => {
    const localRomPath = "/home/ubuntu/upload/Yu-Gi-Oh!-ReshefofDestruction(USA).gba";
    if (!existsSync(localRomPath)) return;
    const source = new Uint8Array(readFileSync(localRomPath));
    const originalTitle = decodeReshefTitleLogo(source);
    const result = buildReshefImagesRom(source, {}, {}, originalTitle.pixels);
    expect(result.changed).toEqual(["title-logo"]);
    expect(result.rom).toHaveLength(source.length);
  }, 30000);

  it("relocates a title logo whose LZ77 stream exceeds the original resource capacity", () => {
    const localRomPath = "/home/ubuntu/upload/Yu-Gi-Oh!-ReshefofDestruction(USA).gba";
    if (!existsSync(localRomPath)) return;
    const source = new Uint8Array(readFileSync(localRomPath));
    const palette = readReshefTitleLogoPalette(source);
    const noisy = decodeReshefTitleLogo(source).pixels.slice();
    let state = 0x6d2b79f5;
    for (let pixel = 0; pixel < 240 * 160; pixel++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const color = palette[(state >>> 24) & 0xff];
      const offset = pixel * 4;
      noisy[offset] = (color & 0x1f) * 255 / 31;
      noisy[offset + 1] = ((color >>> 5) & 0x1f) * 255 / 31;
      noisy[offset + 2] = ((color >>> 10) & 0x1f) * 255 / 31;
      noisy[offset + 3] = 255;
    }

    const result = buildReshefImagesRom(source, {}, {}, noisy);
    const pointerOffset = 0xE0CD9C;
    const pointer = result.rom[pointerOffset] | (result.rom[pointerOffset + 1] << 8) | (result.rom[pointerOffset + 2] << 16) | (result.rom[pointerOffset + 3] << 24);

    expect(result.changed).toEqual(["title-logo"]);
    expect(result.rom.length).toBeGreaterThan(source.length);
    expect(pointer >>> 0).toBeGreaterThan(0x08000000 + source.length - 1);
    expect(decodeReshefTitleLogo(result.rom).pixels).toHaveLength(240 * 160 * 4);
  }, 60000);
});
