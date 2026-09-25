import { readFileSync, writeFileSync } from "node:fs";
import { readInazumaText, writeInazumaText } from "@/lib/inazuma/inazuma-rom";
import { prepareInazumaLine, markInazumaRtlLines } from "@/lib/inazuma/inazuma-editor-bridge";
import { blankInazumaGlyph, addInazumaByteMap } from "@/lib/inazuma/inazuma-arabic-font";
import { patchInazumaRtl, INAZUMA_RTL_MARKER_CODE } from "@/lib/inazuma/inazuma-rtl-patch";
import { findNdsFile, writeNdsFile } from "@/lib/nds/nds-rom";
const SP = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
let rom = new Uint8Array(readFileSync(`${SP}/shiar/faragh.nds`));
const want: Record<string, string> = {
  "Come on! Let's do some practice!": "هيا! لنتدرب قليلاً!",
  "Practice?": "نتدرب؟",
  "Yeah! We should always be match ready!": "نعم! يجب أن نكون مستعدين\nللمباراة دائماً!",
};
const rows = readInazumaText(rom).map((r) => {
  if (r.source !== "evet" || !want[r.text]) return r;
  const line = prepareInazumaLine(r.text, want[r.text], r.limit);
  if (!line.encoded) throw new Error("refused " + r.text);
  return { ...r, text: markInazumaRtlLines(line.encoded) };
});
rom = writeInazumaText(rom, rows).rom;
// The handmade glyphs are already in these fonts: only the marker and the one-byte map are added.
for (const f of ["FONT12", "FONT12N", "FONT12T", "FONT8"]) {
  const file = findNdsFile(rom, `data_iz/font/${f}.NFTR`)!;
  let font = blankInazumaGlyph(rom.subarray(file.start, file.end), INAZUMA_RTL_MARKER_CODE);
  if (f !== "FONT12T") font = addInazumaByteMap(font);
  rom = writeNdsFile(rom, file, font);
}
rom = patchInazumaRtl(rom);
writeFileSync(`${SP}/shiar/Inazuma-BYTE1-DEMO.nds`, rom);
console.log("ok", rom.length);
