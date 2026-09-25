import { readFileSync } from "fs";
import { findNdsFile } from "@/lib/nds/nds-rom";
import { parseNarc, buildNarc } from "@/lib/nds/narc";
const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
const f = findNdsFile(rom, "msgdata/pl_msg.narc")!;
const raw = rom.subarray(f.start, f.end);
const narc = parseNarc(raw);
const out = buildNarc(narc);
console.log("orig", raw.length, "rebuilt", out.length);
let d = 0;
for (let i = 0; i < Math.min(raw.length, out.length); i++) if (raw[i] !== out[i]) { if (d++ < 8) console.log("diff @0x" + i.toString(16), raw[i], "vs", out[i]); }
console.log("total diffs:", d);
console.log("orig hdr", [...raw.slice(0, 32)].map(b => b.toString(16).padStart(2,"0")).join(" "));
console.log("new  hdr", [...out.slice(0, 32)].map(b => b.toString(16).padStart(2,"0")).join(" "));
console.log("btnf len", narc.btnf.length, [...narc.btnf].map(b=>b.toString(16).padStart(2,"0")).join(" "));
