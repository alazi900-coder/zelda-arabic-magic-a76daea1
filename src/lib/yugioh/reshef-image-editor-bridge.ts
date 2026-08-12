/** Reshef title-art bridge: a local 4bpp sprite editor for verified raw ROM resources. */
import { looksLikeReshefRom } from "@/lib/yugioh/reshef-editor-bridge";

export const RESHEF_IMAGE_BUFFER_KEY = "yugiohReshefImageSourceBuffer";

export interface ReshefImageResource {
  id: "title-new-game";
  label: string;
  summary: string;
  width: number;
  height: number;
  format: "GBA OBJ · 4bpp";
  chunks: ReadonlyArray<{ offset: number; sourceY: number }>;
}

/**
 * Verified from the title screen in mGBA. The source is an uncompressed image:
 * 8 tiles in the top row at DB3D8 and 8 tiles in the bottom row at DB5D8.
 */
export const RESHEF_IMAGE_RESOURCES: readonly ReshefImageResource[] = [{
  id: "title-new-game",
  label: "NEW GAME",
  summary: "زر شاشة العنوان؛ Sprite 64×16 وليس نصاً من كتالوج الحوارات.",
  width: 64,
  height: 16,
  format: "GBA OBJ · 4bpp",
  chunks: [{ offset: 0xDB3D8, sourceY: 0 }, { offset: 0xDB5D8, sourceY: 8 }],
}];

/** Palette 0 used by Reshef title OBJ sprites, captured from the unmodified USA ROM. */
const TITLE_OBJ_PALETTE_BGR555 = [0, 30719, 27647, 24575, 22495, 24511, 18334, 17213, 12029, 8730, 3448, 1303, 149, 1172, 3217, 6253] as const;

export interface ReshefImagePixels { width: number; height: number; pixels: Uint8ClampedArray; }
export type ReshefImageEdits = Partial<Record<ReshefImageResource["id"], Uint8ClampedArray>>;

function colorFromBgr555(value: number, alpha = 255) {
  return [
    (value & 0x1f) * 255 / 31,
    ((value >>> 5) & 0x1f) * 255 / 31,
    ((value >>> 10) & 0x1f) * 255 / 31,
    alpha,
  ] as const;
}

const TITLE_RGBA_PALETTE = TITLE_OBJ_PALETTE_BGR555.map((value, index) => colorFromBgr555(value, index === 0 ? 0 : 255));

export function getReshefImageResource(id: string) {
  const resource = RESHEF_IMAGE_RESOURCES.find((item) => item.id === id);
  if (!resource) throw new Error("مورد رسومي غير معروف في Reshef.");
  return resource;
}

function tileByteOffset(resource: ReshefImageResource, x: number, y: number) {
  const chunk = resource.chunks.find((entry) => y >= entry.sourceY && y < entry.sourceY + 8);
  if (!chunk) throw new Error("صف بلاطات غير معرّف لهذا المورد.");
  const tile = Math.floor(x / 8);
  return chunk.offset + tile * 32 + (y - chunk.sourceY) * 4 + Math.floor((x % 8) / 2);
}

export function decodeReshefImage(rom: Uint8Array, resourceId: string): ReshefImagePixels {
  if (!looksLikeReshefRom(rom)) throw new Error("هذا ليس ROM Reshef of Destruction (USA) مناسباً.");
  const resource = getReshefImageResource(resourceId);
  const pixels = new Uint8ClampedArray(resource.width * resource.height * 4);
  for (let y = 0; y < resource.height; y++) for (let x = 0; x < resource.width; x++) {
    const byte = rom[tileByteOffset(resource, x, y)];
    const index = (byte >>> (4 * ((x % 8) & 1))) & 0x0f;
    const rgba = TITLE_RGBA_PALETTE[index];
    pixels.set(rgba, (y * resource.width + x) * 4);
  }
  return { width: resource.width, height: resource.height, pixels };
}

function nearestTitlePaletteIndex(r: number, g: number, b: number, a: number) {
  if (a < 96) return 0;
  let bestIndex = 1; let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < TITLE_RGBA_PALETTE.length; index++) {
    const color = TITLE_RGBA_PALETTE[index];
    const distance = (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
  }
  return bestIndex;
}

/** Writes a 64×16 RGBA replacement using the original title palette and raw tile layout. */
export function writeReshefImage(rom: Uint8Array, resourceId: string, pixels: Uint8ClampedArray) {
  const resource = getReshefImageResource(resourceId);
  if (pixels.length !== resource.width * resource.height * 4) throw new Error("أبعاد صورة الاستبدال لا تطابق أبعاد مورد Reshef.");
  for (let y = 0; y < resource.height; y++) for (let x = 0; x < resource.width; x++) {
    const pixelOffset = (y * resource.width + x) * 4;
    const index = nearestTitlePaletteIndex(pixels[pixelOffset], pixels[pixelOffset + 1], pixels[pixelOffset + 2], pixels[pixelOffset + 3]);
    const byteOffset = tileByteOffset(resource, x, y);
    const shift = 4 * ((x % 8) & 1);
    rom[byteOffset] = (rom[byteOffset] & ~(0x0f << shift)) | (index << shift);
  }
}

export function buildReshefImagesRom(source: Uint8Array, edits: ReshefImageEdits) {
  if (!looksLikeReshefRom(source)) throw new Error("هذا ليس ROM Reshef of Destruction (USA) مناسباً.");
  const changed = Object.entries(edits).filter(([, pixels]) => Boolean(pixels));
  if (!changed.length) throw new Error("لا توجد صور معدلة لبنائها.");
  const rom = source.slice();
  for (const [id, pixels] of changed) writeReshefImage(rom, id, pixels!);
  return { rom, changed: changed.map(([id]) => id) };
}

export function titlePaletteCss(index: number) {
  const [r, g, b, a] = TITLE_RGBA_PALETTE[index];
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a / 255})`;
}
