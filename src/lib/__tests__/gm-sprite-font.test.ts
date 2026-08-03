import { describe, it, expect } from "vitest";
import { parseGameMakerIFF } from "@/lib/gamemaker/gm-iff-parser";
import { readGmTexturePages, writeGmTexturePages, paintGmFontCell } from "@/lib/gamemaker/gm-sprite-font";
import { encodePngRawNoCanvas } from "@/lib/png-encode";
import type { DecodedPng } from "@/lib/png-decode";

/** A file holding one texture page, followed by the audio chunk that must move with it. */
async function fileWithPage(width: number, height: number, paint: (rgba: Uint8ClampedArray) => void): Promise<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(width * height * 4);
  paint(rgba);
  const png = (await encodePngRawNoCanvas(rgba, width, height))!;
  const sound = new TextEncoder().encode("a sound blob");

  const txtrData = 16;
  const txtrEntry = txtrData + 8;
  // The page data starts on a 128-byte boundary, as the game's own does.
  const pixels = Math.ceil((txtrEntry + 8) / 128) * 128;
  const txtrEnd = pixels + png.length;
  const audoData = txtrEnd + 8;
  const audoEntry = audoData + 8;
  const total = audoEntry + 4 + sound.length;

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);
  const put = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i);
  };

  put(0, "FORM");
  view.setUint32(4, total - 8, true);
  put(8, "TXTR");
  view.setUint32(12, txtrEnd - txtrData, true);
  view.setUint32(txtrData, 1, true);
  view.setUint32(txtrData + 4, txtrEntry, true);
  view.setUint32(txtrEntry, 0, true);
  view.setUint32(txtrEntry + 4, pixels, true);
  out.set(png, pixels);

  put(txtrEnd, "AUDO");
  view.setUint32(txtrEnd + 4, total - audoData, true);
  view.setUint32(audoData, 1, true);
  view.setUint32(audoData + 4, audoEntry, true);
  view.setUint32(audoEntry, sound.length, true);
  out.set(sound, audoEntry + 4);

  return buffer;
}

/** The sound the audio chunk points at, read the way the game reads it. */
function soundAt(buffer: ArrayBuffer): string {
  const view = new DataView(buffer);
  const doc = parseGameMakerIFF(buffer);
  const audo = doc.chunkLayout.find((c) => c.id === "AUDO")!;
  const entry = view.getUint32(audo.start + 4, true);
  const length = view.getUint32(entry, true);
  return new TextDecoder().decode(new Uint8Array(buffer, entry + 4, length));
}

describe("GameMaker — drawing in a sprite font", () => {
  const blue = (rgba: Uint8ClampedArray) => {
    for (let i = 0; i < rgba.length; i += 4) { rgba[i + 2] = 200; rgba[i + 3] = 255; }
  };

  it("gives back the same bytes when no page was changed", async () => {
    // The standard that caught a broken writer before the game did.
    const source = await fileWithPage(16, 16, blue);
    const built = await writeGmTexturePages(parseGameMakerIFF(source), new Map());
    expect(new Uint8Array(built)).toEqual(new Uint8Array(source));
  });

  it("keeps the sound reachable after a page changes size", async () => {
    // Re-encoding a page changes its length, and everything after it moves.
    const source = await fileWithPage(16, 16, blue);
    const doc = parseGameMakerIFF(source);
    const page = (await readGmTexturePages(doc, [0])).get(0)!;
    for (let i = 0; i < page.rgba.length; i += 4) page.rgba[i] = 255;

    const built = await writeGmTexturePages(doc, new Map([[0, page]]));
    expect(soundAt(built)).toBe("a sound blob");

    const again = (await readGmTexturePages(parseGameMakerIFF(built), [0])).get(0)!;
    expect(again.width).toBe(16);
    expect(again.rgba[0]).toBe(255);
    expect(again.rgba[2]).toBe(200);
  });

  it("paints one cell and leaves its neighbours alone", () => {
    const page: DecodedPng = { width: 8, height: 4, rgba: new Uint8ClampedArray(8 * 4 * 4) };
    page.rgba.fill(50);
    const glyph: DecodedPng = { width: 2, height: 2, rgba: new Uint8ClampedArray(2 * 2 * 4) };
    glyph.rgba.fill(255);

    paintGmFontCell(page, { charCode: 65, page: 0, x: 2, y: 1, width: 2, height: 2, offsetX: 0, offsetY: 0 }, glyph);
    const at = (x: number, y: number) => page.rgba[(y * 8 + x) * 4];
    expect(at(2, 1)).toBe(255);
    expect(at(3, 2)).toBe(255);
    expect(at(1, 1)).toBe(50);
    expect(at(4, 1)).toBe(50);
    expect(at(2, 0)).toBe(50);
  });

  it("clears the rest of a cell when the letter is smaller than it", () => {
    // Otherwise the old letter shows around the new one.
    const page: DecodedPng = { width: 4, height: 4, rgba: new Uint8ClampedArray(4 * 4 * 4) };
    page.rgba.fill(90);
    const glyph: DecodedPng = { width: 1, height: 1, rgba: new Uint8ClampedArray([255, 255, 255, 255]) };
    paintGmFontCell(page, { charCode: 65, page: 0, x: 0, y: 0, width: 3, height: 3, offsetX: 0, offsetY: 0 }, glyph);
    expect(page.rgba[0]).toBe(255);
    expect(page.rgba[(0 * 4 + 1) * 4]).toBe(0);
    expect(page.rgba[(1 * 4 + 0) * 4]).toBe(0);
    expect(page.rgba[(3 * 4 + 3) * 4]).toBe(90);
  });
});
