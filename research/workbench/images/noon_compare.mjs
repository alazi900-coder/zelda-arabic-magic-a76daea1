import { readFileSync } from "node:fs";
import { writePNG } from "./png_write.mjs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
const iz = readFileSync(`${REPO}/src/lib/inazuma/inazuma-arabic-glyphs.ts`, "utf-8");
const izCps = JSON.parse(iz.match(/INAZUMA_ARABIC_CODEPOINTS: number\[\] = (\[[^\]]+\])/)[1].replace(/0x[0-9A-Fa-f]+/g, m => parseInt(m,16)));
const izFont = Buffer.from(iz.match(/INAZUMA_FONT12_GLYPHS_B64 = "([^"]+)"/)[1], "base64");
const izWidths = JSON.parse(iz.match(/INAZUMA_FONT12_WIDTHS: number\[\] = (\[[^\]]+\])/)[1]);
const izMap = new Map(izCps.map((cp, i) => [cp, i]));
const izPx = (slot,x,y)=>{const b=y*11+x;const g=izFont.subarray(slot*17,slot*17+17);return (g[b>>3]>>(7-(b&7)))&1;};

const m3src = readFileSync(`${REPO}/src/lib/mother3/m3-arabic-font.ts`, "utf-8");
const m3Font = Buffer.from(m3src.match(/M3_ARABIC_FONT_B64 = "([^"]+)"/)[1], "base64");
const m3W = Buffer.from(m3src.match(/M3_ARABIC_WIDTHS_B64 = "([^"]+)"/)[1], "base64");
const tbl = readFileSync(`${REPO}/src/lib/mother3/m3-arabic-table.ts`, "utf-8");
const m3Map = new Map();
for (const m of tbl.matchAll(/"\\u([0-9a-fA-F]{4})":\s*(0x[0-9A-Fa-f]+)/g)) m3Map.set(parseInt(m[1],16), parseInt(m[2],16));
const m3Px=(c,x,y)=>{const g=m3Font.subarray(c*0x20,(c+1)*0x20);return (g[y*2+(x>>3)]>>(7-(x&7)))&1;};

const forms = [0xFEE5,0xFEE6,0xFEE7,0xFEE8];  // noon: isolated, final, initial, medial
const zoom = 10, cellW = 16, cellH = 16, pad = 6;
const cols = forms.length;
const W = cols*(cellW*zoom+pad)+pad, H = 2*(cellH*zoom+pad)+pad;
const rgba = new Uint8ClampedArray(W*H*4);
for(let i=0;i<W*H;i++){rgba[i*4]=15;rgba[i*4+1]=15;rgba[i*4+2]=25;rgba[i*4+3]=255;}
function cellBg(ox,oy,w,h){for(let y=0;y<h*zoom;y++)for(let x=0;x<w*zoom;x++){const o=((oy+y)*W+ox+x)*4;rgba[o]=40;rgba[o+1]=40;rgba[o+2]=55;}}
function put(ox,oy,x,y){for(let dy=0;dy<zoom;dy++)for(let dx=0;dx<zoom;dx++){const o=((oy+y*zoom+dy)*W+(ox+x*zoom+dx))*4;rgba[o]=255;rgba[o+1]=255;rgba[o+2]=255;}}

forms.forEach((cp,i)=>{
  const ox = pad + i*(cellW*zoom+pad);
  // row 1: inazuma
  const slot = izMap.get(cp);
  cellBg(ox, pad, izWidths[slot], 12);
  for(let y=0;y<12;y++)for(let x=0;x<11;x++) if(izPx(slot,x,y)) put(ox,pad,x,y);
  // row 2: mother3
  const code = m3Map.get(cp);
  const oy2 = pad + cellH*zoom + pad;
  cellBg(ox, oy2, m3W[code], 16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++) if(m3Px(code,x,y)) put(ox,oy2,x,y);
  console.log(`U+${cp.toString(16).toUpperCase()}  inazuma slot ${slot} width ${izWidths[slot]}   |   m3 code 0x${code.toString(16)} width ${m3W[code]}`);
});
writePNG("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/images/noon_compare.png", W, H, rgba);
