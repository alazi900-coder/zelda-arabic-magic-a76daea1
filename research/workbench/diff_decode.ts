import { readFileSync } from "fs";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";
import { decodeRgba8Tiled } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/pica-texture.ts";

// Path A: decode title_ar directly from the archive (tested code, no PNG round-trip)
const archive = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/2dad0344-zelda2_mag-arabic-logo.gar.lzs");
const archiveData = new Uint8Array(archive.buffer, archive.byteOffset, archive.byteLength);
const files = parseGar(decompressGrezzoLzs(archiveData));
const cmb = parseCmb(files.find(f => f.typeName === "cmb")!.data);
const titleAr = cmb.textures.find(t => t.name === "title_ar")!;
const rgbaDirect = decodeRgba8Tiled(titleAr.width, titleAr.height, titleAr.pixels);

// Path B: my hand-rolled PNG decoder on the PNG I exported earlier
import { inflateSync } from "zlib";
function readPng(path: string) {
  const buf = readFileSync(path);
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === "IDAT") idatChunks.push(data);
    else if (type === "IEND") break;
    offset += 8 + len + 4;
  }
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * 4;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let prevRow = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const rowData = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? row[x - 4] : 0;
      const b = prevRow[x];
      const c = x >= 4 ? prevRow[x - 4] : 0;
      let pred = 0;
      if (filterType === 0) pred = 0;
      else if (filterType === 1) pred = a;
      else if (filterType === 2) pred = b;
      else if (filterType === 3) pred = Math.floor((a + b) / 2);
      else if (filterType === 4) { const p = a+b-c; const pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c); pred = pa<=pb&&pa<=pc?a:pb<=pc?b:c; }
      row[x] = (rowData[x] + pred) & 0xff;
    }
    rgba.set(row, y * stride);
    prevRow = row;
  }
  return { width, height, rgba };
}
const pngResult = readPng("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/user_patched_title_ar.png");

console.log("dims: direct", titleAr.width, titleAr.height, "png", pngResult.width, pngResult.height);
let diffCount = 0, firstDiff = -1;
for (let i = 0; i < rgbaDirect.length; i++) {
  if (rgbaDirect[i] !== pngResult.rgba[i]) { diffCount++; if (firstDiff < 0) firstDiff = i; }
}
console.log("differing bytes:", diffCount, "/", rgbaDirect.length, "first at", firstDiff);
// sample a background (should-be-transparent) pixel, e.g. corner (0,0)
console.log("corner pixel direct (R,G,B,A):", rgbaDirect[0], rgbaDirect[1], rgbaDirect[2], rgbaDirect[3]);
console.log("corner pixel via PNG decode (R,G,B,A):", pngResult.rgba[0], pngResult.rgba[1], pngResult.rgba[2], pngResult.rgba[3]);
// sample middle of a "background" area, say (10,10)
const idx = (10*256+10)*4;
console.log("(10,10) direct:", rgbaDirect[idx],rgbaDirect[idx+1],rgbaDirect[idx+2],rgbaDirect[idx+3]);
console.log("(10,10) png:   ", pngResult.rgba[idx],pngResult.rgba[idx+1],pngResult.rgba[idx+2],pngResult.rgba[idx+3]);

console.log("\n=== sampling alpha across the image (is semi-transparency widespread?) ===");
let histogram: Record<string, number> = {};
for (let y = 0; y < titleAr.height; y += 4) {
  for (let x = 0; x < titleAr.width; x += 4) {
    const i = (y * titleAr.width + x) * 4;
    const a = rgbaDirect[i+3];
    const bucket = a === 0 ? "0 (fully transparent)" : a === 255 ? "255 (fully opaque)" : "1-254 (semi-transparent)";
    histogram[bucket] = (histogram[bucket] || 0) + 1;
  }
}
console.log(histogram);

console.log("\nsample semi-transparent pixel RGB values (should reveal if there's a consistent 'noise' color):");
let shown = 0;
for (let y = 0; y < titleAr.height && shown < 15; y++) {
  for (let x = 0; x < titleAr.width && shown < 15; x++) {
    const i = (y * titleAr.width + x) * 4;
    const a = rgbaDirect[i+3];
    if (a > 0 && a < 255) {
      console.log(`(${x},${y}): R=${rgbaDirect[i]} G=${rgbaDirect[i+1]} B=${rgbaDirect[i+2]} A=${a}`);
      shown++;
    }
  }
}
