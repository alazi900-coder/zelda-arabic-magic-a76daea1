import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { deflateSync } from "zlib";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const OUT_DIR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/textures_png";
mkdirSync(OUT_DIR, { recursive: true });

// ---- minimal PNG encoder (8-bit RGBA, no filtering) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  const crcInput = out.slice(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return out;
}
function encodePng(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = new Uint8Array(13);
  const iv = new DataView(ihdrData.buffer);
  iv.setUint32(0, width, false);
  iv.setUint32(4, height, false);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk("IHDR", ihdrData);

  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idatData = deflateSync(Buffer.from(raw));
  const idat = chunk("IDAT", idatData);
  const iend = chunk("IEND", new Uint8Array(0));

  const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
  out.set(sig, 0);
  out.set(ihdr, sig.length);
  out.set(idat, sig.length + ihdr.length);
  out.set(iend, sig.length + ihdr.length + idat.length);
  return out;
}

// ---- RGB565 tiled decode (Grezzo/PICA200), ported from noclip.website's
// decodeTexture_RGB565 + decodeTexture_Tiled (MIT), same Morton order this
// session's own encodeRgba8Tiled/decodeRgba8Tiled already use for RGBA8 ----
function morton7(n: number): number {
  return ((n >>> 2) & 0x04) | ((n >>> 1) & 0x02) | (n & 0x01);
}
function expand5to8(n: number): number {
  return (n << 3) | (n >>> 2);
}
function expand6to8(n: number): number {
  return (n << 2) | (n >>> 4);
}
function decodeRgb565Tiled(width: number, height: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let srcOffs = 0;
  for (let yy = 0; yy < height; yy += 8) {
    for (let xx = 0; xx < width; xx += 8) {
      for (let i = 0; i < 0x40; i++) {
        const x = morton7(i);
        const y = morton7(i >>> 1);
        const dstOffs = ((yy + y) * width + (xx + x)) * 4;
        const p = view.getUint16(srcOffs, true);
        out[dstOffs + 0] = expand5to8((p >>> 11) & 0x1f);
        out[dstOffs + 1] = expand6to8((p >>> 5) & 0x3f);
        out[dstOffs + 2] = expand5to8(p & 0x1f);
        out[dstOffs + 3] = 0xff;
        srcOffs += 2;
      }
    }
  }
  return out;
}

// L8 (luminance-only, 1 byte/pixel) decode, same tiling.
function decodeL8Tiled(width: number, height: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  let srcOffs = 0;
  for (let yy = 0; yy < height; yy += 8) {
    for (let xx = 0; xx < width; xx += 8) {
      for (let i = 0; i < 0x40; i++) {
        const x = morton7(i);
        const y = morton7(i >>> 1);
        const dstOffs = ((yy + y) * width + (xx + x)) * 4;
        const v = data[srcOffs];
        out[dstOffs + 0] = v;
        out[dstOffs + 1] = v;
        out[dstOffs + 2] = v;
        out[dstOffs + 3] = 0xff;
        srcOffs += 1;
      }
    }
  }
  return out;
}

const buf = readFileSync("/tmp/title_logo.cmb");
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const cmb = parseCmb(data);

console.log("textures found:", cmb.textures.map((t) => `${t.name} ${t.width}x${t.height} fmt=0x${t.glFormat.toString(16)}`));

for (const t of cmb.textures) {
  let rgba: Uint8Array;
  if (t.glFormat === 0x83636754) {
    rgba = decodeRgb565Tiled(t.width, t.height, t.pixels);
  } else if (t.glFormat === 0x14016757) {
    rgba = decodeL8Tiled(t.width, t.height, t.pixels);
  } else {
    console.log(`skipping ${t.name}: format 0x${t.glFormat.toString(16)} not decoded by this script`);
    continue;
  }
  const png = encodePng(t.width, t.height, rgba);
  const path = `${OUT_DIR}/${t.name}.png`;
  writeFileSync(path, png);
  console.log("wrote", path);
}
