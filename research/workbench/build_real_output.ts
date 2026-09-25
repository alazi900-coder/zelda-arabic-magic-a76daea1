import { readFileSync, writeFileSync } from "fs";
import { patchTitleLogoArchive, LOGO_WIDTH, LOGO_HEIGHT } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/pipeline.ts";

// Decode the user's logo PNG (extracted earlier from their first attempt's title_ar texture) via a tiny PNG decoder.
// Node has no built-in PNG decode; use a minimal approach: read via the 'zlib' inflate + manual PNG parsing.
import { inflateSync } from "zlib";

function readPng(path: string): { width: number; height: number; rgba: Uint8ClampedArray } {
  const buf = readFileSync(path);
  let offset = 8; // skip signature
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 8 + len + 4;
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`صيغة PNG غير مدعومة هنا (bitDepth=${bitDepth}, colorType=${colorType}) — متوقَّع 8-bit RGBA`);
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
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = (rowData[x] + pred) & 0xff;
    }
    rgba.set(row, y * stride);
    prevRow = row;
  }
  return { width, height, rgba };
}

const logoPath = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/user_patched_title_ar.png";
const { width, height, rgba } = readPng(logoPath);
console.log("decoded user logo:", width, "x", height);
if (width !== LOGO_WIDTH || height !== LOGO_HEIGHT) throw new Error("logo size mismatch");

const archivePath = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/0761e26f-zelda2_mag.gar.lzs";
const archive = new Uint8Array(readFileSync(archivePath).buffer);

const patched = patchTitleLogoArchive(archive, rgba);
console.log("patched size:", patched.length);

const outPath = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/zelda2_mag-arabic-logo-v2.gar.lzs";
writeFileSync(outPath, patched);
console.log("wrote", outPath);
