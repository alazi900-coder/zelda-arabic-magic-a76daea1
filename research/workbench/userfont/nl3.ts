import { prepareInazumaLine } from "@/lib/inazuma/inazuma-editor-bridge";

const original = "I've heard rumours that Miss Natsumi's fallen in love with someone...\\fIt's a lie! Tell me it's not true";
// three real editor lines, then a \f page break, matching what a translator would type
const translation = "سمعت شائعات أن النادي\nسيحل على أي حال. لا\nفائدة من الحماس الآن...\\fإنها كذبة! قل لي إنها غير صحيحة!";

const r = prepareInazumaLine(original, translation, undefined, false);
console.log("encoded is null:", r.encoded === null, "brokenTag:", r.brokenTag);
if (r.encoded) {
  // show the raw ROM bytes' ASCII skeleton: real \n should never appear (real
  // newline is invalid in this ROM encoding), and \f / n\ must not appear
  const skeleton = r.encoded.replace(/[^\x00-\x7f]/g, "·");
  console.log("skeleton:", JSON.stringify(skeleton));
  console.log("contains real newline (bad):", r.encoded.includes("\n"));
  console.log("contains literal \\n in order:", r.encoded.includes("\\n"));
  console.log("contains literal \\f in order:", r.encoded.includes("\\f"));
  console.log("contains reversed n\\  (bad):", r.encoded.includes("n\\"));
  console.log("contains reversed f\\  (bad):", r.encoded.includes("f\\"));
  // split by \f into the two dialogue boxes and print each's line order via skeleton
  const boxes = skeleton.split("\\f");
  boxes.forEach((b, i) => console.log(`box ${i}:`, JSON.stringify(b)));
}
