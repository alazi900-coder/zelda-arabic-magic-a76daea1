import { readdirSync, readFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
const kinds = {};
const ex = {};
for (const f of readdirSync("spf").filter(f => /^pic[23]d/.test(f))) {
  const raw = new Uint8Array(readFileSync("spf/" + f));
  let d = raw, comp = false;
  if (raw[0] === 0x10) { try { d = lz77Decompress(raw); comp = true; } catch {} }
  const dv = new DataView(d.buffer, d.byteOffset, d.length);
  let k;
  const top = f.split("__").slice(0, 2).join("/");
  if (String.fromCharCode(d[0], d[1], d[2]) === "SFP") {
    let n = 0; try { n = parseSfp(d).length; } catch {}
    const e0 = n ? parseSfp(d)[0] : null;
    const h1 = e0 ? dv.getUint32(e0.dataOffset + 4, true) : -1, h2 = e0 ? dv.getUint32(e0.dataOffset + 8, true) : -1;
    k = `SFP h0=${e0 ? dv.getUint32(e0.dataOffset, true) : '?'} ${h1 === h2 ? '2d' : '3d?'}`;
  } else if (d.length >= 32 && dv.getUint32(0, true) === 3 && dv.getUint32(4, true) === 32) {
    k = dv.getUint32(8, true) === 32 ? "bare2d" : "bare3d";
  } else k = "other:" + Buffer.from(d.slice(0, 4)).toString("hex");
  const key = `${top} ${comp ? "lz" : "raw"} ${k}`;
  kinds[key] = (kinds[key] || 0) + 1; ex[key] ??= f;
}
for (const [k, v] of Object.entries(kinds).sort()) console.log(v, k, ex[k]);
