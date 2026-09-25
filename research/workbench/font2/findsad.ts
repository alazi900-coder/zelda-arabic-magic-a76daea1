import { readFileSync } from "node:fs";
import { listNdsFiles } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const files = listNdsFiles(rom);
console.log("files:", files.length);
for (const f of files) if (/\.SAD|op00|sound|snd/i.test(f.path)) console.log("  ", f.path, f.end - f.start);
