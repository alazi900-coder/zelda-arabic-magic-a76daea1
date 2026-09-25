// Broad regression sweep (corrected): every real \f-bearing English line,
// given a synthetic Arabic translation in the EDITOR's own convention --
// a real newline character for \n, literal "\f" for the page break -- which
// is exactly what buildInazumaRom passes in production (editorTranslation,
// never pre-converted). Checks the structural invariant that was broken
// before this fix: encoding the whole message equals encoding each printed
// segment alone and gluing with the literal break characters.
import { readFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { prepareInazumaLine } from "@/lib/inazuma/inazuma-editor-bridge";
import { isInazumaTranslatable } from "@/lib/inazuma/inazuma-tags";

const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = readInazumaText(rom).filter((r) => isInazumaTranslatable(r.text) && r.text.includes("\\f"));
console.log("rows with \\f:", rows.length);

const WORDS = ["كلمة", "جملة", "عربية", "أخرى", "هنا", "الآن"];
let checked = 0, nullEncoded = 0, mismatched = 0, threw = 0;
const badSamples: string[] = [];

for (const row of rows) {
  // ROM-literal segments: prose pieces and the literal "\n"/"\f" tokens between them.
  const segments = row.text.split(/(\\n|\\f)/);
  let wi = 0;
  const proseFor = (seg: string) => {
    const n = Math.max(1, Math.min(4, seg.trim().split(/\s+/).length));
    return Array.from({ length: n }, () => WORDS[wi++ % WORDS.length]).join(" ");
  };
  // Editor form: "\n" (rom-literal) becomes a REAL newline; "\f" stays literal.
  const editorSegments = segments.map((seg) => seg === "\\n" ? "\n" : seg === "\\f" ? seg : proseFor(seg));
  const translation = editorSegments.join("");

  checked++;
  try {
    const whole = prepareInazumaLine(row.text, translation, undefined);
    if (whole.encoded === null) { nullEncoded++; if (badSamples.length < 3) badSamples.push(`NULL: ${row.text.slice(0,50)}`); continue; }

    // Re-derive the SAME per-segment prose (word-gen must be deterministic and
    // replayed in the same order) and encode each alone.
    let wi2 = 0;
    const proseFor2 = (seg: string) => {
      const n = Math.max(1, Math.min(4, seg.trim().split(/\s+/).length));
      return Array.from({ length: n }, () => WORDS[wi2++ % WORDS.length]).join(" ");
    };
    const rebuilt = segments.map((seg) => {
      if (seg === "\\n" || seg === "\\f") return seg;
      const text = proseFor2(seg);
      return prepareInazumaLine("x", text, undefined).encoded ?? "";
    }).join("");

    if (rebuilt !== whole.encoded) {
      mismatched++;
      if (badSamples.length < 3) badSamples.push(`MISMATCH: ${row.text.slice(0,60)}`);
    }
  } catch (e) {
    threw++;
    if (badSamples.length < 3) badSamples.push(`THREW: ${row.text.slice(0,50)} :: ${(e as Error).message}`);
  }
}
console.log({ checked, threw, nullEncoded, mismatched });
badSamples.forEach((s) => console.log(" ", s));
