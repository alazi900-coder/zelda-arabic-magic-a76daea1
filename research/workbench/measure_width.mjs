import { readFileSync } from "fs";
import path from "path";
const PUBLIC_DIR = "/home/user/zelda-arabic-magic-a76daea1/public";
globalThis.fetch = async (url) => {
  const p = path.join(PUBLIC_DIR, url.toString());
  return { ok: true, json: async () => JSON.parse(readFileSync(p, "utf-8")) };
};
const { ensurePlatTables } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap.ts");
const { reshapeArabic } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing.ts");
await ensurePlatTables();

// font_system.json glyphWidths, indexed by (charcode - 1) same as import script
const meta = JSON.parse(readFileSync("/home/user/decomps/pokeplatinum/res/fonts/font_system.json", "utf-8"));
const cm = (await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap.ts")).platCharmap();

function widthOf(text) {
  const shaped = reshapeArabic(text);
  let total = 0;
  const details = [];
  for (const ch of shaped) {
    const code = cm.toCode.get(ch);
    if (code === undefined) { details.push([ch, "MISSING"]); continue; }
    const w = meta.glyphWidths[code - 1];
    details.push([ch, w]);
    total += w;
  }
  return { total, details };
}

for (const [label, txt] of [
  ["CONTROL INFO (en)", "CONTROL INFO"],
  ["ADVENTURE INFO (en)", "ADVENTURE INFO"],
  ["NO INFO NEEDED (en)", "NO INFO NEEDED"],
  ["control (ar)", "معلومات التحكم"],
  ["adventure (ar)", "معلومات المغامرة"],
  ["noinfo (ar)", "لا حاجة لمعلومات"],
]) {
  const r = widthOf(txt);
  console.log(label, "-> total px:", r.total);
}
