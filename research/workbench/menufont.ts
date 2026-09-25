import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { findNdsFile, writeNdsFile } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
import { parseNarc, buildNarc } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/narc";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const U = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b";
const h = (b: Uint8Array) => createHash("sha1").update(b).digest("hex").slice(0, 12);

const rom = new Uint8Array(readFileSync(`${SCR}/base_font3.nds`));
const slot = findNdsFile(rom, "graphic/pl_font.narc")!;
const inRom = rom.subarray(slot.start, slot.end);
const friend = new Uint8Array(readFileSync(`${U}/013b6aa9-pl_font.narc`));
console.log("خطّ الروم الحالي = خطّ صديقك؟", h(inRom) === h(friend) ? "نعم ✅" : `لا ❌ (${h(inRom)} ≠ ${h(friend)})`);

const narc = parseNarc(inRom);
console.log("قبل: font_system =", h(narc.files[0]), " font_message =", h(narc.files[1]));
narc.files[0] = narc.files[1].slice();          // خطّ القوائم ← خطّ الحوارات
const rebuilt = buildNarc(narc);
console.log("بعد: font_system =", h(narc.files[0]), " font_message =", h(narc.files[1]));
console.log("حجم الأرشيف: قبل", inRom.length, "بعد", rebuilt.length);

const out = writeNdsFile(rom, slot, rebuilt);
writeFileSync(`${SCR}/PokemonPlatinum_base_menufont.nds`, out);
console.log("كُتب الروم:", out.length, "بايت");
