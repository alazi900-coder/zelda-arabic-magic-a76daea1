import { readFileSync } from "fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
const rom = new Uint8Array(readFileSync(process.env.ROM!));
const rows = readInazumaText(rom);
const leadEn = new Map<number, number>(), leadJp = new Map<number, number>();
const codesEn = new Map<number, number>();
let en = 0, jp = 0, single = new Map<number,number>();
const examples: string[] = [];
for (const r of rows) {
  const t = r.text;
  let hi = 0, ascii = 0;
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); if (c >= 0x80) hi++; else if (c >= 0x41) ascii++; }
  if (!hi) continue;
  const isEn = ascii > hi * 2; // mostly Latin letters
  if (isEn) en++; else jp++;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if ((c >= 0x81 && c <= 0x9f) || (c >= 0xe0 && c <= 0xfc)) {
      const code = (c << 8) | t.charCodeAt(i + 1);
      (isEn ? leadEn : leadJp).set(c, ((isEn ? leadEn : leadJp).get(c) ?? 0) + 1);
      if (isEn) codesEn.set(code, (codesEn.get(code) ?? 0) + 1);
      i++;
    } else if (c >= 0x80) single.set(c, (single.get(c) ?? 0) + 1);
  }
  if (isEn && examples.length < 25) examples.push(`${r.source}:${r.entry}:${r.key} ${JSON.stringify(t.slice(0, 90))}`);
}
const fmt = (m: Map<number, number>) => [...m].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k.toString(16)}:${v}`).join(" ");
console.log("rows", rows.length, "en-with-sjis", en, "jp", jp);
console.log("lead EN", fmt(leadEn));
console.log("lead JP", fmt(leadJp));
console.log("codes EN", fmt(codesEn));
console.log("single-byte hi", fmt(single));
console.log(examples.join("\n"));
