import { readFileSync, writeFileSync } from "fs";
import { patchInazumaFont8, patchInazumaFont12, addInazumaByteMap } from "@/lib/inazuma/inazuma-arabic-font";
const d = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles/";
writeFileSync(d + "../../onebyte/F8.NFTR", addInazumaByteMap(patchInazumaFont8(new Uint8Array(readFileSync(d + "FONT8.NFTR")))));
writeFileSync(d + "../../onebyte/F12.NFTR", addInazumaByteMap(patchInazumaFont12(new Uint8Array(readFileSync(d + "FONT12.NFTR")))));
