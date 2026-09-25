import { readFileSync } from "fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
const rom = new Uint8Array(readFileSync(process.env.ROM!));
const stat = new Map<string, { real: number; literal: number; rows: number }>();
for (const r of readInazumaText(rom)) {
  const s = stat.get(r.source) ?? { real: 0, literal: 0, rows: 0 };
  s.rows++;
  if (r.text.includes("\n")) s.real++;
  if (r.text.includes("\\n")) s.literal++;
  stat.set(r.source, s);
}
console.log([...stat]);
