import { encodeGtaIvArabicText } from "@/lib/gtaiv/gxt-format";
const u = (s: string) => Array.from(encodeGtaIvArabicText("", s).textUnits);
for (const w of ["ي", "بي", "يب", "بيب", "خيارات"]) console.log(JSON.stringify(w), u(w));
const e = encodeGtaIvArabicText("Press ~INPUT_PICKUP~ to leave", "اضغط ~INPUT_PICKUP~ للخروج");
console.log("units:", Array.from(e.textUnits).join(" "));
const n = encodeGtaIvArabicText("A~n~B", "الأول~n~الثاني");
console.log("newline units:", Array.from(n.textUnits).join(" "));
