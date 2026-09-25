import { readFileSync } from "fs";
import { patchTitleLogoArchive, LOGO_WIDTH, LOGO_HEIGHT } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/pipeline.ts";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const original = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/0761e26f-zelda2_mag.gar.lzs");
const data = new Uint8Array(original.buffer, original.byteOffset, original.byteLength);

const w = LOGO_WIDTH, h = LOGO_HEIGHT;
const logoRgba = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4;
  logoRgba[i] = 255; logoRgba[i+1]=215; logoRgba[i+2]=0; logoRgba[i+3]=255;
}
const patched = patchTitleLogoArchive(data, logoRgba);

const origFiles = parseGar(decompressGrezzoLzs(data));
const origCmbBytes = origFiles.find((f) => f.typeName === "cmb")!.data;
const patchedFiles = parseGar(decompressGrezzoLzs(patched));
const patchedCmbBytes = patchedFiles.find((f) => f.typeName === "cmb")!.data;

const origCmb = parseCmb(origCmbBytes);
const patchedCmb = parseCmb(patchedCmbBytes);

console.log("=== header offsets (must be identical) ===");
console.log(JSON.stringify(origCmb.header) === JSON.stringify(patchedCmb.header) ? "IDENTICAL" : "DIFFERENT!!");
console.log("orig:", origCmb.header);
console.log("patched:", patchedCmb.header);

console.log("\n=== counts (must be identical) ===");
console.log("textures:", origCmb.textures.length, "vs", patchedCmb.textures.length);
console.log("materials:", origCmb.materials.length, "vs", patchedCmb.materials.length);
console.log("meshes:", origCmb.meshes.length, "vs", patchedCmb.meshes.length);
console.log("sepds:", origCmb.sepds.length, "vs", patchedCmb.sepds.length);
console.log("faceIndicesCount:", origCmb.faceIndicesCount, "vs", patchedCmb.faceIndicesCount);

console.log("\n=== mesh list (matsIdx/sepdIdx must be identical -- only vertex/index VALUES change) ===");
console.log("orig:   ", origCmb.meshes.map(m=>`sepd=${m.sepdIdx},mat=${m.matsIdx}`).join(" "));
console.log("patched:", patchedCmb.meshes.map(m=>`sepd=${m.sepdIdx},mat=${m.matsIdx}`).join(" "));

console.log("\n=== texture entries (must be identical except pixel bytes of index 6) ===");
origCmb.textures.forEach((t, i) => {
  const p = patchedCmb.textures[i];
  const same = t.name===p.name && t.width===p.width && t.height===p.height && t.glFormat===p.glFormat && t.pixels.length===p.pixels.length;
  console.log(`tex[${i}] ${t.name}: metadata same=${same}, pixels identical=${Buffer.from(t.pixels).equals(Buffer.from(p.pixels))}`);
});

console.log("\n=== shape index data (removed shapes -> should differ from original, degenerate) ===");
for (const idx of [1,2,3,4,5,9]) {
  const view1 = new DataView(origCmb.sepds[idx].prmsBytes.buffer, origCmb.sepds[idx].prmsBytes.byteOffset, origCmb.sepds[idx].prmsBytes.byteLength);
  console.log(`shape[${idx}] prmsBytes identical to original: ${Buffer.from(origCmb.sepds[idx].prmsBytes).equals(Buffer.from(patchedCmb.sepds[idx].prmsBytes))}`);
}

console.log("\n=== new logo quad position vertices (shape 4) ===");
const posBuf = patchedCmb.vatr.attribs.position;
const posView = new DataView(posBuf.buffer, posBuf.byteOffset, posBuf.byteLength);
const start = patchedCmb.sepds[4].attribs.position.start;
for (let i=0;i<4;i++){
  console.log(`  v${i}:`, posView.getFloat32(start+i*12,true), posView.getFloat32(start+i*12+4,true), posView.getFloat32(start+i*12+8,true));
}

console.log("\n=== actual face-index bytes (the real check) ===");
for (const idx of [1,2,3,4,5,9]) {
  const same = Buffer.from(origCmb.faceIndices).slice(0).equals(Buffer.from(patchedCmb.faceIndices).slice(0));
}
// need per-shape ranges - recompute via same helper as before
function prmInfo(prmsBytes: Uint8Array) {
  const view = new DataView(prmsBytes.buffer, prmsBytes.byteOffset, prmsBytes.byteLength);
  const boneTableCount = view.getUint16(14, true);
  let prmAbs = 24 + boneTableCount * 2;
  prmAbs = (prmAbs + 3) & ~3;
  const indexType = view.getInt16(prmAbs + 0x10, true);
  const count = view.getUint16(prmAbs + 0x14, true);
  const offset = view.getUint16(prmAbs + 0x16, true) * 2;
  return { indexType, count, offset };
}
for (const idx of [1,2,3,4,5,9]) {
  const { offset, count, indexType } = prmInfo(origCmb.sepds[idx].prmsBytes);
  const bytesPerIdx = indexType === 0x1401 ? 1 : 2;
  const origSlice = origCmb.faceIndices.slice(offset, offset + count*bytesPerIdx);
  const patchedSlice = patchedCmb.faceIndices.slice(offset, offset + count*bytesPerIdx);
  console.log(`shape[${idx}] face-index bytes identical: ${Buffer.from(origSlice).equals(Buffer.from(patchedSlice))}, patched sample:`, Array.from(patchedSlice.slice(0,12)));
}
