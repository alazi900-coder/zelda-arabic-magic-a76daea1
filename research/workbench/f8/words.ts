import { processArabicText } from "@/lib/arabic-processing";
const words = ["إندو", "كابياما", "كوريماتسو", "هاندا", "نادي كرة القدم", "أكاديمية رويال", "غرفة الملابس", "محطة إينازوما", "هل هذا صحيح؟", "اختر خانة الحفظ", "شيشيدو", "ظهر الضفة", "لا بأس، الآن"];
console.log(JSON.stringify(words.map((w) => [...processArabicText(w)].map((c) => c.codePointAt(0)))));
