import { readFileSync } from "fs";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const original = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/0761e26f-zelda2_mag.gar.lzs");
const data = new Uint8Array(original.buffer, original.byteOffset, original.byteLength);
const files = parseGar(decompressGrezzoLzs(data));
const cmbBytes = files.find((f) => f.typeName === "cmb")!.data;
const cmb = parseCmb(cmbBytes);

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

console.log("shape9 prmsBytes length:", cmb.sepds[9].prmsBytes.length);
console.log(prmInfo(cmb.sepds[9].prmsBytes));
