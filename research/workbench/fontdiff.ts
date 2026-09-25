import { readFileSync } from "node:fs";
import { parseNarc } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/narc";
import { createHash } from "node:crypto";
const U = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b";
const NAMES = ["font_system", "font_message", "font_subscreen", "font_unown", "m4", "m5", "m6", "m7"];
const h = (b: Uint8Array) => createHash("sha1").update(b).digest("hex").slice(0, 12);
for (const f of ["177e2181-pl_font.narc", "013b6aa9-pl_font.narc"]) {
  const n = parseNarc(new Uint8Array(readFileSync(`${U}/${f}`)));
  console.log(`\n=== ${f} — ${n.files.length} عضو ===`);
  n.files.forEach((b, i) => {
    const magic = String.fromCharCode(...b.subarray(0, 4));
    console.log(`  [${i}] ${(NAMES[i] ?? "?").padEnd(15)} ${String(b.length).padStart(7)} بايت  magic=${JSON.stringify(magic)}  sha=${h(b)}`);
  });
}
