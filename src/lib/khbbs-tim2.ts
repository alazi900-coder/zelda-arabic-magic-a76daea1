/**
 * Kingdom Hearts BBS TIM2 image contract.
 * Preserve every container/header/palette byte and alter only 8bpp index data
 * for the selected picture. The supported game resources are TIM2 indexed 8bpp
 * assets with a 256-color PS2 CLUT.
 */

export interface Tim2Picture {
  index: number;
  offset: number;
  totalSize: number;
  clutSize: number;
  imageSize: number;
  headerSize: number;
  clutColors: number;
  pictureFormat: number;
  mipMapCount: number;
  clutType: number;
  imageType: number;
  width: number;
  height: number;
  imageOffset: number;
  paletteOffset: number;
  indices: Uint8Array;
  rgba: Uint8ClampedArray;
  paletteRgba: Uint8ClampedArray;
}

export interface Tim2Asset {
  raw: Uint8Array;
  version: number;
  formatId: number;
  pictures: Tim2Picture[];
}

export interface ReplaceTim2Options {
  preserveOriginalAlpha?: boolean;
  region?: { x: number; y: number; width: number; height: number };
  clearRegionBeforeComposite?: boolean;
}

function ps2WordToRgba(word: number): [number, number, number, number] {
  return [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, Math.min(255, ((word >>> 24) & 0xff) * 2)];
}

function clampRegion(region: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const x = Math.max(0, Math.min(width - 1, Math.floor(region.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(region.y)));
  const right = Math.max(x + 1, Math.min(width, Math.floor(region.x + region.width)));
  const bottom = Math.max(y + 1, Math.min(height, Math.floor(region.y + region.height)));
  return { x, y, width: right - x, height: bottom - y };
}

export function parseTim2(buffer: ArrayBuffer): Tim2Asset {
  const raw = new Uint8Array(buffer.slice(0));
  if (raw.length < 64 || String.fromCharCode(...raw.subarray(0, 4)) !== "TIM2") {
    throw new Error("الملف ليس بصيغة TIM2 صالحة.");
  }

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const pictureCount = view.getUint16(6, true);
  const pictures: Tim2Picture[] = [];
  let offset = 16;

  for (let index = 0; index < pictureCount; index += 1) {
    if (offset + 48 > raw.length) throw new Error(`ترويسة TIM2 للصورة ${index + 1} غير مكتملة.`);
    const totalSize = view.getUint32(offset, true);
    const clutSize = view.getUint32(offset + 4, true);
    const imageSize = view.getUint32(offset + 8, true);
    const headerSize = view.getUint16(offset + 12, true);
    const clutColors = view.getUint16(offset + 14, true);
    const pictureFormat = raw[offset + 16];
    const mipMapCount = raw[offset + 17];
    const clutType = raw[offset + 18];
    const imageType = raw[offset + 19];
    const width = view.getUint16(offset + 20, true);
    const height = view.getUint16(offset + 22, true);
    const imageOffset = offset + headerSize;
    const paletteOffset = imageOffset + imageSize;

    if (!totalSize || offset + totalSize > raw.length || !width || !height || imageOffset + imageSize > raw.length || paletteOffset + clutSize > raw.length) {
      throw new Error(`بنية صورة TIM2 رقم ${index + 1} غير صالحة.`);
    }
    if (imageType !== 5 || imageSize !== width * height || clutColors !== 256 || clutSize < 1024) {
      throw new Error(`الصورة رقم ${index + 1} ليست مورد TIM2 مفهرس 8bpp بلوحة 256 لوناً مدعوماً.`);
    }

    const paletteRgba = new Uint8ClampedArray(clutColors * 4);
    for (let paletteIndex = 0; paletteIndex < clutColors; paletteIndex += 1) {
      const [r, g, b, a] = ps2WordToRgba(view.getUint32(paletteOffset + paletteIndex * 4, true));
      const dest = paletteIndex * 4;
      paletteRgba[dest] = r;
      paletteRgba[dest + 1] = g;
      paletteRgba[dest + 2] = b;
      paletteRgba[dest + 3] = a;
    }
    const indices = raw.slice(imageOffset, imageOffset + imageSize);
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < indices.length; pixel += 1) {
      const source = indices[pixel] * 4;
      const target = pixel * 4;
      rgba[target] = paletteRgba[source];
      rgba[target + 1] = paletteRgba[source + 1];
      rgba[target + 2] = paletteRgba[source + 2];
      rgba[target + 3] = paletteRgba[source + 3];
    }
    pictures.push({ index, offset, totalSize, clutSize, imageSize, headerSize, clutColors, pictureFormat, mipMapCount, clutType, imageType, width, height, imageOffset, paletteOffset, indices, rgba, paletteRgba });
    offset += totalSize;
  }

  if (pictures.length === 0) throw new Error("ملف TIM2 لا يحتوي صوراً قابلة للقراءة.");
  return { raw, version: raw[4], formatId: raw[5], pictures };
}

export function scaleRgbaStretch(source: Uint8ClampedArray, sourceWidth: number, sourceHeight: number, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(sourceHeight - 1, Math.floor((y / height) * sourceHeight));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(sourceWidth - 1, Math.floor((x / width) * sourceWidth));
      const from = (sy * sourceWidth + sx) * 4;
      const to = (y * width + x) * 4;
      out[to] = source[from]; out[to + 1] = source[from + 1]; out[to + 2] = source[from + 2]; out[to + 3] = source[from + 3];
    }
  }
  return out;
}

function nearestPaletteIndex(rgba: Uint8ClampedArray, palette: Uint8ClampedArray, cache: Map<number, number>): number {
  const key = ((rgba[0] << 24) | (rgba[1] << 16) | (rgba[2] << 8) | rgba[3]) >>> 0;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < palette.length / 4; index += 1) {
    const p = index * 4;
    const dr = rgba[0] - palette[p];
    const dg = rgba[1] - palette[p + 1];
    const db = rgba[2] - palette[p + 2];
    const da = rgba[3] - palette[p + 3];
    const distance = dr * dr + dg * dg + db * db + da * da * 2;
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
  }
  cache.set(key, bestIndex);
  return bestIndex;
}

function transparentPaletteIndex(palette: Uint8ClampedArray): number {
  for (let index = 0; index < palette.length / 4; index += 1) if (palette[index * 4 + 3] === 0) return index;
  return 0;
}

/** Rebuilds an existing TIM2 file, preserving all original bytes except image indices. */
export function replaceTim2Rgba(asset: Tim2Asset, pictureIndex: number, importedRgba: Uint8ClampedArray, importedWidth: number, importedHeight: number, options: ReplaceTim2Options = {}): Uint8Array {
  const picture = asset.pictures[pictureIndex];
  if (!picture) throw new Error("الصورة المطلوبة غير موجودة داخل TIM2.");
  const output = asset.raw.slice();
  const target = new Uint8ClampedArray(picture.rgba);
  const region = options.region ? clampRegion(options.region, picture.width, picture.height) : { x: 0, y: 0, width: picture.width, height: picture.height };
  const scaled = scaleRgbaStretch(importedRgba, importedWidth, importedHeight, region.width, region.height);
  const transparentIndex = transparentPaletteIndex(picture.paletteRgba);

  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const source = (y * region.width + x) * 4;
      const destination = ((region.y + y) * picture.width + region.x + x) * 4;
      if (options.clearRegionBeforeComposite && scaled[source + 3] === 0) {
        target[destination] = picture.paletteRgba[transparentIndex * 4];
        target[destination + 1] = picture.paletteRgba[transparentIndex * 4 + 1];
        target[destination + 2] = picture.paletteRgba[transparentIndex * 4 + 2];
        target[destination + 3] = picture.paletteRgba[transparentIndex * 4 + 3];
      }
      if (scaled[source + 3] > 0) {
        target[destination] = scaled[source]; target[destination + 1] = scaled[source + 1]; target[destination + 2] = scaled[source + 2];
        target[destination + 3] = options.preserveOriginalAlpha ? picture.rgba[destination + 3] : scaled[source + 3];
      }
    }
  }

  const cache = new Map<number, number>();
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const pixel = (region.y + y) * picture.width + region.x + x;
      const source = target.subarray(pixel * 4, pixel * 4 + 4);
      output[picture.imageOffset + pixel] = nearestPaletteIndex(source, picture.paletteRgba, cache);
    }
  }
  return output;
}

export function cropTim2Rgba(picture: Tim2Picture, region: { x: number; y: number; width: number; height: number }) {
  const safe = clampRegion(region, picture.width, picture.height);
  const rgba = new Uint8ClampedArray(safe.width * safe.height * 4);
  for (let y = 0; y < safe.height; y += 1) {
    const source = ((safe.y + y) * picture.width + safe.x) * 4;
    rgba.set(picture.rgba.subarray(source, source + safe.width * 4), y * safe.width * 4);
  }
  return { ...safe, rgba };
}
