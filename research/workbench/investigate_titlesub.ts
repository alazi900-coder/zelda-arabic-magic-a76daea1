import { readFileSync } from "fs";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const buf = readFileSync("/tmp/title_logo.cmb");
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const cmb = parseCmb(data);

console.log("textures:");
cmb.textures.forEach((t, i) => console.log(`  [${i}] ${t.name} ${t.width}x${t.height} fmt=0x${t.glFormat.toString(16)}`));

const titleSubIdx = cmb.textures.findIndex(t => t.name === "title_sub_00");
console.log("\ntitle_sub_00 texture index:", titleSubIdx);

console.log("\nmaterials -> which uses title_sub_00's index via texMapper[0]?");
cmb.materials.forEach((m, i) => {
  const view = new DataView(m.buffer, m.byteOffset, m.byteLength);
  const texId0 = view.getInt16(16, true);
  console.log(`  material[${i}] texMapper[0].textureId=${texId0}`);
});

console.log("\nmeshes (sepdIdx, matsIdx):");
cmb.meshes.forEach((mesh, i) => console.log(`  mesh[${i}] sepd=${mesh.sepdIdx} mat=${mesh.matsIdx}`));

// triangle counts for all shapes, to see which is a simple flat quad
function prmInfo(prmsBytes: Uint8Array) {
  const view = new DataView(prmsBytes.buffer, prmsBytes.byteOffset, prmsBytes.byteLength);
  const boneTableCount = view.getUint16(14, true);
  let prmAbs = 24 + boneTableCount * 2;
  prmAbs = (prmAbs + 3) & ~3;
  const indexType = view.getInt16(prmAbs + 0x10, true);
  const count = view.getUint16(prmAbs + 0x14, true);
  return { indexType, count, triangles: count / 3 };
}
console.log("\nshape triangle counts:");
cmb.sepds.forEach((s, i) => {
  const info = prmInfo(s.prmsBytes);
  console.log(`  shape[${i}] triangles=${info.triangles} indexType=0x${info.indexType.toString(16)}`);
});
