import { readFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
const iz = readFileSync(`${REPO}/src/lib/inazuma/inazuma-arabic-glyphs.ts`, "utf-8");
const cps = JSON.parse(iz.match(/INAZUMA_ARABIC_CODEPOINTS: number\[\] = (\[[^\]]+\])/)[1].replace(/0x[0-9A-Fa-f]+/g, m => parseInt(m,16)));
const font = Buffer.from(iz.match(/INAZUMA_FONT12_GLYPHS_B64 = "([^"]+)"/)[1], "base64");
const widths = JSON.parse(iz.match(/INAZUMA_FONT12_WIDTHS: number\[\] = (\[[^\]]+\])/)[1]);
const px=(s,x,y)=>{const b=y*11+x;const g=font.subarray(s*17,s*17+17);return (g[b>>3]>>(7-(b&7)))&1;};

// Which forms must join on which side (per Unicode presentation-form blocks):
// final & medial join on the RIGHT (toward the previous letter) -> need ink at x = width-1
// initial & medial join on the LEFT (toward the next letter)    -> need ink at x = 0
// (rendering is RTL, so the previous letter sits to the right.)
const FINAL = new Set(), INITIAL = new Set(), MEDIAL = new Set();
// presentation-form blocks are laid out isolated,final[,initial,medial]
// derive from the standard table: letters with 4 forms cycle iso,fin,ini,med
// Rather than hardcode, use the known FExx layout via Intl-free table:
const four = [0xFE8B,0xFE8F,0xFE93+0,0xFE97,0xFE9B,0xFE9F,0xFEA3,0xFEA7,0xFEAB,0xFEB3,0xFEB7,0xFEBB,0xFEBF,0xFEC3,0xFEC7,0xFECB,0xFECF,0xFED3,0xFED7,0xFEDB,0xFEDF,0xFEE3,0xFEE7,0xFEEB,0xFEF3];
for (const ini of four) { INITIAL.add(ini); MEDIAL.add(ini+1); FINAL.add(ini-1); }
// 2-form letters: iso,final pairs
for (const iso of [0xFE80,0xFE81,0xFE83,0xFE85,0xFE87,0xFE89,0xFE8D,0xFEA9,0xFEAB,0xFEAD,0xFEAF,0xFEB1,0xFEED,0xFEEF,0xFEF1,0xFEF5,0xFEF7,0xFEF9,0xFEFB]) FINAL.add(iso+1);

let inkPastAdvance = 0, missRight = 0, missLeft = 0, empty = 0, details = [];
cps.forEach((cp, s) => {
  const w = widths[s];
  let minX=99,maxX=-1,minY=99,maxY=-1;
  for(let y=0;y<12;y++)for(let x=0;x<11;x++) if(px(s,x,y)){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
  if (maxX<0){ empty++; details.push(`U+${cp.toString(16).toUpperCase()} EMPTY`); return; }
  if (maxX > w-1) { inkPastAdvance++; details.push(`U+${cp.toString(16).toUpperCase()} ink reaches x=${maxX} but advance is ${w}`); }
  const needRight = FINAL.has(cp)||MEDIAL.has(cp);
  const needLeft  = INITIAL.has(cp)||MEDIAL.has(cp);
  let hasRight=false, hasLeft=false;
  for(let y=0;y<12;y++){ if(px(s,Math.min(w-1,10),y)) hasRight=true; if(px(s,0,y)) hasLeft=true; }
  if (needRight && !hasRight) { missRight++; details.push(`U+${cp.toString(16).toUpperCase()} joins right but column ${w-1} is empty`); }
  if (needLeft && !hasLeft)  { missLeft++;  details.push(`U+${cp.toString(16).toUpperCase()} joins left but column 0 is empty`); }
});
console.log(`glyphs: ${cps.length}`);
console.log(`empty: ${empty}`);
console.log(`ink past the advance width: ${inkPastAdvance}   (overlaps the neighbouring letter)`);
console.log(`final/medial with no ink at the right joining column: ${missRight}`);
console.log(`initial/medial with no ink at column 0 (left join): ${missLeft}`);
console.log("---");
details.slice(0,40).forEach(d=>console.log("  "+d));
if (details.length>40) console.log(`  ... +${details.length-40} more`);
