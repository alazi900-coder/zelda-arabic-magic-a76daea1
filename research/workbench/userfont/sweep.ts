// Broad regression sweep: every real \f-bearing English line in the cartridge,
// fed a synthetic Arabic translation with the same break structure, run
// through the real prepareInazumaLine. Checks:
//  1. no throw
//  2. the "\f"/"\n" counts survive unchanged
//  3. the structural invariant: encoding the whole multi-segment translation
//     equals encoding each segment alone and gluing with the literal token --
//     the exact property that was broken before this fix.
import { readFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { prepareInazumaLine } from "@/lib/inazuma/inazuma-editor-bridge";
import { isInazumaTranslatable } from "@/lib/inazuma/inazuma-tags";

const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = readInazumaText(rom).filter((r) => isInazumaTranslatable(r.text) && r.text.includes("\\f"));
console.log("rows with \\f:", rows.length);

const WORDS = ["كلمة", "جملة", "عربية", "أخرى", "هنا", "الآن"];
let checked = 0, mismatched = 0, threw = 0, countMismatch = 0;
for (const row of rows) {
  // segment the ORIGINAL by \n and \f, build an arabic segment of matching
  // "shape" (multi-word) for each, then glue with the SAME break characters
  // in the SAME positions -- so validateInazumaTags always passes.
  const segments = row.text.split(/(\\n|\\f)/);
  let wi = 0;
  const translation = segments.map((seg) => {
    if (seg === "\\n" || seg === "\\f") return seg;
    const n = Math.max(1, Math.min(4, seg.trim().split(/\s+/).length));
    const words = Array.from({ length: n }, () => WORDS[wi++ % WORDS.length]);
    return words.join(" ");
  }).join("");

  checked++;
  try {
    const whole = prepareInazumaLine(row.text, translation, undefined);
    if (whole.encoded === null) { mismatched++; continue; }
    const nCount = (whole.encoded.match(/\\n/g) ?? []).length;
    const fCount = (whole.encoded.match(/\\f/g) ?? []).length;
    const expectN = (row.text.match(/\\n/g) ?? []).length;
    const expectF = (row.text.match(/\\f/g) ?? []).length;
    if (nCount !== expectN || fCount !== expectF) countMismatch++;

    // structural invariant: whole vs per-segment
    const perSeg = segments.map((seg) => (seg === "\\n" || seg === "\\f") ? seg : null);
    let wi2 = 0;
    const rebuilt = segments.map((seg) => {
      if (seg === "\\n" || seg === "\\f") return seg;
      const n = Math.max(1, Math.min(4, seg.trim().split(/\s+/).length));
      const words = Array.from({ length: n }, () => WORDS[wi2++ % WORDS.length]);
      const enc = prepareInazumaLine("x", words.join(" "), undefined).encoded;
      return enc ?? "";
    }).join("");
    if (rebuilt !== whole.encoded) mismatched++;
  } catch (e) {
    threw++;
    if (threw <= 3) console.log("THREW:", row.text.slice(0, 60), (e as Error).message);
  }
}
console.log({ checked, threw, mismatched, countMismatch });
