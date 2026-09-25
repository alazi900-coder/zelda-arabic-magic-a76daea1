import { readFileSync, writeFileSync } from "fs";
import { patchInazumaFont8, addInazumaByteMap } from "@/lib/inazuma/inazuma-arabic-font";
const S = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/";
const site = patchInazumaFont8(new Uint8Array(readFileSync(S + "inazuma/fontfiles/FONT8.NFTR")));
const sh = new Uint8Array(readFileSync(S + "onebyte/SH8.NFTR"));
let diff = 0; for (let i = 0; i < site.length; i++) if (site[i] !== sh[i]) diff++;
console.log("site vs shiar FONT8 diff bytes", diff);
writeFileSync(S + "onebyte/SH8M.NFTR", addInazumaByteMap(sh));
