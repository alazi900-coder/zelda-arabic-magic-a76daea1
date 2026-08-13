/**
 * Reshef title-art bridge. Style: preserve the original GBA sprite constraints—crisp pixels,
 * title-screen palette, and transparent background—while all conversion stays in the browser.
 */
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

/** Palette 0 used by Reshef title OBJ sprites, proven in mGBA at title-screen frame 1475. */
export const TITLE_OBJ_PALETTE_OFFSET = 0xDD3D8;
export const TITLE_OBJ_PALETTE_WORDS = 16;
const DEFAULT_TITLE_OBJ_PALETTE_BGR555 = [0, 30719, 27647, 24575, 22495, 24511, 18334, 17213, 12029, 8730, 3448, 1303, 149, 1172, 3217, 6253] as const;

/** Verified BG3 title resources at frame 1475 in mGBA: 30×20 map, 8bpp palette and LZ77 tiles. */
export const RESHEF_TITLE_LOGO = {
  id: "title-logo",
  label: "شعار شاشة العنوان",
  summary: "خلفية العنوان 240×160؛ تضم شعار Yu-Gi-Oh! والخلفية وحقوق النشر.",
  width: 240,
  height: 160,
  format: "GBA BG · 8bpp · LZ77",
  tileOffset: 0xD2D80,
  tileCompressedBytes: 31477,
  tileDecompressedBytes: 49152,
  mapOffset: 0xDAA78,
  paletteOffset: 0xDA878,
  widthTiles: 30,
  heightTiles: 20,
} as const;

export interface ReshefImagePixels { width: number; height: number; pixels: Uint8ClampedArray; }
export type ReshefImageEdits = Partial<Record<ReshefImageResource["id"], Uint8ClampedArray>>;
export type ReshefPaletteEdits = Partial<Record<ReshefImageResource["id"], Uint16Array>>;

function colorFromBgr555(value: number, alpha = 255) {
  return [
    (value & 0x1f) * 255 / 31,
    ((value >>> 5) & 0x1f) * 255 / 31,
    ((value >>> 10) & 0x1f) * 255 / 31,
    alpha,
  ] as const;
}

function titleRgbaPalette(words: Uint16Array | readonly number[] = DEFAULT_TITLE_OBJ_PALETTE_BGR555) {
  return Array.from(words, (value, index) => colorFromBgr555(value, index === 0 ? 0 : 255));
}

function readBgr555Palette(rom: Uint8Array, offset: number, words: number) {
  const palette = new Uint16Array(words);
  for (let index = 0; index < words; index++) palette[index] = rom[offset + index * 2] | (rom[offset + index * 2 + 1] << 8);
  return palette;
}

export function readReshefTitlePalette(rom: Uint8Array) {
  if (!looksLikeReshefRom(rom)) throw new Error("هذا ليس ROM Reshef of Destruction (USA) مناسباً.");
  return readBgr555Palette(rom, TITLE_OBJ_PALETTE_OFFSET, TITLE_OBJ_PALETTE_WORDS);
}

export function readReshefTitleLogoPalette(rom: Uint8Array) {
  if (!looksLikeReshefRom(rom)) throw new Error("هذا ليس ROM Reshef of Destruction (USA) مناسباً.");
  return readBgr555Palette(rom, RESHEF_TITLE_LOGO.paletteOffset, 256);
}

function decompressGbaLz77(rom: Uint8Array, offset: number) {
  if (rom[offset] !== 0x10) throw new Error("مورد شعار Reshef لا يحمل رأس LZ77 المتوقع.");
  const size = rom[offset + 1] | (rom[offset + 2] << 8) | (rom[offset + 3] << 16);
  const output = new Uint8Array(size); let source = offset + 4; let destination = 0;
  while (destination < size) {
    const flags = rom[source++];
    for (let bit = 7; bit >= 0 && destination < size; bit--) {
      if (flags & (1 << bit)) {
        const first = rom[source++]; const second = rom[source++];
        const length = (first >>> 4) + 3; const displacement = ((first & 0x0f) << 8) | second;
        const copyAt = destination - displacement - 1;
        if (copyAt < 0) throw new Error("تيار LZ77 لشعار Reshef غير صالح.");
        for (let count = 0; count < length && destination < size; count++) output[destination++] = output[copyAt + count];
      } else output[destination++] = rom[source++];
    }
  }
  return output;
}

/** ضغط LZ77 حتمي لمورد الشعار، بنطاق بحث 4 KiB وآمن للتنفيذ داخل المتصفح. */
function compressGbaLz77(data: Uint8Array) {
  const output: number[] = [0x10, data.length & 0xff, (data.length >>> 8) & 0xff, (data.length >>> 16) & 0xff];
  const positions = new Map<number, number[]>();
  const keyAt = (position: number) => (data[position] << 16) | (data[position + 1] << 8) | data[position + 2];
  const addPosition = (position: number) => {
    if (position + 2 >= data.length) return;
    const key = keyAt(position); const entries = positions.get(key) ?? [];
    entries.push(position); if (entries.length > 96) entries.shift(); positions.set(key, entries);
  };
  let position = 0;
  while (position < data.length) {
    const flagIndex = output.length; output.push(0); let flags = 0;
    for (let bit = 7; bit >= 0 && position < data.length; bit--) {
      let bestLength = 0; let bestDistance = 0;
      if (position + 2 < data.length) {
        const candidates = positions.get(keyAt(position)) ?? [];
        for (let index = candidates.length - 1, attempts = 0; index >= 0 && attempts < 64; index--, attempts++) {
          const candidate = candidates[index]; const distance = position - candidate;
          if (distance > 0x1000) continue;
          let length = 3;
          while (length < 18 && position + length < data.length && data[candidate + length] === data[position + length]) length++;
          if (length > bestLength) { bestLength = length; bestDistance = distance; if (length === 18) break; }
        }
      }
      if (bestLength >= 3) {
        flags |= 1 << bit; output.push(((bestLength - 3) << 4) | ((bestDistance - 1) >>> 8), (bestDistance - 1) & 0xff);
        for (let count = 0; count < bestLength; count++) addPosition(position++);
      } else { output.push(data[position]); addPosition(position++); }
    }
    output[flagIndex] = flags;
  }
  return Uint8Array.from(output);
}

function rgbaPalette(words: Uint16Array) { return Array.from(words, (value) => colorFromBgr555(value)); }

function nearestPaletteIndex(r: number, g: number, b: number, palette: ReturnType<typeof rgbaPalette>) {
  let bestIndex = 0; let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < palette.length; index++) {
    const color = palette[index]; const distance = (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
  }
  return bestIndex;
}

export function decodeReshefTitleLogo(rom: Uint8Array): ReshefImagePixels {
  if (!looksLikeReshefRom(rom)) throw new Error("هذا ليس ROM Reshef of Destruction (USA) مناسباً.");
  const tiles = decompressGbaLz77(rom, RESHEF_TITLE_LOGO.tileOffset);
  if (tiles.length !== RESHEF_TITLE_LOGO.tileDecompressedBytes) throw new Error("حجم بلاطات شعار Reshef غير متوقع.");
  const palette = rgbaPalette(readReshefTitleLogoPalette(rom));
  const pixels = new Uint8ClampedArray(RESHEF_TITLE_LOGO.width * RESHEF_TITLE_LOGO.height * 4);
  for (let y = 0; y < RESHEF_TITLE_LOGO.height; y++) for (let x = 0; x < RESHEF_TITLE_LOGO.width; x++) {
    const mapIndex = Math.floor(y / 8) * RESHEF_TITLE_LOGO.widthTiles + Math.floor(x / 8);
    const entry = rom[RESHEF_TITLE_LOGO.mapOffset + mapIndex * 2] | (rom[RESHEF_TITLE_LOGO.mapOffset + mapIndex * 2 + 1] << 8);
    const tile = entry & 0x03ff; const pixelX = entry & 0x400 ? 7 - (x & 7) : x & 7; const pixelY = entry & 0x800 ? 7 - (y & 7) : y & 7;
    pixels.set(palette[tiles[tile * 64 + pixelY * 8 + pixelX]], (y * RESHEF_TITLE_LOGO.width + x) * 4);
  }
  return { width: RESHEF_TITLE_LOGO.width, height: RESHEF_TITLE_LOGO.height, pixels };
}

export function quantizeReshefTitleLogoPixels(rom: Uint8Array, replacement: Uint8ClampedArray) {
  const original = decodeReshefTitleLogo(rom);
  if (replacement.length !== original.pixels.length) throw new Error("أبعاد صورة شعار Reshef لا تطابق 240×160.");
  const palette = rgbaPalette(readReshefTitleLogoPalette(rom)); const result = original.pixels.slice();
  for (let offset = 0; offset < replacement.length; offset += 4) {
    if (replacement[offset + 3] < 96) continue;
    result.set(palette[nearestPaletteIndex(replacement[offset], replacement[offset + 1], replacement[offset + 2], palette)], offset);
  }
  return { width: original.width, height: original.height, pixels: result };
}

export function writeReshefTitleLogo(rom: Uint8Array, pixels: Uint8ClampedArray) {
  const original = decodeReshefTitleLogo(rom);
  if (pixels.length !== original.pixels.length) throw new Error("أبعاد صورة شعار Reshef لا تطابق 240×160.");
  const tileData = decompressGbaLz77(rom, RESHEF_TITLE_LOGO.tileOffset); const palette = rgbaPalette(readReshefTitleLogoPalette(rom));
  for (let y = 0; y < RESHEF_TITLE_LOGO.height; y++) for (let x = 0; x < RESHEF_TITLE_LOGO.width; x++) {
    const pixelOffset = (y * RESHEF_TITLE_LOGO.width + x) * 4;
    const mapIndex = Math.floor(y / 8) * RESHEF_TITLE_LOGO.widthTiles + Math.floor(x / 8);
    const entry = rom[RESHEF_TITLE_LOGO.mapOffset + mapIndex * 2] | (rom[RESHEF_TITLE_LOGO.mapOffset + mapIndex * 2 + 1] << 8);
    const tile = entry & 0x03ff; const pixelX = entry & 0x400 ? 7 - (x & 7) : x & 7; const pixelY = entry & 0x800 ? 7 - (y & 7) : y & 7;
    tileData[tile * 64 + pixelY * 8 + pixelX] = nearestPaletteIndex(pixels[pixelOffset], pixels[pixelOffset + 1], pixels[pixelOffset + 2], palette);
  }
  const compressed = compressGbaLz77(tileData);
  if (compressed.length > RESHEF_TITLE_LOGO.tileCompressedBytes) throw new Error(`تعديل الشعار يحتاج ${compressed.length} بايت، لكنه يتجاوز سعة المورد الأصلية ${RESHEF_TITLE_LOGO.tileCompressedBytes} بايت.`);
  rom.fill(0, RESHEF_TITLE_LOGO.tileOffset, RESHEF_TITLE_LOGO.tileOffset + RESHEF_TITLE_LOGO.tileCompressedBytes);
  rom.set(compressed, RESHEF_TITLE_LOGO.tileOffset);
}

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

export function decodeReshefImage(rom: Uint8Array, resourceId: string, paletteWords = readReshefTitlePalette(rom)): ReshefImagePixels {
  if (!looksLikeReshefRom(rom)) throw new Error("هذا ليس ROM Reshef of Destruction (USA) مناسباً.");
  const resource = getReshefImageResource(resourceId);
  const rgbaPalette = titleRgbaPalette(paletteWords);
  const pixels = new Uint8ClampedArray(resource.width * resource.height * 4);
  for (let y = 0; y < resource.height; y++) for (let x = 0; x < resource.width; x++) {
    const byte = rom[tileByteOffset(resource, x, y)];
    const index = (byte >>> (4 * ((x % 8) & 1))) & 0x0f;
    const rgba = rgbaPalette[index];
    pixels.set(rgba, (y * resource.width + x) * 4);
  }
  return { width: resource.width, height: resource.height, pixels };
}

function rgbDistance(left: Uint8ClampedArray, leftOffset: number, right: Uint8ClampedArray, rightOffset: number) {
  return Math.abs(left[leftOffset] - right[rightOffset])
    + Math.abs(left[leftOffset + 1] - right[rightOffset + 1])
    + Math.abs(left[leftOffset + 2] - right[rightOffset + 2]);
}

/**
 * Removes an opaque flat backdrop only when it is connected to the outside edge of the imported
 * image. This lets users upload an editor-flattened PNG/JPG-like background without accidentally
 * encoding it as a new title sprite background. Transparent pixels remain transparent.
 */
export function normalizeReshefReplacementPixels(resourceId: string, pixels: Uint8ClampedArray) {
  const resource = getReshefImageResource(resourceId);
  if (pixels.length !== resource.width * resource.height * 4) throw new Error("أبعاد صورة الاستبدال لا تطابق أبعاد مورد Reshef.");

  const normalized = pixels.slice();
  const width = resource.width; const height = resource.height;
  const corners = [0, width - 1, (height - 1) * width, width * height - 1];
  const backdropCorner = corners.find((pixel) => normalized[pixel * 4 + 3] >= 96);
  if (backdropCorner === undefined) return normalized;

  const backdropOffset = backdropCorner * 4;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const isBackdrop = (pixel: number) => {
    const offset = pixel * 4;
    return normalized[offset + 3] < 96 || rgbDistance(normalized, offset, normalized, backdropOffset) <= 30;
  };
  const addIfBackdrop = (pixel: number) => {
    if (!visited[pixel] && isBackdrop(pixel)) { visited[pixel] = 1; queue.push(pixel); }
  };

  for (let x = 0; x < width; x++) { addIfBackdrop(x); addIfBackdrop((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { addIfBackdrop(y * width); addIfBackdrop(y * width + width - 1); }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const pixel = queue[cursor]; const x = pixel % width; const y = Math.floor(pixel / width);
    normalized[pixel * 4 + 3] = 0;
    if (x > 0) addIfBackdrop(pixel - 1);
    if (x < width - 1) addIfBackdrop(pixel + 1);
    if (y > 0) addIfBackdrop(pixel - width);
    if (y < height - 1) addIfBackdrop(pixel + width);
  }
  return normalized;
}

function nearestTitlePaletteIndex(r: number, g: number, b: number, a: number, paletteWords: Uint16Array) {
  if (a < 96) return 0;
  const rgbaPalette = titleRgbaPalette(paletteWords);
  let bestIndex = 1; let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < rgbaPalette.length; index++) {
    const color = rgbaPalette[index];
    const distance = (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
  }
  return bestIndex;
}

export function quantizeReshefImagePixels(resourceId: string, pixels: Uint8ClampedArray, paletteWords: Uint16Array) {
  const resource = getReshefImageResource(resourceId);
  if (pixels.length !== resource.width * resource.height * 4) throw new Error("أبعاد صورة الاستبدال لا تطابق أبعاد مورد Reshef.");
  const rgbaPalette = titleRgbaPalette(paletteWords);
  const quantized = new Uint8ClampedArray(pixels.length);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const index = nearestTitlePaletteIndex(pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3], paletteWords);
    quantized.set(rgbaPalette[index], offset);
  }
  return quantized;
}

/** Writes a 64×16 RGBA replacement using the chosen title palette and raw tile layout. */
export function writeReshefImage(rom: Uint8Array, resourceId: string, pixels: Uint8ClampedArray, paletteWords = readReshefTitlePalette(rom)) {
  const resource = getReshefImageResource(resourceId);
  if (pixels.length !== resource.width * resource.height * 4) throw new Error("أبعاد صورة الاستبدال لا تطابق أبعاد مورد Reshef.");
  for (let y = 0; y < resource.height; y++) for (let x = 0; x < resource.width; x++) {
    const pixelOffset = (y * resource.width + x) * 4;
    const index = nearestTitlePaletteIndex(pixels[pixelOffset], pixels[pixelOffset + 1], pixels[pixelOffset + 2], pixels[pixelOffset + 3], paletteWords);
    const byteOffset = tileByteOffset(resource, x, y);
    const shift = 4 * ((x % 8) & 1);
    rom[byteOffset] = (rom[byteOffset] & ~(0x0f << shift)) | (index << shift);
  }
}

export function writeReshefTitlePalette(rom: Uint8Array, resourceId: string, paletteWords: Uint16Array) {
  getReshefImageResource(resourceId);
  if (paletteWords.length !== TITLE_OBJ_PALETTE_WORDS) throw new Error("لوحة ألوان NEW GAME يجب أن تحتوي 16 لوناً.");
  if (paletteWords[0] !== 0) throw new Error("اللون 0 محجوز للشفافية ولا يمكن تغييره.");
  for (let index = 0; index < TITLE_OBJ_PALETTE_WORDS; index++) {
    const value = paletteWords[index];
    rom[TITLE_OBJ_PALETTE_OFFSET + index * 2] = value & 0xff;
    rom[TITLE_OBJ_PALETTE_OFFSET + index * 2 + 1] = value >>> 8;
  }
}

export function buildReshefImagesRom(source: Uint8Array, edits: ReshefImageEdits, paletteEdits: ReshefPaletteEdits = {}, titleLogoEdit?: Uint8ClampedArray) {
  if (!looksLikeReshefRom(source)) throw new Error("هذا ليس ROM Reshef of Destruction (USA) مناسباً.");
  const changedImages = Object.entries(edits).filter(([, pixels]) => Boolean(pixels));
  const changedPalettes = Object.entries(paletteEdits).filter(([, words]) => Boolean(words));
  if (!changedImages.length && !changedPalettes.length && !titleLogoEdit) throw new Error("لا توجد صور أو لوحات ألوان معدلة لبنائها.");
  const rom = source.slice();
  const palettes = new Map<ReshefImageResource["id"], Uint16Array>();
  for (const resource of RESHEF_IMAGE_RESOURCES) {
    const replacement = paletteEdits[resource.id];
    const palette = replacement ? replacement.slice() : readReshefTitlePalette(source);
    if (replacement) writeReshefTitlePalette(rom, resource.id, palette);
    palettes.set(resource.id, palette);
  }
  for (const [id, pixels] of changedImages) writeReshefImage(rom, id, pixels!, palettes.get(id as ReshefImageResource["id"]));
  if (titleLogoEdit) writeReshefTitleLogo(rom, titleLogoEdit);
  return { rom, changed: [...new Set([...changedImages, ...changedPalettes].map(([id]) => id).concat(titleLogoEdit ? [RESHEF_TITLE_LOGO.id] : []))] };
}

export function titlePaletteCss(index: number, paletteWords: Uint16Array | readonly number[] = DEFAULT_TITLE_OBJ_PALETTE_BGR555) {
  const [r, g, b, a] = titleRgbaPalette(paletteWords)[index];
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a / 255})`;
}
