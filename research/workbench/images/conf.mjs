import { containerEntries, allContainers } from "./allimg.mjs";
import { readEntry, widthCandidates } from "./l5img.mjs";
import { scoreWidth } from "./guess.mjs";
let tot=0, single=0, conf=0, amb=[];
for (const f of allContainers()) {
  let c; try { c = containerEntries(f); } catch { continue; } if (!c) continue;
  for (const e of c.entries) {
    let img; try { img = readEntry(c.raw, e); } catch { continue; }
    const cells = img.map.length; if (!cells || cells > 4096 || !Number.isInteger(cells)) continue;
    tot++;
    const ws = widthCandidates(cells).filter(w => w>=2 && w*8<=512 && (cells/w)*8<=512);
    if (ws.length <= 1) { single++; continue; }
    const sc = ws.map(w => [w, scoreWidth(img, w)]).sort((a,b)=>a[1]-b[1]);
    const r = sc[1][1] / Math.max(sc[0][1], 1e-6);
    if (r > 1.5) conf++; else amb.push(`${f}:${e.name} ${sc.slice(0,3).map(x=>x[0]*8+'px:'+x[1].toFixed(2)).join(' ')}`);
  }
}
console.log({tot, single, conf, amb: amb.length});
console.log(amb.slice(0,40).join('\n'));
