import { readFileSync } from "node:fs";
import { ndsFileIdByPath } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const byPath = ndsFileIdByPath(rom);
console.log("paths:", byPath.size);
const hits = [...byPath.keys()].filter((p) => /MTSIni|STSIni/i.test(p));
console.log("SPF-ish:", hits.length);
hits.slice(0, 20).forEach((p) => console.log("  ", p));
