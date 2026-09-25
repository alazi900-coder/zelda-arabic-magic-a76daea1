import { processArabicText } from "@/lib/arabic-processing";
const show = (s: string) => JSON.stringify(s.replace(/[^\x00-\x7f]/g, "·"));
for (const t of ["شخص ما...\\fإنها كذبة", "حصلت على %d نقطة", "مرحبا %s كيف", "نقاط %1F هنا"]) console.log(show(t), "->", show(processArabicText(t)));
