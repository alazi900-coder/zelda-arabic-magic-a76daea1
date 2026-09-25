import { readFileSync, writeFileSync } from "fs";
import { patchTitleLogoArchive, LOGO_WIDTH, LOGO_HEIGHT } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/pipeline.ts";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const original = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/0761e26f-zelda2_mag.gar.lzs");
const data = new Uint8Array(original.buffer, original.byteOffset, original.byteLength);
console.log("original archive size:", data.length);

const w = LOGO_WIDTH, h = LOGO_HEIGHT;
const logoRgba = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const inLetter = ((x + y) % 40) < 20; // arbitrary pattern, just needs to be non-uniform
    logoRgba[i] = inLetter ? 255 : 0;
    logoRgba[i + 1] = 215;
    logoRgba[i + 2] = 0;
    logoRgba[i + 3] = inLetter ? 255 : 0;
  }
}

console.time("patch");
const patched = patchTitleLogoArchive(data, logoRgba);
console.timeEnd("patch");
console.log("patched archive size:", patched.length);

writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/patched_zelda2_mag.gar.lzs", patched);

console.log("\n=== re-decompressing patched archive to verify ===");
const redecompressed = decompressGrezzoLzs(patched);
console.log("decompressed GAR size:", redecompressed.length);
const files = parseGar(redecompressed);
console.log("files in archive:", files.map((f) => `${f.typeName}/${f.fileName}(${f.data.length}b)`));

const cmbFile = files.find((f) => f.typeName === "cmb")!;
const cmb = parseCmb(cmbFile.data);
console.log("\nre-parsed CMB:");
console.log("textures:", cmb.textures.length, cmb.textures.map((t) => t.name));
console.log("materials:", cmb.materials.length);
console.log("meshes:", cmb.meshes.length, cmb.meshes.map((m) => `sepd=${m.sepdIdx},mat=${m.matsIdx}`));
console.log("sepds:", cmb.sepds.length);

console.log("\nOK: full pipeline round-trips (decompress -> patch -> compress -> decompress -> parse) without throwing.");
