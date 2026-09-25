import { readFileSync } from "fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
const rom = new Uint8Array(readFileSync(process.env.ROM!));
for (const r of readInazumaText(rom)) {
  const t = r.text;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if ((c >= 0x81 && c <= 0x9f) || (c >= 0xe0 && c <= 0xfc)) { i++; continue; }
    if (c === 0xb9 || c === 0xc0) console.log(r.source, r.entry, r.key, c.toString(16), JSON.stringify(t.slice(Math.max(0, i - 40), i + 20)));
  }
}
