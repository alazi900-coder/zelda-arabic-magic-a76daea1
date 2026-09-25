import { readFileSync } from "fs";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const buf = readFileSync("/tmp/title_logo.cmb");
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const cmb = parseCmb(data);

cmb.materials.forEach((m, i) => {
  const view = new DataView(m.buffer, m.byteOffset, m.byteLength);
  const alphaTestEnabled = view.getUint8(0x130);
  const alphaTestReference = view.getUint8(0x131);
  const alphaTestFunction = view.getUint16(0x132, true);
  console.log(`material[${i}] alphaTestEnabled=${alphaTestEnabled} ref=${alphaTestReference} func=0x${alphaTestFunction.toString(16)}`);
});
