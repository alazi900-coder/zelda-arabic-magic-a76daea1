import { readFileSync, writeFileSync } from "fs";
import { patchInazumaFont8 } from "@/lib/inazuma/inazuma-arabic-font";
const S = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/";
writeFileSync(S + "shiar/FONT8.NFTR", patchInazumaFont8(new Uint8Array(readFileSync(S + "inazuma/fontfiles/FONT8.NFTR"))));
