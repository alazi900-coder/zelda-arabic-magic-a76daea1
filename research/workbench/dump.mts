import { readFileSync, writeFileSync } from "node:fs";
import { extractPkmEntries } from "./src/lib/pokemon/pkm-editor-bridge";
import { toLogicalArabic } from "./src/lib/gba/emerald-source-arabic";

const out: Record<string, unknown> = {};
for (const [tag, path] of [["en", "/home/user/decomps/pokeemerald-en/pokeemerald.gba"],
                           ["ar", "/home/user/decomps/pokeemerald/pokeemerald.gba"]] as const) {
  const rom = new Uint8Array(readFileSync(path));
  const { entries } = extractPkmEntries(rom, "emerald-source");
  out[tag] = entries.map((e) => ({
    f: e.msbtFile,
    o: e.index,
    t: tag === "ar" ? toLogicalArabic(e.original) : e.original,
    raw: e.original,
    m: e.maxBytes,
  }));
  console.log(tag, entries.length);
}
writeFileSync(process.argv[2], JSON.stringify(out));
