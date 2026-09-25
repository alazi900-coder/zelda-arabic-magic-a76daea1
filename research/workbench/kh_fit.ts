import { readFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { ensurePlatTables } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { extractPlatEntries } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge";
import { processArabicText } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing";
import { ndsFileIdByPath, ndsFiles } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const UP = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b";
main();
async function main() {
  await ensurePlatTables();
  // ١) بناء توزيع النِّسب مشروطاً بطول السطر الإنجليزي
  const platRom = new Uint8Array(readFileSync(`${SCR}/base_font3.nds`));
  const orig = new Map<string, string>();
  for (const e of extractPlatEntries(platRom).entries) orig.set(`${e.msbtFile}:${e.index}`, e.original);
  const tr: Record<string, string> = JSON.parse(readFileSync(`${UP}/803aa87a-_____________.json`, "utf8"));
  const TAG = /\{[^}]*\}|[▼▽]/g;
  const bucketOf = (n: number) => Math.min(9, Math.floor(Math.log2(Math.max(4, n)) - 2)); // 4-8,8-16,...
  const buckets = new Map<number, number[]>();
  for (const [key, arabic] of Object.entries(tr)) {
    const english = orig.get(key);
    if (!english || !arabic.trim()) continue;
    const en = english.replace(TAG, "").replace(/\s+/g, " ").trim();
    if (en.length < 4) continue;
    const ar = processArabicText(arabic.replace(TAG, ""), { mirrorPunct: true }).replace(/\s+/g, " ").trim();
    if (!ar) continue;
    const b = bucketOf(en.length);
    (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(ar.length / en.length);
  }

  // ٢) أطوال السطور الإنجليزية في KH358
  const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
  const byPath = ndsFileIdByPath(rom); const files = ndsFiles(rom);
  const dec = new TextDecoder("latin1");
  const EN = /\b(the|you|your|and|is|was|that|for|with|have|this|what|but|not|are)\b/gi;
  const OTHER = /\b(der|die|das|und|ist|nicht|che|per|non|una|dans|vous|est|pas|para|que|con|los|sono|sei)\b/gi;
  const lens: number[] = []; const slack: number[] = [];
  for (const [path, id] of byPath) {
    if (!path.startsWith("ev/") || !path.endsWith(".p2")) continue;
    const f = files[id]; const buf = rom.subarray(f.start, f.end);
    let s = -1;
    for (let i = 0; i <= buf.length; i++) {
      const b = i < buf.length ? buf[i] : 0;
      const pr = b >= 0x20 && b !== 0x7f;
      if (pr) { if (s < 0) s = i; continue; }
      if (s >= 0 && b === 0 && i - s >= 6) {
        const t = dec.decode(buf.subarray(s, i));
        if (/[A-Za-zÀ-ÿ]{3}/.test(t) && (t.match(EN) ?? []).length > (t.match(OTHER) ?? []).length) {
          let z = i; while (z < buf.length && buf[z] === 0) z++;
          lens.push(i - s); slack.push(z - i - 1);
        }
      }
      s = -1;
    }
  }
  console.log(`سطور إنجليزية مقيسة في KH358: ${lens.length}`);

  // ٣) محاكاة: لكل سطر، اسحب نِسباً من دلو طوله
  const BYTES_PER_ARABIC_CHAR = Number(process.argv[2] ?? 2);
  let trials = 0, over = 0, overNoSlack = 0; const overBy: number[] = [];
  for (let idx = 0; idx < lens.length; idx++) {
    const L = lens[idx]; const budget = L + slack[idx];
    const pool = buckets.get(bucketOf(L)) ?? buckets.get(5)!;
    for (let k = 0; k < 20; k++) {
      const r = pool[Math.floor(Math.random() * pool.length)];
      const need = Math.ceil(L * r) * BYTES_PER_ARABIC_CHAR;
      trials++;
      if (need > L) overNoSlack++;
      if (need > budget) { over++; overBy.push(need - budget); }
    }
  }
  overBy.sort((a, b) => a - b);
  console.log(`\nبايتات لكل حرف عربي: ${BYTES_PER_ARABIC_CHAR}`);
  console.log(`بلا استغلال المساحة الحرّة : ${((overNoSlack / trials) * 100).toFixed(1)}% لا تتّسع`);
  console.log(`مع استغلال المساحة الحرّة  : ${((over / trials) * 100).toFixed(1)}% لا تتّسع`);
  if (overBy.length) {
    console.log(`عند التجاوز، كم بايتاً ينقص؟  وسيط=${overBy[Math.floor(overBy.length / 2)]}  90%=${overBy[Math.floor(overBy.length * 0.9)]}  الأقصى=${overBy[overBy.length - 1]}`);
  }
  const shrink = (m: number) => ((lens.filter((L) => true).length && trials) ? 0 : 0);
}
