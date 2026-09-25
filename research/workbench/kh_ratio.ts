import { readFileSync, writeFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { ensurePlatTables } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { extractPlatEntries } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge";
import { processArabicText } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const UP = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b";
main();
async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync(`${SCR}/base_font3.nds`));
  const orig = new Map<string, string>();
  for (const e of extractPlatEntries(rom).entries) orig.set(`${e.msbtFile}:${e.index}`, e.original);
  const tr: Record<string, string> = JSON.parse(readFileSync(`${UP}/803aa87a-_____________.json`, "utf8"));

  const TAG = /\{[^}]*\}|[▼▽]/g;
  const ratios: number[] = [];
  for (const [key, arabic] of Object.entries(tr)) {
    const english = orig.get(key);
    if (!english || !arabic.trim()) continue;
    const en = english.replace(TAG, "").replace(/\s+/g, " ").trim();
    if (en.length < 8) continue;
    // ما يكلّفه العربي فعلياً: الأشكال بعد التشكيل، بايت لكل حرف
    const ar = processArabicText(arabic.replace(TAG, ""), { mirrorPunct: true }).replace(/\s+/g, " ").trim();
    if (!ar) continue;
    ratios.push(ar.length / en.length);
  }
  ratios.sort((a, b) => a - b);
  const q = (p: number) => ratios[Math.floor(ratios.length * p)];
  console.log(`أزواج مقيسة: ${ratios.length}`);
  console.log(`نسبة العربي/الإنجليزي بالحروف:`);
  console.log(`  الوسيط (50%) : ${q(0.5).toFixed(3)}`);
  console.log(`  25% / 75%    : ${q(0.25).toFixed(3)} / ${q(0.75).toFixed(3)}`);
  console.log(`  90% / 95%    : ${q(0.9).toFixed(3)} / ${q(0.95).toFixed(3)}`);
  console.log(`  المتوسط      : ${(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(3)}`);
  console.log(`  نسبة ≤ 1.0   : ${((ratios.filter((r) => r <= 1).length / ratios.length) * 100).toFixed(1)}%`);
  writeFileSync(`${SCR}/kh358/ratios.json`, JSON.stringify(ratios));
}
