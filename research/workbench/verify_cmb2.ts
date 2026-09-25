import { readFileSync } from "fs";
import { parseCmb, replaceLogoWithFlatQuad } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const buf = readFileSync("/tmp/title_logo.cmb");
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

const cmb = parseCmb(data);
console.log("=== parsed original ===");
console.log("name:", cmb.name, "version:", cmb.version);
console.log("textures:", cmb.textures.length, cmb.textures.map((t) => `${t.name}(${t.width}x${t.height},fmt=0x${t.glFormat.toString(16)},${t.pixels.length}b)`));
console.log("materials:", cmb.materials.length);
console.log("meshes:", cmb.meshes.length, cmb.meshes.map((m) => `sepd=${m.sepdIdx},mat=${m.matsIdx}`));
console.log("sepds/shapes:", cmb.sepds.length);
console.log("faceIndicesCount:", cmb.faceIndicesCount, "faceIndices.length:", cmb.faceIndices.length);
console.log("vatr maxIndex:", cmb.vatr.maxIndex);
for (const name of Object.keys(cmb.vatr.attribs) as (keyof typeof cmb.vatr.attribs)[]) {
  console.log(`  vatr.${name}: ${cmb.vatr.attribs[name].length} bytes`);
}

// Triangle counts per shape, decoded via the Sepd -> Prms -> Prm chain, mirroring
// the earlier Python investigation (shapes 1-5 should show 59/100/67/32/68 triangles;
// shape 0 and shape 9 should be flat quads: 2 triangles / 6 indices each).
function triCount(sepd: (typeof cmb.sepds)[number]) {
  const view = new DataView(sepd.prmsBytes.buffer, sepd.prmsBytes.byteOffset, sepd.prmsBytes.byteLength);
  // prmsBytes starts at "prms"; prm sub-chunk begins after boneTable, found the
  // same way parseSepd does internally — re-derive here for the check.
  const boneTableCount = view.getUint16(14, true);
  let prmAbs = 24 + boneTableCount * 2;
  prmAbs = (prmAbs + 3) & ~3;
  const indexType = view.getInt16(prmAbs + 0x10, true);
  const count = view.getUint16(prmAbs + 0x14, true);
  return { indexType, count, triangles: count / 3 };
}
cmb.sepds.forEach((s, i) => {
  const t = triCount(s);
  console.log(`shape[${i}] indexType=0x${t.indexType.toString(16)} count=${t.count} triangles=${t.triangles}`);
});

console.log("\n=== running replaceLogoWithFlatQuad ===");
const w = 256, h = 128;
const logoRgba = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    logoRgba[i] = 255; logoRgba[i + 1] = 0; logoRgba[i + 2] = 0; logoRgba[i + 3] = 255;
  }
}

const out = replaceLogoWithFlatQuad(data, {
  lettersMaterialIndex: 4,
  effectMaterialIndex: 5,
  templateShapeIndex: 0,
  bounds: { minX: -9.3, maxX: 11.72, minY: -3.97, maxY: 4.51, z: 2.26 },
  logoRgba,
  logoWidth: w,
  logoHeight: h,
  newTextureName: "title_ar",
});
console.log("output size:", out.length, "bytes");

console.log("\n=== re-parsing output ===");
const cmb2 = parseCmb(out);
console.log("name:", cmb2.name, "version:", cmb2.version);
console.log("textures:", cmb2.textures.length, cmb2.textures.map((t) => `${t.name}(${t.width}x${t.height},fmt=0x${t.glFormat.toString(16)},${t.pixels.length}b)`));
console.log("materials:", cmb2.materials.length);
console.log("meshes:", cmb2.meshes.length, cmb2.meshes.map((m) => `sepd=${m.sepdIdx},mat=${m.matsIdx}`));
console.log("sepds/shapes:", cmb2.sepds.length);
console.log("faceIndicesCount:", cmb2.faceIndicesCount, "faceIndices.length:", cmb2.faceIndices.length);
cmb2.sepds.forEach((s, i) => {
  const t = triCount(s);
  console.log(`shape[${i}] indexType=0x${t.indexType.toString(16)} count=${t.count} triangles=${t.triangles}`);
});

// Sanity: new material's texMapper[0].textureId should point at the new texture.
const newMesh = cmb2.meshes.find((m) => m.matsIdx === cmb2.materials.length - 1)!;
const newMatBytes = cmb2.materials[newMesh.matsIdx];
const newMatView = new DataView(newMatBytes.buffer, newMatBytes.byteOffset, newMatBytes.byteLength);
console.log("\nnew material's texMapper[0].textureId:", newMatView.getInt16(16, true), "expected:", cmb2.textures.length - 1);

const newSepd = cmb2.sepds[newMesh.sepdIdx];
console.log("new shape's position attrib start:", newSepd.attribs.position.start, "uv0 start:", newSepd.attribs.uv0.start);
console.log("new shape's position buffer total length:", cmb2.vatr.attribs.position.length, "(should exceed start + 4*12)");
console.log("new shape's uv0 buffer total length:", cmb2.vatr.attribs.uv0.length, "(should exceed start + 4*4)");

// Decode the position floats we just appended, to confirm the bounds round-tripped.
const posBuf = cmb2.vatr.attribs.position;
const posView = new DataView(posBuf.buffer, posBuf.byteOffset, posBuf.byteLength);
for (let i = 0; i < 4; i++) {
  const off = newSepd.attribs.position.start + i * 12;
  console.log(`  vertex[${i}]:`, posView.getFloat32(off, true), posView.getFloat32(off + 4, true), posView.getFloat32(off + 8, true));
}

console.log("\nOK: no exceptions thrown, structural checks above.");
