/**
 * Minimal, canvas-free PNG encoder for 8-bit RGBA pixel buffers.
 *
 * Why this exists: exporting a decoded DDS to PNG via `ctx.putImageData()` +
 * `canvas.toDataURL()` was confirmed (real browser test, real game DDS) to
 * silently zero out the RGB channels of every fully-transparent pixel —
 * Chrome's canvas backing store is premultiplied internally, and premultiplied
 * RGB at alpha=0 is mathematically 0 regardless of the source's straight RGB,
 * so it can't be recovered on toDataURL's read-back. Those pixels are
 * invisible on their own, but many of these UI atlases intentionally keep a
 * "safe" border color in transparent pixels next to visible edges specifically
 * so GPU bilinear texture filtering blends toward that color instead of black
 * — zeroing it out reintroduces exactly the black-fringe artifact the border
 * color was there to prevent. This encoder writes the RGBA bytes directly, so
 * the exported PNG preserves the original's transparent-pixel RGB exactly.
 *
 * Deliberately narrow scope: emits a single-IDAT, filter-type-0 ("None" on
 * every scanline), color-type-6 (RGBA), 8-bit, non-interlaced PNG — a fully
 * spec-valid file every reader accepts, just not size-optimized (no adaptive
 * filtering). File size doesn't matter here; byte-for-byte pixel fidelity does.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  out.set(u32be(data.length), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(u32be(crc32(crcInput)), 8 + data.length);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function deflateZlib(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const cs = new CompressionStream("deflate"); // "deflate" == zlib-wrapped, matches PNG's IDAT format.
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
    const stream = readable.pipeThrough(cs as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/** Encodes an RGBA buffer (width*height*4 bytes, straight alpha) into a
 * complete PNG file. Returns `null` only if the environment lacks
 * `CompressionStream` — callers should fall back to the canvas-based
 * `toDataURL()` path in that case. */
export async function encodePngRawNoCanvas(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): Promise<Uint8Array | null> {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: truecolor + alpha
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method: none

  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 = None
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  const idatData = await deflateZlib(raw);
  if (!idatData) return null;

  return concatBytes([
    signature,
    buildChunk("IHDR", ihdrData),
    buildChunk("IDAT", idatData),
    buildChunk("IEND", new Uint8Array(0)),
  ]);
}
