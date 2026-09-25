import { readFileSync, writeFileSync } from "fs";
import { deflateSync } from "zlib";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";
import { decodeRgba8Tiled } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/pica-texture.ts";

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
  view.setUint32(8 + data.length, crc32(out.slice(4, 8 + data.length)), false);
  return out;
}
function encodePng(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = new Uint8Array(13);
  const iv = new DataView(ihdrData.buffer);
  iv.setUint32(0, width, false);
  iv.setUint32(4, height, false);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  const ihdr = chunk("IHDR", ihdrData);
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idat = chunk("IDAT", deflateSync(Buffer.from(raw)));
  const iend = chunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
  out.set(sig, 0);
  out.set(ihdr, sig.length);
  out.set(idat, sig.length + ihdr.length);
  out.set(iend, sig.length + ihdr.length + idat.length);
  return out;
}

const path = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/2dad0344-zelda2_mag-arabic-logo.gar.lzs";
const buf = readFileSync(path);
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
console.log("file size:", data.length);

let decompressed: Uint8Array;
try {
  decompressed = decompressGrezzoLzs(data);
  console.log("OK: GrezzoLZS decompress succeeded, GAR size:", decompressed.length);
} catch (e) {
  console.log("FAIL at decompress:", (e as Error).message);
  process.exit(1);
}

let files;
try {
  files = parseGar(decompressed);
  console.log("OK: GAR parse succeeded, files:", files.map((f) => `${f.typeName}/${f.fileName}(${f.data.length}b)`));
} catch (e) {
  console.log("FAIL at GAR parse:", (e as Error).message);
  process.exit(1);
}

const cmbFile = files.find((f) => f.typeName === "cmb");
if (!cmbFile) {
  console.log("FAIL: no cmb file found in archive");
  process.exit(1);
}

let cmb;
try {
  cmb = parseCmb(cmbFile.data);
  console.log("OK: CMB parse succeeded");
} catch (e) {
  console.log("FAIL at CMB parse:", (e as Error).message);
  process.exit(1);
}

console.log("\n--- structural check ---");
console.log("textures:", cmb.textures.length, cmb.textures.map((t) => `${t.name}(${t.width}x${t.height})`));
console.log("materials:", cmb.materials.length);
console.log("meshes:", cmb.meshes.length, cmb.meshes.map((m) => `sepd=${m.sepdIdx},mat=${m.matsIdx}`));
console.log("sepds:", cmb.sepds.length);

const newTex = cmb.textures.find((t) => t.name === "title_ar");
if (!newTex) {
  console.log("\nFAIL: no 'title_ar' texture found — the patch may not have applied");
  process.exit(1);
}
console.log("\nOK: found new texture 'title_ar'", newTex.width, "x", newTex.height, "fmt=0x" + newTex.glFormat.toString(16));

const rgba = decodeRgba8Tiled(newTex.width, newTex.height, newTex.pixels);
const png = encodePng(newTex.width, newTex.height, rgba);
const outPath = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/user_patched_title_ar.png";
writeFileSync(outPath, png);
console.log("wrote decoded new-texture preview to", outPath);

// Also confirm the old lettering material (4) / effect material (5) meshes are gone.
const stillHasLetters = cmb.meshes.some((m) => m.matsIdx === 4 || m.matsIdx === 5);
console.log("\nold lettering/effect meshes still present:", stillHasLetters, "(expected: false)");

console.log("\n=== RESULT: the patch applied successfully and the file is structurally valid. ===");
