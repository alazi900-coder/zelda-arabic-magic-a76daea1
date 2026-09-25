import { readFileSync } from "fs";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const original = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/0761e26f-zelda2_mag.gar.lzs");
const data = new Uint8Array(original.buffer, original.byteOffset, original.byteLength);
const files = parseGar(decompressGrezzoLzs(data));
const cmbBytes = files.find((f) => f.typeName === "cmb")!.data;

const standalone = readFileSync("/tmp/title_logo.cmb");
const standaloneBytes = new Uint8Array(standalone.buffer, standalone.byteOffset, standalone.byteLength);

console.log("same bytes as /tmp/title_logo.cmb:", Buffer.from(cmbBytes).equals(Buffer.from(standaloneBytes)));
console.log("cmbBytes length:", cmbBytes.length, "standalone length:", standaloneBytes.length);

const cmb = parseCmb(cmbBytes);
console.log("sepd[9] prmsBytes length:", cmb.sepds[9].prmsBytes.length);
console.log("sepd[9] prmsBytes hex:", Buffer.from(cmb.sepds[9].prmsBytes).toString("hex"));
