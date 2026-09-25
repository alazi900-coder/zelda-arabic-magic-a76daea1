import { readFileSync, writeFileSync } from "fs";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";

const archivePath = process.argv[2];
const outPath = process.argv[3];
const buf = readFileSync(archivePath);
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const files = parseGar(decompressGrezzoLzs(data));
const cmb = files.find(f => f.typeName === "cmb")!;
writeFileSync(outPath, cmb.data);
console.log("wrote", outPath, cmb.data.length, "bytes");
