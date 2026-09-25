import { containerEntries } from "./allimg.mjs";
import { readEntry } from "./l5img.mjs";
for (const f of ["pic2d__menu__en__MMName.SPF_","pic2d__title__en__MTSIni.SPF_","pic2d__en__MTSSrd.SPF_"]) {
  let c; try { c = containerEntries(f); } catch(e) { console.log(f, e.message); continue; }
  for (const e of c.entries.slice(0,6)) {
    const img = readEntry(c.raw, e);
    const h = img.header;
    const dv = new DataView(c.raw.buffer, c.raw.byteOffset);
    const extra = [];
    for (let o = h[6]; o < Math.min(h[6]+24, e.size); o+=2) extra.push(dv.getUint16(e.dataOffset+o,true));
    console.log(f.slice(0,30), e.name, 'size', e.size, 'h', h.join(','), 'cells', img.map.length, 'tiles', img.tileCount, '@h6:', extra.join(' '));
  }
}
