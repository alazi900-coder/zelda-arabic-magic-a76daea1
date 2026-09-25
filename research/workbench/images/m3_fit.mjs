import { readFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
const m3src = readFileSync(`${REPO}/src/lib/mother3/m3-arabic-font.ts`, "utf-8");
const font = Buffer.from(m3src.match(/M3_ARABIC_FONT_B64 = "([^"]+)"/)[1], "base64");
const W = Buffer.from(m3src.match(/M3_ARABIC_WIDTHS_B64 = "([^"]+)"/)[1], "base64");
const tbl = readFileSync(`${REPO}/src/lib/mother3/m3-arabic-table.ts`, "utf-8");
const map = new Map();
for (const m of tbl.matchAll(/"\\u([0-9a-fA-F]{4})":\s*(0x[0-9A-Fa-f]+)/g)) map.set(parseInt(m[1],16), parseInt(m[2],16));
const px=(c,x,y)=>{const g=font.subarray(c*0x20,(c+1)*0x20);return (g[y*2+(x>>3)]>>(7-(x&7)))&1;};

const iz = readFileSync(`${REPO}/src/lib/inazuma/inazuma-arabic-glyphs.ts`, "utf-8");
const izCps = new Set(JSON.parse(iz.match(/INAZUMA_ARABIC_CODEPOINTS: number\[\] = (\[[^\]]+\])/)[1].replace(/0x[0-9A-Fa-f]+/g, m => parseInt(m,16))));

let tall=[], wide=[], missing=[], advOver=[];
let minY=99,maxY=-1;
for (const cp of izCps) {
  const c = map.get(cp);
  if (c===undefined){ missing.push(cp); continue; }
  let a=99,b=-1,l=99,r=-1;
  for(let y=0;y<16;y++)for(let x=0;x<16;x++) if(px(c,x,y)){if(y<a)a=y;if(y>b)b=y;if(x<l)l=x;if(x>r)r=x;}
  if(b<0) continue;
  if(a<minY)minY=a; if(b>maxY)maxY=b;
  if(b-a+1>12) tall.push([cp,b-a+1]);
  if(r-l+1>11) wide.push([cp,r-l+1]);
  if(W[c]>11) advOver.push([cp,W[c]]);
}
console.log("Inazuma needs", izCps.size, "forms; Mother 3 is missing:", missing.map(c=>"U+"+c.toString(16).toUpperCase()).join(" ")||"none");
console.log("vertical ink band across all of them: rows", minY, "..", maxY, `(${maxY-minY+1} rows tall; Inazuma cell = 12)`);
console.log("taller than 12 rows:", tall.map(([c,h])=>`U+${c.toString(16).toUpperCase()}=${h}`).join(" ")||"none");
console.log("wider than 11 px:", wide.map(([c,w])=>`U+${c.toString(16).toUpperCase()}=${w}`).join(" ")||"none");
console.log("advance wider than 11:", advOver.map(([c,w])=>`U+${c.toString(16).toUpperCase()}=${w}`).join(" ")||"none");
