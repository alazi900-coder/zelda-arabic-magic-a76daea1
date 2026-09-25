import { readFileSync } from "fs";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const buf = readFileSync("/tmp/title_logo.cmb");
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const cmb = parseCmb(data);

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

cmb.sepds.forEach((s, i) => {
  const { indexType, count, offset } = prmInfo(s.prmsBytes);
  const end = offset + count * (indexType === 0x1401 ? 1 : 2);
  console.log(`shape[${i}] offset=${offset} count=${count} indexType=0x${indexType.toString(16)} range=[${offset},${end}) posStart=${s.attribs.position.start} uv0Start=${s.attribs.uv0.start}`);
});

console.log("\nfaceIndices total length:", cmb.faceIndices.length);
console.log("position buffer total length:", cmb.vatr.attribs.position.length, "(", cmb.vatr.attribs.position.length/12, "vertices)");
console.log("uv0 buffer total length:", cmb.vatr.attribs.uv0.length, "(", cmb.vatr.attribs.uv0.length/4, "vertices)");

// Print actual index bytes for shape 4 (32 triangles) and shape 0 (template quad) to inspect topology.
function prmAbsAndData(prmsBytes: Uint8Array, faceIndices: Uint8Array) {
  const { offset, count, indexType } = prmInfo(prmsBytes);
  const bytesPerIdx = indexType === 0x1401 ? 1 : 2;
  const vals: number[] = [];
  for (let i = 0; i < count; i++) {
    vals.push(bytesPerIdx === 1 ? faceIndices[offset + i] : (faceIndices[offset + i*2] | (faceIndices[offset+i*2+1] << 8)));
  }
  return vals;
}
console.log("\nshape[0] (template) indices:", prmAbsAndData(cmb.sepds[0].prmsBytes, cmb.faceIndices));
console.log("shape[4] (letter, 32 tris) first 24 indices:", prmAbsAndData(cmb.sepds[4].prmsBytes, cmb.faceIndices).slice(0, 24));
