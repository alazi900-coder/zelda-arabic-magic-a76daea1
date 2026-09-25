import { readFileSync } from "fs";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const original = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/0761e26f-zelda2_mag.gar.lzs");
const origData = new Uint8Array(original.buffer, original.byteOffset, original.byteLength);
const origFiles = parseGar(decompressGrezzoLzs(origData));
const origCmb = parseCmb(origFiles.find(f=>f.typeName==="cmb")!.data);

const patched = readFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/zelda2_mag-arabic-logo-v3.gar.lzs");
const patchedData = new Uint8Array(patched.buffer, patched.byteOffset, patched.byteLength);
const files = parseGar(decompressGrezzoLzs(patchedData));
const cmbFile = files.find(f=>f.typeName==="cmb")!;
console.log("CMB size:", cmbFile.data.length, "(orig:", origFiles.find(f=>f.typeName==="cmb")!.data.length, ")");
const cmb = parseCmb(cmbFile.data);

console.log("header identical:", JSON.stringify(cmb.header) === JSON.stringify(origCmb.header));
console.log("counts:", cmb.textures.length, cmb.materials.length, cmb.meshes.length, cmb.sepds.length,
  "vs orig:", origCmb.textures.length, origCmb.materials.length, origCmb.meshes.length, origCmb.sepds.length);

const titleSub = cmb.textures.find(t=>t.name==="title_sub_00")!;
console.log("\ntitle_sub_00: all bytes zero?", titleSub.pixels.every(b=>b===0), "length:", titleSub.pixels.length);

cmb.textures.forEach((t,i) => {
  const o = origCmb.textures[i];
  const same = Buffer.from(t.pixels).equals(Buffer.from(o.pixels));
  console.log(`tex[${i}] ${t.name}: pixels same as orig = ${same}`);
});
