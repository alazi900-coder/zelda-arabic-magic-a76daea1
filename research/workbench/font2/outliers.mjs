import { M3_MAP, m3Px, IZ_CPS, bounds, formOf } from "./lib.mjs";
const M3_BASE = 7, B = Number(process.argv[2] ?? 6);
const NAMES = { 0xFE80:"hamza",0xFE81:"alef-madda",0xFE83:"alef-hamza-above",0xFE85:"waw-hamza",0xFE87:"alef-hamza-below",0xFE89:"yeh-hamza",0xFE8D:"alef",0xFE8F:"beh",0xFE93:"teh-marbuta",0xFE95:"teh",0xFE99:"theh",0xFE9D:"jeem",0xFEA1:"hah",0xFEA5:"khah",0xFEA9:"dal",0xFEAB:"thal",0xFEAD:"reh",0xFEAF:"zain",0xFEB1:"seen",0xFEB5:"sheen",0xFEB9:"sad",0xFEBD:"dad",0xFEC1:"tah",0xFEC5:"zah",0xFEC9:"ain",0xFECD:"ghain",0xFED1:"feh",0xFED5:"qaf",0xFED9:"kaf",0xFEDD:"lam",0xFEE1:"meem",0xFEE5:"noon",0xFEE9:"heh",0xFEED:"waw",0xFEEF:"alef-maksura",0xFEF1:"yeh",0xFEF5:"lam-alef-madda",0xFEF7:"lam-alef-hamza",0xFEF9:"lam-alef-hamza-below",0xFEFB:"lam-alef" };
function nameOf(cp){ for(let d=0;d<4;d++) if(NAMES[cp-d]) return NAMES[cp-d]; return "?"; }

for (const cp of IZ_CPS) {
  const c = M3_MAP.get(cp);
  if (c === undefined) { console.log(`U+${cp.toString(16).toUpperCase()} ${nameOf(cp)} ${formOf(cp)}  -- NOT IN MOTHER 3`); continue; }
  const b = bounds((x, y) => m3Px(c, x, y), 16, 16);
  if (b.empty) continue;
  const top = B - (M3_BASE - b.minY), bot = B + (b.maxY - M3_BASE);
  const over = Math.max(0, -top), under = Math.max(0, bot - 11);
  if (over || under) {
    console.log(`U+${cp.toString(16).toUpperCase()} ${nameOf(cp).padEnd(22)} ${formOf(cp).padEnd(9)} ink rows ${top}..${bot} (h=${b.h}) -> ${over?`${over} above the cell`:""}${over&&under?", ":""}${under?`${under} below the cell`:""}`);
  }
}
