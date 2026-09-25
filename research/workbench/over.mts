import { readFileSync } from "node:fs";
import { extractPkmEntries, buildPkmRom } from "./src/lib/pokemon/pkm-editor-bridge";
import { ensureEmeraldSourceSlots } from "./src/lib/gba/emerald-source-slots";
const slotsJson = readFileSync("public/pokeemerald-slots.json", "utf-8");
globalThis.fetch = (async () => ({ ok: true, json: async () => JSON.parse(slotsJson) })) as never;
const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeemerald-en/pokeemerald.gba"));
await ensureEmeraldSourceSlots(rom);
const { entries } = extractPkmEntries(rom, "emerald-source");
const tr = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const r = buildPkmRom(rom, tr, { game: "emerald-source", relocate: true });
if ("error" in r) throw new Error(r.error);
console.log("المتجاوزة:", r.tooLong.length);
for (const t of r.tooLong.slice(0, 12)) {
  const e = entries.find((x) => x.index === t.offset)!;
  console.log(`  +${t.needed - t.capacity}  ${e?.msbtFile}  ${JSON.stringify((e?.original ?? "").slice(0, 55))}`);
}
