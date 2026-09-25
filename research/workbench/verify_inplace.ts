import { readFileSync, writeFileSync } from "fs";
import { patchTitleLogoArchive, LOGO_WIDTH, LOGO_HEIGHT } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/pipeline.ts";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";

const original = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/0761e26f-zelda2_mag.gar.lzs");
const data = new Uint8Array(original.buffer, original.byteOffset, original.byteLength);
console.log("original archive size:", data.length);

const w = LOGO_WIDTH, h = LOGO_HEIGHT;
const logoRgba = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const inLetter = ((x + y) % 40) < 20;
    logoRgba[i] = inLetter ? 255 : 0;
    logoRgba[i + 1] = 215;
    logoRgba[i + 2] = 0;
    logoRgba[i + 3] = inLetter ? 255 : 0;
  }
}

console.time("patch");
const patched = patchTitleLogoArchive(data, logoRgba);
console.timeEnd("patch");
console.log("patched archive size:", patched.length, "(original:", data.length, ")");

// Decompress both and diff the raw CMB bytes to see EXACTLY how much changed.
const origGar = decompressGrezzoLzs(data);
const origFiles = parseGar(origGar);
const origCmb = origFiles.find((f) => f.typeName === "cmb")!.data;

const patchedGar = decompressGrezzoLzs(patched);
console.log("decompressed GAR size: orig=", origGar.length, "patched=", patchedGar.length, "(should be EXACTLY equal)");
const patchedFiles = parseGar(patchedGar);
const patchedCmb = patchedFiles.find((f) => f.typeName === "cmb")!.data;
console.log("CMB size: orig=", origCmb.length, "patched=", patchedCmb.length, "(should be EXACTLY equal)");

let diffCount = 0;
let firstDiff = -1, lastDiff = -1;
const minLen = Math.min(origCmb.length, patchedCmb.length);
for (let i = 0; i < minLen; i++) {
  if (origCmb[i] !== patchedCmb[i]) {
    diffCount++;
    if (firstDiff < 0) firstDiff = i;
    lastDiff = i;
  }
}
console.log("total differing bytes:", diffCount, "out of", minLen, `(${((diffCount / minLen) * 100).toFixed(2)}%)`);
console.log("first differing byte offset:", firstDiff, "last:", lastDiff);

writeFileSync(
  "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/patched_inplace_zelda2_mag.gar.lzs",
  patched
);
console.log("\nOK: no exceptions, file written.");
