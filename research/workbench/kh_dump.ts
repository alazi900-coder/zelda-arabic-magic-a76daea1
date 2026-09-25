import { readFileSync } from "node:fs";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const buf = new Uint8Array(readFileSync(`${SCR}/kh358/EV_TT.p2`));
const from = Number(process.argv[2] ?? 18290), to = Number(process.argv[3] ?? 18620);
for (let r = from; r < to; r += 16) {
  const row = buf.subarray(r, r + 16);
  const hex = [...row].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const asc = [...row].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
  console.log(`${r.toString().padStart(6)}  ${hex.padEnd(47)}  ${asc}`);
}
