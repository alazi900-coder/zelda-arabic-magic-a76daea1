import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ndsFileIdByPath, findNdsFile } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const dir = process.argv[3];
mkdirSync(dir, { recursive: true });
const paths = [...ndsFileIdByPath(rom).keys()].filter((p) => /\.SPF_$|\.PAC_$/i.test(p)).sort();
console.log(`${paths.length} containers`);
let n = 0;
for (const p of paths) {
  const f = findNdsFile(rom, p);
  if (!f) continue;
  const safe = p.replace(/^data_iz\//, "").replace(/\//g, "__");
  writeFileSync(`${dir}/${safe}`, rom.subarray(f.start, f.end));
  n++;
}
console.log(`extracted ${n}`);
paths.forEach((p) => console.log("  " + p));
