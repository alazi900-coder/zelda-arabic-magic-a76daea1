import { readFileSync } from "node:fs";
import { ndsFileIdByPath, ndsFiles } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
const byPath = ndsFileIdByPath(rom); const files = ndsFiles(rom);
const dec = new TextDecoder("latin1");
const f = files[byPath.get("ev/EV_TT.p2")!];
const buf = rom.subarray(f.start, f.end);
// امشِ على السلاسل وجمّع العناقيد: سلاسل لغة طبيعية متتالية يفصلها حشو قصير
type Str = { at: number; end: number; text: string };
const strs: Str[] = [];
let s = -1;
for (let i = 0; i <= buf.length; i++) {
  const b = i < buf.length ? buf[i] : 0;
  const pr = b >= 0x20 && b !== 0x7f;
  if (pr) { if (s < 0) s = i; continue; }
  if (s >= 0 && b === 0 && i - s >= 4) {
    const t = dec.decode(buf.subarray(s, i));
    if (/[A-Za-zÀ-ÿ]{3}/.test(t) && /[ .,!?]/.test(t)) strs.push({ at: s, end: i, text: t });
  }
  s = -1;
}
// عنقود = سلاسل متتالية الفجوة بينها ≤ 4 بايت
const clusters: Str[][] = [];
let cur: Str[] = [];
for (const st of strs) {
  if (cur.length && st.at - cur[cur.length - 1].end > 4) { clusters.push(cur); cur = []; }
  cur.push(st);
}
if (cur.length) clusters.push(cur);
const sizes = new Map<number, number>();
for (const c of clusters) sizes.set(c.length, (sizes.get(c.length) ?? 0) + 1);
console.log("توزيع حجم العناقيد (عدد السلاسل في العنقود):");
for (const [n, count] of [...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${n} سلاسل → ${count} عنقوداً`);
const five = clusters.filter((c) => c.length === 5);
console.log(`\nعناقيد من خمس: ${five.length} من ${clusters.length}`);
if (five.length) {
  const budgets = five.map((c) => c[c.length - 1].end - c[0].at);
  const en = five.map((c) => Math.max(...c.map((x) => x.text.length)));
  budgets.sort((a, b) => a - b);
  console.log(`مساحة العنقود كاملاً: وسيط=${budgets[Math.floor(budgets.length / 2)]} بايت`);
  console.log("\nمثال عنقود:");
  five[3].forEach((x, i) => console.log(`   [${i}] ${JSON.stringify(x.text.replace(/\n/g, "·").slice(0, 55))}`));
}
