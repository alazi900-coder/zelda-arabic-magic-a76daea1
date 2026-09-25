import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { findNdsFile, writeNdsFile } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
import { parseNarc, buildNarc } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/narc";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const h = (b: Uint8Array) => createHash("sha1").update(b).digest("hex").slice(0, 12);

const rom = new Uint8Array(readFileSync(`${SCR}/PokemonPlatinum_base_menufont.nds`));
const slot = findNdsFile(rom, "graphic/pl_font.narc")!;
const narc = parseNarc(rom.subarray(slot.start, slot.end));
console.log("قبل: [0]", h(narc.files[0]), " [1]", h(narc.files[1]), " [2]", h(narc.files[2]));
narc.files[2] = narc.files[1].slice();          // الشاشة السفلية ← خطّ الحوارات
const rebuilt = buildNarc(narc);
console.log("بعد: [0]", h(narc.files[0]), " [1]", h(narc.files[1]), " [2]", h(narc.files[2]));
console.log("حجم الأرشيف:", slot.end - slot.start, "→", rebuilt.length);
writeFileSync(`${SCR}/PokemonPlatinum_base_allfonts.nds`, writeNdsFile(rom, slot, rebuilt));
console.log("كُتب الروم");
