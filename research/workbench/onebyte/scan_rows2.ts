import { readFileSync } from "fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
const rom = new Uint8Array(readFileSync(process.env.ROM!));
const rows = readInazumaText(rom);
const dec = new TextDecoder("shift_jis");
const seen = new Map<string, number>();
const bySrc = new Map<string, number>();
for (const r of rows) {
  const t = r.text;
  let hi = 0, ascii = 0, other = false;
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); if (c >= 0x80) hi++; else if (c >= 0x41) ascii++; }
  if (!hi || ascii <= hi * 2) continue;
  bySrc.set(r.source, (bySrc.get(r.source) ?? 0) + 1);
  const bytes = Uint8Array.from(t, (c) => c.charCodeAt(0));
  const s = dec.decode(bytes).replace(/\d+/g, "#");
  const k = `${r.source}: ${s.slice(0, 100)}`;
  seen.set(k, (seen.get(k) ?? 0) + 1);
}
console.log([...bySrc].join(" "));
for (const [k, v] of [...seen].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(v, k);
