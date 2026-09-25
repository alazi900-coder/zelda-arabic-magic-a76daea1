import { reshapeArabic } from "@/lib/arabic-processing";
const s = "مرحباً بكم في اينازوما اليفن";
const shaped = reshapeArabic(s);
console.log("shaped:", shaped);
console.log("codepoints:");
for (const ch of shaped) {
  console.log("  U+" + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0"), JSON.stringify(ch));
}
