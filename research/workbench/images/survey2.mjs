import { readdirSync, readFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
const st = {};
function hdr(d, o) { const dv = new DataView(d.buffer, d.byteOffset + o); return [0,1,2,3,4,5,6,7].map(k => dv.getUint32(k*4, true)); }
for (const f of readdirSync("spf").filter(f => /^pic[23]d/.test(f))) {
  let d = new Uint8Array(readFileSync("spf/" + f)); if (d[0] === 0x10) d = lz77Decompress(d);
  const list = String.fromCharCode(d[0],d[1],d[2]) === "SFP" ? parseSfp(d).map(e => [e.dataOffset, e.size]) : [[0, d.length]];
  for (const [o, size] of list) {
    const h = hdr(d, o);
    const chain = h[3] === h[1] + h[2];
    const tiledLike = h[2] % 32 === 0 && h[2] <= 512 && h[4] % 2 === 0 && h[5] >= h[3] + h[4] && h[7] > h[5] && h[7] <= size;
    let valid = false;
    if (tiledLike) { const tc = (h[7]-h[5])/32; valid = true; for (let m = 0; m < h[4]/2; m++) { const v = d[o+h[3]+m*2] | (d[o+h[3]+m*2+1]<<8); if ((v & 0x3ff) >= Math.ceil(tc)+1) { valid = false; break; } } }
    const k = valid ? `tiled palSize=${h[2]}` : `linear tex=${h[2]>=1024?'big':h[2]} pal=${h[4]} fmt=${h[0]} chain=${chain} end=${h[5]===h[3]+h[4]}`;
    st[k] = (st[k] || 0) + 1;
  }
}
console.log(Object.entries(st).sort((a,b)=>b[1]-a[1]));
