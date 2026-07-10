/**
 * Minimal, canvas-free PNG decoder for 8-bit non-interlaced RGB/RGBA images.
 *
 * Why this exists: importing a PNG via `<img>` + `ctx.drawImage()` +
 * `ctx.getImageData()` (the standard browser approach) round-trips every
 * pixel through Canvas2D's internal premultiplied-alpha backing store —
 * confirmed (via real browser testing, and again via a real corrupted game
 * asset) to corrupt semi-transparent/antialiased edge pixels, eroding soft
 * alpha falloff into ragged, partially-transparent-turned-fully-transparent
 * edges. This decoder reads the PNG's own compressed pixel data directly, so
 * a re-imported PNG's bytes decode to *exactly* what was encoded — no
 * canvas, no premultiply/unpremultiply rounding.
 *
 * Deliberately narrow scope: only 8-bit-depth, non-interlaced, RGB (color
 * type 2) or RGBA (color type 6) — the PNG variant every modern image editor
 * and our own "تنزيل PNG" export produce. Anything else (16-bit, palette,
 * grayscale, interlaced) returns `null` so the caller can fall back to the
 * canvas-based path, which is perfectly fine for those less common inputs.
 */

export interface DecodedPng {
  width: number;
  height: number;
  /** width*height*4 bytes, RGBA, straight (non-premultiplied) alpha. */
  rgba: Uint8ClampedArray;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface Chunk {
  type: string;
  data: Uint8Array;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  return true;
}

function parseChunks(bytes: Uint8Array): Chunk[] {
  const chunks: Chunk[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8;
  while (p + 8 <= bytes.length) {
    const length = view.getUint32(p, false);
    const type = new TextDecoder("ascii").decode(bytes.subarray(p + 4, p + 8));
    const dataStart = p + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break; // truncated — stop, caller treats as unsupported
    chunks.push({ type, data: bytes.subarray(dataStart, dataEnd) });
    p = dataEnd + 4; // skip CRC
    if (type === "IEND") break;
  }
  return chunks;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const ds = new DecompressionStream("deflate"); // "deflate" == zlib-wrapped, matches PNG's IDAT format.
    // A manual ReadableStream (rather than Blob.stream()) — some environments'
    // Blob polyfills (e.g. jsdom, used by this project's test suite) don't
    // implement .stream(), but ReadableStream + DecompressionStream both work.
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
    const stream = readable.pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Reverses PNG's per-scanline filtering (spec §9.2) to recover raw pixel bytes. */
function unfilterScanlines(inflated: Uint8Array, width: number, height: number, bpp: number): Uint8Array | null {
  const stride = width * bpp;
  const rowBytes = stride + 1; // +1 filter-type byte per row
  if (inflated.length < rowBytes * height) return null;
  const out = new Uint8Array(stride * height);
  let prevRowOff = -1; // -1 means "no previous row" (treated as all-zero)

  for (let y = 0; y < height; y++) {
    const filterType = inflated[y * rowBytes];
    const srcOff = y * rowBytes + 1;
    const dstOff = y * stride;
    for (let x = 0; x < stride; x++) {
      const raw = inflated[srcOff + x];
      const a = x >= bpp ? out[dstOff + x - bpp] : 0;
      const b = prevRowOff >= 0 ? out[prevRowOff + x] : 0;
      const c = (prevRowOff >= 0 && x >= bpp) ? out[prevRowOff + x - bpp] : 0;
      let recon: number;
      switch (filterType) {
        case 0: recon = raw; break;
        case 1: recon = raw + a; break;
        case 2: recon = raw + b; break;
        case 3: recon = raw + Math.floor((a + b) / 2); break;
        case 4: recon = raw + paethPredictor(a, b, c); break;
        default: return null; // unknown filter type — malformed or unsupported.
      }
      out[dstOff + x] = recon & 0xff;
    }
    prevRowOff = dstOff;
  }
  return out;
}

/** Decodes a PNG directly from its compressed bytes. Returns `null` (not a throw)
 * for anything outside the supported 8-bit RGB/RGBA non-interlaced subset, so the
 * caller can fall back to the canvas-based decode path. */
export async function decodePngRawNoCanvas(bytes: Uint8Array): Promise<DecodedPng | null> {
  try {
    if (!hasPngSignature(bytes)) return null;
    const chunks = parseChunks(bytes);
    const ihdr = chunks.find((c) => c.type === "IHDR");
    if (!ihdr || ihdr.data.length < 13) return null;

    const ihdrView = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
    const width = ihdrView.getUint32(0, false);
    const height = ihdrView.getUint32(4, false);
    const bitDepth = ihdr.data[8];
    const colorType = ihdr.data[9];
    const interlaceMethod = ihdr.data[12];
    if (width <= 0 || height <= 0) return null;
    if (bitDepth !== 8) return null;
    if (interlaceMethod !== 0) return null;
    if (colorType !== 2 && colorType !== 6) return null; // only truecolor / truecolor+alpha
    const channels = colorType === 6 ? 4 : 3;

    const idatData = chunks.filter((c) => c.type === "IDAT").map((c) => c.data);
    if (idatData.length === 0) return null;
    const compressed = concatBytes(idatData);

    const inflated = await inflateZlib(compressed);
    if (!inflated) return null;

    const raw = unfilterScanlines(inflated, width, height, channels);
    if (!raw) return null;

    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const so = i * channels;
      const doo = i * 4;
      rgba[doo] = raw[so];
      rgba[doo + 1] = raw[so + 1];
      rgba[doo + 2] = raw[so + 2];
      rgba[doo + 3] = channels === 4 ? raw[so + 3] : 255;
    }
    return { width, height, rgba };
  } catch {
    return null;
  }
}
