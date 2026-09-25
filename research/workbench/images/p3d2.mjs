import { readdirSync } from "node:fs";
import { readP3d } from "./p3d.mjs";
for (const f of readdirSync("spf").filter(f => f.startsWith("pic3d__en__")).filter((_, i) => i % 6 === 0)) {
  const { d, h } = readP3d(f);
  const sec = Array.from(d.subarray(h[7], h[7] + h[6]));
  const u16 = []; for (let i = 0; i < sec.length; i += 2) u16.push(sec[i] | (sec[i+1] << 8));
  console.log(f.replace("pic3d__en__",""), "tex", h[2], "sec3:", u16.join(" "));
}
