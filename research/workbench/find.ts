import { readFileSync } from "fs";
import { ndsFileIdByPath, ndsFiles } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
const map = ndsFileIdByPath(rom);
console.log("files named:", map.size);
const files = ndsFiles(rom);
for (const [p, id] of map) if (/msg/.test(p)) console.log(p, "id", id, "size", files[id].end - files[id].start);
