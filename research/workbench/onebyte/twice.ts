import { processArabicText } from "@/lib/arabic-processing";
const t = "هيا لنتدرب قليلا";
const once = processArabicText(t);
const twice = processArabicText(once);
console.log(JSON.stringify(once), [...once].map(c=>c.codePointAt(0)!.toString(16)).join(" "));
console.log(JSON.stringify(twice), once === twice);
