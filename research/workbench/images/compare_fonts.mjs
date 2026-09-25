import { readFileSync } from "node:fs";
import { writePNG } from "./png_write.mjs";

const REPO = "/home/user/zelda-arabic-magic-a76daea1";

// ---- current Inazuma glyphs (11x12, 1bpp, 17 bytes each) ----
const iz = readFileSync(`${REPO}/src/lib/inazuma/inazuma-arabic-glyphs.ts`, "utf-8");
const izCps = JSON.parse(iz.match(/INAZUMA_ARABIC_CODEPOINTS: number\[\] = (\[[^\]]+\])/)[1].replace(/0x[0-9A-Fa-f]+/g, m => parseInt(m,16)));
const izFont = Buffer.from(iz.match(/INAZUMA_FONT12_GLYPHS_B64 = "([^"]+)"/)[1], "base64");
const izWidths = JSON.parse(iz.match(/INAZUMA_FONT12_WIDTHS: number\[\] = (\[[^\]]+\])/)[1]);
const izMap = new Map(izCps.map((cp, i) => [cp, i]));

function izPixel(slot, x, y) { // 11x12, rows of ceil(11/8)=2 bytes? 17 bytes/12 rows -> bit-packed continuous
  const bitIndex = y * 11 + x;
  const g = izFont.subarray(slot * 17, slot * 17 + 17);
  return (g[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
}

// ---- Mother 3 glyphs (16x16, 1bpp, 0x20 bytes each) ----
const m3src = readFileSync(`${REPO}/src/lib/mother3/m3-arabic-font.ts`, "utf-8");
const m3Font = Buffer.from(m3src.match(/M3_ARABIC_FONT_B64 = "([^"]+)"/)[1], "base64");
const m3Widths = Buffer.from(m3src.match(/M3_ARABIC_WIDTHS_B64 = "([^"]+)"/)[1], "base64");
const tbl = readFileSync(`${REPO}/src/lib/mother3/m3-arabic-table.ts`, "utf-8");
const m3Map = new Map();
for (const m of tbl.matchAll(/"\\u([0-9a-fA-F]{4})":\s*(0x[0-9A-Fa-f]+)/g)) m3Map.set(parseInt(m[1],16), parseInt(m[2],16));

function m3Pixel(code, x, y) {
  const g = m3Font.subarray(code * 0x20, (code + 1) * 0x20);
  return (g[y * 2 + (x >> 3)] >> (7 - (x & 7))) & 1;
}

// Render a string of presentation forms, RIGHT to LEFT, in both fonts.
function render(forms, zoom) {
  const rows = [];
  // row A: inazuma
  const cellsA = forms.map(cp => {
    const slot = izMap.get(cp);
    const w = slot === undefined ? 4 : izWidths[slot];
    return { slot, w, h: 12, px: (x,y) => slot === undefined ? 0 : izPixel(slot, x, y) };
  });
  const cellsB = forms.map(cp => {
    const code = m3Map.get(cp);
    const w = code === undefined ? 4 : (m3Widths[code] || 8);
    return { code, w, h: 16, px: (x,y) => code === undefined ? 0 : m3Pixel(code, x, y) };
  });
  return { cellsA, cellsB };
}

function draw(cells, cellH, zoom) {
  const total = cells.reduce((s,c)=>s+c.w,0);
  const W = total * zoom, H = cellH * zoom;
  const rgba = new Uint8ClampedArray(W*H*4);
  for (let i=0;i<W*H;i++){ rgba[i*4]=20; rgba[i*4+1]=20; rgba[i*4+2]=30; rgba[i*4+3]=255; }
  let penX = 0;
  for (const c of cells) {          // RTL: draw from the right edge leftwards
    const ox = total - penX - c.w;
    for (let y=0;y<cellH;y++) for (let x=0;x<c.w;x++) {
      if (!c.px(x,y)) continue;
      for (let dy=0;dy<zoom;dy++) for (let dx=0;dx<zoom;dx++) {
        const o = (((y*zoom+dy)*W) + (ox+x)*zoom+dx)*4;
        rgba[o]=255;rgba[o+1]=255;rgba[o+2]=255;
      }
    }
    penX += c.w;
  }
  return { W, H, rgba };
}

// "انضم إليك" in presentation forms, logical order (we draw RTL)
const word = [0xFE8D,0xFEE6,0xFEB6,0xFEE2,0x0020,0xFE87,0xFEDF,0xFEF4,0xFEDB];
// filter out the space -> render as blank by using a missing codepoint
const forms = word;

const zoom = 6;
const { cellsA, cellsB } = render(forms, zoom);
const a = draw(cellsA, 12, zoom);
const b = draw(cellsB, 16, zoom);

const W = Math.max(a.W, b.W) + 20;
const gap = 20;
const H = a.H + gap + b.H + 20;
const rgba = new Uint8ClampedArray(W*H*4);
for (let i=0;i<W*H;i++){ rgba[i*4]=20; rgba[i*4+1]=20; rgba[i*4+2]=30; rgba[i*4+3]=255; }
function blit(img, oy) {
  for (let y=0;y<img.H;y++) for (let x=0;x<img.W;x++) {
    const s=(y*img.W+x)*4, d=(((y+oy)*W)+(x+10))*4;
    rgba[d]=img.rgba[s];rgba[d+1]=img.rgba[s+1];rgba[d+2]=img.rgba[s+2];
  }
}
blit(a, 10);
blit(b, 10 + a.H + gap);
writePNG("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/images/font_compare.png", W, H, rgba);
console.log("top = current Inazuma font, bottom = Mother 3 font");
console.log("inazuma widths:", cellsA.map(c=>c.w).join(","));
console.log("m3 widths:", cellsB.map(c=>c.w).join(","));
