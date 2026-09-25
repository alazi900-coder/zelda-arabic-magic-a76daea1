import { reshapeArabic, stripDiacritics } from "@/lib/arabic-processing";
const s = stripDiacritics("مرحبا بكم في اينازوما اليفن");
const shaped = reshapeArabic(s);
console.log("shaped:", shaped);
const uniq = [...new Set([...shaped].filter(c => c !== " "))];
console.log("unique count:", uniq.length);
for (const ch of uniq) console.log("  U+" + ch.codePointAt(0)!.toString(16).toUpperCase(), JSON.stringify(ch));
