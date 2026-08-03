/**
 * إسكان العربية في خانات خطّ اللعبة — أيّ شكلٍ يركب أيّ خانة
 *
 * خطّ هذه اللعبة ٩٣ خانة، من الحرف ٣٣ (`!`) إلى ١٢٥ (`}`) — مقروءةً من
 * معاملات `font_add_sprite` نفسها. ولا سبيل إلى الزيادة عليها: توسيع
 * الصورة يعني تكبير `SPRT` و`TPAG` وهما في وسط الملف يليهما عشرة أقسام
 * بعناوين مطلقة. فالعربية تسكن ما هو موجود.
 *
 * والعربية بأشكالها الأربعة (مفرد ونهائي وابتدائي ووسطي) تحتاج نحو ١٤٠
 * خانة، فلا تتّسع. غير أنّ الشكلين الابتدائي والوسطي لا يفترقان — في خطٍّ
 * ارتفاعه عشرة بكسلات — إلا بوصلةٍ عن اليمين مقدارها بكسل واحد، وكذلك
 * المفرد والنهائي. فتُطوى الأربعة إلى **شكلين**:
 *
 *   - شكلٌ **يصل بما بعده** (الابتدائي والوسطي)
 *   - شكلٌ **لا يصل بما بعده** (المفرد والنهائي)
 *
 * والقسمة ليست بالنظر إلى الرسم بل من جداول التشكيل نفسها عبر
 * `arabicFormJoining`، فلا تختلف عمّا يُخرجه المُشكِّل أبداً.
 *
 * وما يبقى من الخانات محفوظ لما تحتاجه العربية أيضاً: الأرقام، وعلامات
 * الترقيم، والرموز الثلاثة الأخيرة التي ترسمها اللعبة أعلاماً وعملةً.
 */

import {
  arabicFormJoining,
  getPresentationFormsForLetter,
  shapeArabicForRisen,
  RISEN_ARABIC_QMARK_ALIAS,
} from "@/lib/risen/arabic-shaper";

/** أوّل خانة في الخطّ وآخرها، كما يقولها نداء اللعبة. */
export const GM_FIRST_CHAR = 33;
export const GM_LAST_CHAR = 125;

/**
 * خانات تبقى على حالها.
 *
 * الأرقام لأنّ النصّ يذكرها، وعلامات الترقيم لأنّ العربية تستعملها كما هي،
 * والثلاثة الأخيرة لأنّها ليست حروفاً أصلاً بل رموز ترسمها اللعبة.
 */
export const GM_RESERVED_CHARS: number[] = [
  ...[..."0123456789"].map((c) => c.charCodeAt(0)),
  ...[..."!%'(),-.:;?"].map((c) => c.charCodeAt(0)),
  123, 124, 125,
];

/** الحروف العربية التي يعرفها المُشكِّل، بأصولها. */
const ARABIC_BASE_LETTERS = (() => {
  const out: number[] = [];
  for (let base = 0x0621; base <= 0x064a; base++) out.push(base);
  return out;
})();

/** ما تحمله العربية من علامات تُكتب بخانة لاتينية موجودة. */
const DIRECT_EQUIVALENTS: Record<number, number> = {
  0x060c: ",".charCodeAt(0),
  0x061b: ";".charCodeAt(0),
  [RISEN_ARABIC_QMARK_ALIAS]: "?".charCodeAt(0),
};

export interface GmCarrierMap {
  /** لكل شكل عربي: الخانة التي يسكنها. */
  carrierOf: Map<number, number>;
  /** لكل خانة مسكونة: أشكال العربية التي ترسمها — واحدٌ إلا للمتطابقات. */
  formsOf: Map<number, number[]>;
  /** الخانات التي بقيت فارغة بعد الإسكان. */
  spare: number[];
}

/**
 * يوزّع الأشكال العربية على الخانات المتاحة.
 *
 * التوزيع مرتّب لا عشوائي: الشكل نفسه يأخذ الخانة نفسها في كل بناء، فالنصّ
 * المبني بالأمس يقرؤه خطّ اليوم.
 */
export function buildGmCarrierMap(): GmCarrierMap {
  // الشكل يُعرَف بأصله وبهل يصل بما بعده — فينطوي الابتدائي مع الوسطي،
  // والمفرد مع النهائي.
  const byKey = new Map<string, number[]>();
  for (const base of ARABIC_BASE_LETTERS) {
    for (const form of getPresentationFormsForLetter(base)) {
      if (form === base) continue; // حرف لا تشكيل له
      const key = `${base}:${arabicFormJoining(form).after ? "A" : "B"}`;
      const list = byKey.get(key);
      if (list) list.push(form);
      else byKey.set(key, [form]);
    }
  }

  const free = [...Array(GM_LAST_CHAR - GM_FIRST_CHAR + 1)]
    .map((_, i) => GM_FIRST_CHAR + i)
    .filter((c) => !GM_RESERVED_CHARS.includes(c));

  const keys = [...byKey.keys()].sort();
  if (keys.length > free.length) {
    throw new Error(`العربية تحتاج ${keys.length} خانة والمتاح ${free.length}`);
  }

  const carrierOf = new Map<number, number>();
  const formsOf = new Map<number, number[]>();
  keys.forEach((key, i) => {
    const carrier = free[i];
    const forms = byKey.get(key)!;
    for (const form of forms) carrierOf.set(form, carrier);
    formsOf.set(carrier, forms);
  });
  for (const [from, to] of Object.entries(DIRECT_EQUIVALENTS)) carrierOf.set(Number(from), to);

  return { carrierOf, formsOf, spare: free.slice(keys.length) };
}

/**
 * يحوّل نصّاً عربياً إلى حروف الخانات التي ترسمه.
 *
 * التشكيل والقلب من مُشكِّل Risen نفسه — اللعبتان تشتركان في العلّة نفسها:
 * محرّكٌ يرسم من اليسار ولا يعرف العربية. فيُشكَّل النصّ ويُقلب ثم تُبدَّل
 * رموزه بخانات الخطّ.
 *
 * وما لا خانة له — حرف لاتيني بقيت خانته للعربية، أو رمزٌ غريب — يسقط،
 * لأنّ رسمه سيكون حرفاً عربياً في غير موضعه.
 */
export function encodeArabicForGm(text: string, map: GmCarrierMap): string {
  const shaped = shapeArabicForRisen(text);
  let out = "";
  for (const character of shaped) {
    const code = character.codePointAt(0)!;
    if (code === 0x0a || code === 0x0d || code === 0x20) {
      out += character;
      continue;
    }
    const carrier = map.carrierOf.get(code);
    if (carrier !== undefined) {
      out += String.fromCharCode(carrier);
      continue;
    }
    // ما تبقّى من الخانات على حاله يُكتب كما هو.
    if (GM_RESERVED_CHARS.includes(code)) out += character;
  }
  return out;
}
