import { replaceWilayTexture, type WilayTextureInfo } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/wilay-parser";
const W = 64, H = 64;
const rgba = new Uint8Array(W * H * 4);
for (let i = 0; i < W*H; i++) { rgba[i*4]=200; rgba[i*4+1]=120; rgba[i*4+2]=60; rgba[i*4+3]=255; }
const names: Record<number,string> = {66:'BC1',68:'BC3',73:'BC4',77:'BC7',37:'RGBA8',67:'BC2',75:'BC5',80:'BC6H',109:'BGRA8',1:'R8',41:'RGBA16F',57:'RGBA4'};
const handled = new Set([66,73,68,77,37]);
console.log("النوع       معالَج؟  النوع المعلَن في التذييل  نسبة البايتات غير الصفرية");
for (const fmt of [66,68,73,77,37, 67,75,80,109,1,41,57]) {
  const tex = { type:'mibl', dataOffset:0, dataSize:4096, width:W, height:H,
    footer:{ imageFormat: fmt, depth:1, viewDimension:2, version:10001 } } as unknown as WilayTextureInfo;
  const r = replaceWilayTexture(new Uint8Array(4096).buffer, tex, rgba, W, H);
  if (!r) { console.log(names[fmt], "→ null"); continue; }
  const u = new Uint8Array(r);
  const dv = new DataView(r);
  const declared = dv.getUint32(u.length - 40 + 24, true);
  const dataEnd = u.length - 40;
  let nz = 0; for (let i = 0; i < dataEnd; i++) if (u[i] !== 0) nz++;
  const pct = ((nz / dataEnd) * 100).toFixed(1);
  console.log(`${names[fmt].padEnd(10)} ${(handled.has(fmt)?'نعم':'لا').padEnd(8)} ${String(names[declared]||declared).padEnd(24)} ${pct}%`);
}
