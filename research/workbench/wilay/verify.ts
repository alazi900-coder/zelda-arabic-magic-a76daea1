import { readFileSync } from "node:fs";
import { analyzeWilay } from "@/lib/wilay-parser";
const S = process.argv[2];
const a = new Uint8Array(readFileSync(`${S}/cttrl_test.wilay`)).buffer;
const bb = new Uint8Array(readFileSync(`${S}/saved_cttrl_test.wilay`)).buffer;
const ia = analyzeWilay(a), ib = analyzeWilay(bb);
const body = (buf: ArrayBuffer, t: { dataOffset: number; dataSize: number }) => new Uint8Array(buf, t.dataOffset, t.dataSize);
const eq = (x: Uint8Array, y: Uint8Array) => x.length === y.length && x.every((v, i) => v === y[i]);
console.log("valid", ib.valid, ib.textures.map((t) => `${t.index}:${t.width}x${t.height}:${t.formatName}`));
console.log("tex0 changed:", !eq(body(a, ia.textures[0]), body(bb, ib.textures[0])));
console.log("tex1 identical:", eq(body(a, ia.textures[1]), body(bb, ib.textures[1])));
// count white pixels in tex0 (RGBA8 swizzled: count 255,255,255,255 quads anywhere in the body)
const b0 = body(bb, ib.textures[0]); let white = 0;
for (let i = 0; i + 3 < 64 * 64 * 4; i += 4) if (b0[i] === 255 && b0[i + 1] === 255 && b0[i + 2] === 255 && b0[i + 3] === 255) white++;
console.log("white pixels in tex0:", white, "(expected", 33 * 23, ")");
