import { readFileSync } from "fs";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const original = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/0761e26f-zelda2_mag.gar.lzs");
const origData = new Uint8Array(original.buffer, original.byteOffset, original.byteLength);
const origFiles = parseGar(decompressGrezzoLzs(origData));
const origCmb = parseCmb(origFiles.find(f=>f.typeName==="cmb")!.data);

const patched = readFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/zelda2_mag-arabic-logo-v6.gar.lzs");
const patchedData = new Uint8Array(patched.buffer, patched.byteOffset, patched.byteLength);
const files = parseGar(decompressGrezzoLzs(patchedData));
const cmbFile = files.find(f=>f.typeName==="cmb")!;
console.log("CMB size:", cmbFile.data.length, "(orig:", origFiles.find(f=>f.typeName==="cmb")!.data.length, ")");
const cmb = parseCmb(cmbFile.data);

console.log("header identical:", JSON.stringify(cmb.header) === JSON.stringify(origCmb.header));
console.log("counts:", cmb.textures.length, cmb.materials.length, cmb.meshes.length, cmb.sepds.length,
  "vs orig:", origCmb.textures.length, origCmb.materials.length, origCmb.meshes.length, origCmb.sepds.length);
console.log("mesh list unchanged:", JSON.stringify(cmb.meshes) === JSON.stringify(origCmb.meshes));

console.log("\nmaterials: alpha test state (idx: enabled/ref/func)");
cmb.materials.forEach((m, i) => {
  const om = origCmb.materials[i];
  const v = new DataView(m.buffer, m.byteOffset, m.byteLength);
  const ov = new DataView(om.buffer, om.byteOffset, om.byteLength);
  const same = Buffer.from(m).equals(Buffer.from(om));
  console.log(`  mat[${i}] enabled=${v.getUint8(0x130)} ref=${v.getUint8(0x131)} func=0x${v.getUint16(0x132,true).toString(16)} | bytes ${same ? "UNCHANGED" : "changed"} (orig enabled=${ov.getUint8(0x130)} func=0x${ov.getUint16(0x132,true).toString(16)})`);
});

// diff each material block against original, print exact differing byte offsets (should ONLY be 0x130-0x133 for materials 4,6,7)
cmb.materials.forEach((m, i) => {
  const om = origCmb.materials[i];
  const diffs = [];
  for (let b = 0; b < m.length; b++) if (m[b] !== om[b]) diffs.push(b);
  if (diffs.length) console.log(`  mat[${i}] differing byte offsets:`, diffs.map(d => "0x"+d.toString(16)));
});

const uv0 = cmb.sepds[4].attribs.uv0;
console.log("\nshape4 uv0.scale:", uv0.scale, "(expected ~", 1/32767, ")");

console.log("\ntextures format check:");
cmb.textures.forEach((t,i) => console.log(`  [${i}] ${t.name} fmt=0x${t.glFormat.toString(16)}`));
