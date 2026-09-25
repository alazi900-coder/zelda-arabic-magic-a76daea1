import { processArabicText } from "@/lib/arabic-processing";
const words = JSON.parse(process.env.WORDS!);
console.log(JSON.stringify(words.map((w: string) => [...processArabicText(w)].map((c) => c.codePointAt(0)))));
