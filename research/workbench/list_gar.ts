import { readFileSync } from "fs";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";

const buf = readFileSync("/tmp/zelda2_mag.gar");
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const files = parseGar(data);
for (const f of files) {
  console.log(f.typeName, "|", f.fileName, "|", f.fullPath, "|", f.data.length, "bytes");
}
