import { readFileSync } from "node:fs";
import { ndsFileIdByPath } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const paths = [...ndsFileIdByPath(rom).keys()];
const pat = new RegExp(process.argv[3] ?? ".", "i");
const hit = paths.filter((p) => pat.test(p));
console.log(`${hit.length} of ${paths.length}`);
hit.slice(0, 40).forEach((p) => console.log("  " + p));
