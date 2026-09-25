import { readFileSync, writeFileSync } from "node:fs";
import { findNdsFile, writeNdsFile } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/PokemonPlatinum_base_menufont.nds`));
const slot = findNdsFile(rom, "graphic/pl_font.narc")!;
const narc = new Uint8Array(readFileSync(`${SCR}/pl_font_surgical.narc`));
writeFileSync(`${SCR}/PokemonPlatinum_base_fonts_v4.nds`, writeNdsFile(rom, slot, narc));
console.log("كُتب الروم، ملف الخط:", slot.start, "…", slot.end, "حجم جديد:", narc.length);
