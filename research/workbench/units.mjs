// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/units.ts
import { readFileSync } from "fs";

// src/lib/arabic-processing.ts
function isArabicChar(ch) {
  const code = ch.charCodeAt(0);
  return code >= 1536 && code <= 1791 || code >= 64336 && code <= 65023 || code >= 65136 && code <= 65279;
}
var PRESENTATION_FORMS_TO_STANDARD = {
  65152: 1569,
  65153: 1570,
  65154: 1570,
  65155: 1571,
  65156: 1571,
  65157: 1572,
  65158: 1572,
  65159: 1573,
  65160: 1573,
  65161: 1574,
  65162: 1574,
  65163: 1574,
  65164: 1574,
  65165: 1575,
  65166: 1575,
  65167: 1576,
  65168: 1576,
  65169: 1576,
  65170: 1576,
  65171: 1577,
  65172: 1577,
  65173: 1578,
  65174: 1578,
  65175: 1578,
  65176: 1578,
  65177: 1579,
  65178: 1579,
  65179: 1579,
  65180: 1579,
  65181: 1580,
  65182: 1580,
  65183: 1580,
  65184: 1580,
  65185: 1581,
  65186: 1581,
  65187: 1581,
  65188: 1581,
  65189: 1582,
  65190: 1582,
  65191: 1582,
  65192: 1582,
  65193: 1583,
  65194: 1583,
  65195: 1584,
  65196: 1584,
  65197: 1585,
  65198: 1585,
  65199: 1586,
  65200: 1586,
  65201: 1587,
  65202: 1587,
  65203: 1587,
  65204: 1587,
  65205: 1588,
  65206: 1588,
  65207: 1588,
  65208: 1588,
  65209: 1589,
  65210: 1589,
  65211: 1589,
  65212: 1589,
  65213: 1590,
  65214: 1590,
  65215: 1590,
  65216: 1590,
  65217: 1591,
  65218: 1591,
  65219: 1591,
  65220: 1591,
  65221: 1592,
  65222: 1592,
  65223: 1592,
  65224: 1592,
  65225: 1593,
  65226: 1593,
  65227: 1593,
  65228: 1593,
  65229: 1594,
  65230: 1594,
  65231: 1594,
  65232: 1594,
  65233: 1601,
  65234: 1601,
  65235: 1601,
  65236: 1601,
  65237: 1602,
  65238: 1602,
  65239: 1602,
  65240: 1602,
  65241: 1603,
  65242: 1603,
  65243: 1603,
  65244: 1603,
  65245: 1604,
  65246: 1604,
  65247: 1604,
  65248: 1604,
  65249: 1605,
  65250: 1605,
  65251: 1605,
  65252: 1605,
  65253: 1606,
  65254: 1606,
  65255: 1606,
  65256: 1606,
  65257: 1607,
  65258: 1607,
  65259: 1607,
  65260: 1607,
  65261: 1608,
  65262: 1608,
  65263: 1609,
  65264: 1609,
  65265: 1610,
  65266: 1610,
  65267: 1610,
  65268: 1610,
  65269: 1604,
  65270: 1604,
  65271: 1604,
  65272: 1604,
  65273: 1604,
  65274: 1604,
  65275: 1604,
  65276: 1604,
  65136: 1611,
  65137: 1611,
  65138: 1612,
  65140: 1613,
  65142: 1614,
  65143: 1614,
  65144: 1615,
  65145: 1615,
  65146: 1616,
  65147: 1616,
  65148: 1617,
  65149: 1617,
  65150: 1618,
  65151: 1618
};
var LAM_ALEF_PRESENTATION_FORMS_TO_STANDARD = {
  65269: "\u0644\u0622",
  65270: "\u0644\u0622",
  65271: "\u0644\u0623",
  65272: "\u0644\u0623",
  65273: "\u0644\u0625",
  65274: "\u0644\u0625",
  65275: "\u0644\u0627",
  65276: "\u0644\u0627"
};
function reverseBidi(text) {
  const hardBreakSplit = /(\[\s*(?:XENO\s*:\s*n|System\s*:\s*PageBreak)\s*\]\s*\n?)/gi;
  const hardBreakTest = /^\[\s*(?:XENO\s*:\s*n|System\s*:\s*PageBreak)\s*\]\s*\n?$/i;
  const parts = text.split(hardBreakSplit);
  if (parts.length > 1) {
    const debug = typeof globalThis !== "undefined" && globalThis.__BIDI_DEBUG__;
    if (debug) console.log("[reverseBidi:debug] parts before reverse:", parts);
    const out = parts.map((part) => {
      if (hardBreakTest.test(part)) return part;
      return part ? reverseBidi(part) : "";
    });
    if (debug) console.log("[reverseBidi:debug] parts after reverse:", out);
    return out.join("");
  }
  const tagPattern = /\\?\[\s*\/?\s*\w+\s*:[^\]]*?\s*\\?\](?:\s*\([^)]{1,100}\))?|\[\s*\w+\s*=\s*[^\]]*\]|\{\s*\w+\s*:[^}]*\}|\{[\w]+\}|\d+\s*\\?\[[A-Z]{2,10}\\?\]|\\?\[[A-Z]{2,10}\\?\]\s*\d+|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]/g;
  const MAX_SLOTS = 96;
  const tagSlots = [];
  const shielded = text.replace(tagPattern, (match) => {
    const idx = tagSlots.length;
    if (idx >= MAX_SLOTS) {
      console.warn("[reverseBidi] tag slot overflow \u2014 tag left unshielded:", match.slice(0, 40));
      return match;
    }
    tagSlots.push(match);
    return `\uE0F0\uE0F1${String.fromCharCode(57504 + idx)}\uE0F1\uE0F0`;
  });
  const reversed = shielded.split("\n").map((line) => {
    const segments = [];
    let current = "";
    let currentIsLTR = null;
    for (const ch of line) {
      const code = ch.charCodeAt(0);
      if (code >= 57344 && code <= 57599) {
        current += ch;
        continue;
      }
      if (code >= 65529 && code <= 65532) {
        current += ch;
        continue;
      }
      const charIsArabic = isArabicChar(ch);
      const charIsLTR = /[a-zA-Z0-9]/.test(ch);
      if (charIsArabic) {
        if (currentIsLTR === true && current) {
          segments.push({ text: current, isLTR: true });
          current = "";
        }
        currentIsLTR = false;
        current += ch;
      } else if (charIsLTR) {
        if (currentIsLTR === false && current) {
          segments.push({ text: current, isLTR: false });
          current = "";
        }
        currentIsLTR = true;
        current += ch;
      } else {
        current += ch;
      }
    }
    if (current) segments.push({ text: current, isLTR: currentIsLTR === true });
    return segments.reverse().map((seg) => {
      if (seg.isLTR) return seg.text;
      const chunks = [];
      let ci = 0;
      const chars = [...seg.text];
      while (ci < chars.length) {
        const cc = chars[ci].charCodeAt(0);
        if (cc >= 57344 && cc <= 57599 || cc >= 65529 && cc <= 65532) {
          let group = "";
          while (ci < chars.length) {
            const gc = chars[ci].charCodeAt(0);
            if (gc >= 57344 && gc <= 57599 || gc >= 65529 && gc <= 65532) {
              group += chars[ci];
              ci++;
            } else break;
          }
          chunks.push(group);
        } else {
          chunks.push(chars[ci]);
          ci++;
        }
      }
      return chunks.reverse().join("");
    }).join("");
  }).join("\n");
  if (tagSlots.length === 0) return reversed;
  return reversed.replace(/\uE0F0\uE0F1([\uE0A0-\uE0FF])\uE0F1\uE0F0/g, (_m, ch) => {
    const idx = ch.charCodeAt(0) - 57504;
    return tagSlots[idx] || _m;
  });
}
function removeArabicPresentationForms(text) {
  return [...text].map((ch) => {
    const code = ch.charCodeAt(0);
    const lamAlef = LAM_ALEF_PRESENTATION_FORMS_TO_STANDARD[code];
    if (lamAlef) return lamAlef;
    const standardCode = PRESENTATION_FORMS_TO_STANDARD[code];
    return standardCode ? String.fromCharCode(standardCode) : ch;
  }).join("");
}

// src/lib/gtaiv/gtaiv-ru-charmap.ts
var UNIT_TO_CODEPOINT_PAIRS = [
  [91, 1567],
  [93, 65152],
  [123, 65153],
  [124, 65261],
  [125, 65154],
  [161, 65260],
  [163, 65155],
  [165, 65156],
  [166, 65157],
  [167, 65158],
  [168, 65274],
  [170, 65272],
  [171, 65264],
  [176, 65273],
  [180, 65267],
  [182, 65159],
  [185, 65268],
  [186, 65265],
  [188, 65160],
  [189, 65161],
  [190, 65162],
  [191, 65263],
  [192, 65163],
  [193, 65164],
  [194, 65165],
  [195, 65166],
  [196, 65167],
  [197, 65168],
  [198, 65169],
  [199, 65170],
  [200, 65171],
  [201, 65173],
  [202, 65174],
  [203, 65175],
  [204, 65176],
  [205, 65177],
  [206, 65178],
  [207, 65179],
  [208, 65180],
  [209, 65181],
  [210, 65182],
  [211, 65183],
  [212, 65184],
  [213, 65185],
  [214, 65186],
  [216, 65187],
  [217, 65188],
  [218, 65189],
  [219, 65190],
  [220, 65191],
  [221, 65192],
  [222, 65193],
  [223, 65194],
  [224, 65195],
  [225, 65196],
  [226, 65197],
  [227, 65198],
  [228, 65199],
  [229, 65200],
  [232, 65201],
  [233, 65204],
  [235, 65205],
  [237, 65206],
  [239, 65207],
  [240, 65208],
  [242, 65209],
  [243, 65210],
  [245, 65211],
  [247, 65262],
  [249, 65212],
  [251, 65213],
  [253, 65271],
  [255, 65276],
  [298, 65172],
  [350, 65202],
  [352, 65203],
  [385, 65219],
  [386, 65220],
  [387, 65275],
  [388, 65221],
  [390, 65222],
  [391, 65223],
  [393, 65224],
  [394, 65225],
  [395, 65226],
  [398, 65227],
  [399, 65228],
  [400, 65229],
  [401, 65230],
  [403, 65231],
  [404, 65232],
  [405, 65233],
  [406, 65234],
  [407, 65235],
  [408, 65236],
  [410, 65237],
  [412, 65238],
  [413, 65239],
  [415, 65240],
  [416, 65241],
  [418, 65242],
  [420, 65243],
  [425, 65246],
  [428, 65247],
  [430, 65248],
  [431, 65249],
  [433, 65250],
  [434, 65251],
  [435, 65252],
  [437, 65253],
  [439, 65254],
  [440, 65255],
  [443, 65256],
  [471, 65266],
  [490, 65214],
  [492, 65215],
  [494, 65216],
  [497, 65217],
  [500, 65218],
  [502, 65244],
  [504, 65245],
  [506, 65257],
  [508, 65258],
  [510, 65259]
];
if (UNIT_TO_CODEPOINT_PAIRS.length !== 124) {
  throw new Error(`\u062C\u062F\u0648\u0644 \u062E\u0637\u0651 GTA IV \u0627\u0644\u0631\u0648\u0633\u064A \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644: ${UNIT_TO_CODEPOINT_PAIRS.length} \u062E\u0627\u0646\u0629 \u0628\u062F\u0644 124.`);
}
var LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF = [
  [
    65269,
    196
    /* placeholder, replaced below */
  ],
  [
    65270,
    196
    /* placeholder, replaced below */
  ]
];
var lamAlefIsolatedUnit = UNIT_TO_CODEPOINT_PAIRS.find(([, cp]) => cp === 65275)?.[0];
var lamAlefFinalUnit = UNIT_TO_CODEPOINT_PAIRS.find(([, cp]) => cp === 65276)?.[0];
if (lamAlefIsolatedUnit === void 0 || lamAlefFinalUnit === void 0) {
  throw new Error("\u062A\u0639\u0630\u0651\u0631 \u0625\u064A\u062C\u0627\u062F \u062E\u0627\u0646\u062A\u064E\u064A \u0631\u0628\u0627\u0637 \xAB\u0644\u0627\xBB \u0644\u0631\u0628\u0637 \u0631\u0628\u0627\u0637 \xAB\u0644\u0622\xBB \u0628\u0647\u0645\u0627.");
}
LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF[0][1] = lamAlefIsolatedUnit;
LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF[1][1] = lamAlefFinalUnit;
var GTAIV_RU_CUSTOM_UNITS = new Set(UNIT_TO_CODEPOINT_PAIRS.map(([unit]) => unit));
var GTAIV_RU_UNIT_TO_CODEPOINT = new Map(UNIT_TO_CODEPOINT_PAIRS);
var GTAIV_RU_CODEPOINT_TO_UNIT = new Map([
  ...UNIT_TO_CODEPOINT_PAIRS.map(([unit, cp]) => [cp, unit]),
  ...LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF
]);

// src/lib/gtaiv/gxt-format.ts
var ascii = new TextDecoder("ascii");
function fail(message) {
  throw new Error(`\u0645\u0644\u0641 GTA IV \u063A\u064A\u0631 \u0635\u0627\u0644\u062D: ${message}`);
}
function u16(view, offset) {
  if (offset + 2 > view.byteLength) fail("\u0642\u0631\u0627\u0621\u0629 \u062E\u0627\u0631\u062C \u062D\u062F\u0648\u062F \u0627\u0644\u0645\u0644\u0641.");
  return view.getUint16(offset, true);
}
function u32(view, offset) {
  if (offset + 4 > view.byteLength) fail("\u0642\u0631\u0627\u0621\u0629 \u062E\u0627\u0631\u062C \u062D\u062F\u0648\u062F \u0627\u0644\u0645\u0644\u0641.");
  return view.getUint32(offset, true);
}
function marker(bytes, offset, size = 4) {
  if (offset + size > bytes.length) fail("\u062A\u0631\u0648\u064A\u0633\u0629 \u0643\u062A\u0644\u0629 \u0646\u0627\u0642\u0635\u0629.");
  return ascii.decode(bytes.subarray(offset, offset + size));
}
function tableName(bytes, offset) {
  return ascii.decode(bytes.subarray(offset, offset + 8)).replace(/\0+$/, "").trim();
}
function textFromUnits(units) {
  let value = "";
  for (let index = 0; index < units.length; index += 1) value += String.fromCharCode(units[index]);
  return value;
}
function decodeGtaIvArabicFontUnits(units, encodedArabic = false) {
  if (!encodedArabic) return textFromUnits(units);
  let presentationText = "";
  for (const unit of units) {
    presentationText += String.fromCharCode(GTAIV_RU_UNIT_TO_CODEPOINT.get(unit) ?? unit);
  }
  return removeArabicPresentationForms(reverseBidi(presentationText));
}
function readGxtTextUnits(view, payloadOffset, textBytes, dataOffset, table) {
  if (dataOffset % 2 !== 0) fail(`\u0625\u0632\u0627\u062D\u0629 \u0646\u0635 \u063A\u064A\u0631 \u0632\u0648\u062C\u064A\u0629 \u0641\u064A \u0627\u0644\u062C\u062F\u0648\u0644 ${table}.`);
  const start = payloadOffset + dataOffset;
  const end = payloadOffset + textBytes;
  for (let offset = start; offset < end; offset += 2) {
    if (u16(view, offset) !== 0) continue;
    const units = new Uint16Array((offset - start) / 2);
    for (let index = 0; index < units.length; index += 1) units[index] = u16(view, start + index * 2);
    return units;
  }
  fail(`\u0646\u0635 \u063A\u064A\u0631 \u0645\u0646\u062A\u0647\u064D \u0628\u0640 NUL \u0641\u064A \u0627\u0644\u062C\u062F\u0648\u0644 ${table}.`);
}
function parseGtaIvGxt(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 12) fail("\u0623\u0642\u0635\u0631 \u0645\u0646 \u062A\u0631\u0648\u064A\u0633\u0629 GXT.");
  const version = u16(view, 0);
  const charSize = u16(view, 2);
  if (version !== 4) fail(`Version ${version} \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u061B \u0627\u0644\u0645\u062A\u0648\u0642\u0639 Version 4.`);
  if (charSize !== 16) fail(`CharSize ${charSize} \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u061B \u0627\u0644\u0645\u062A\u0648\u0642\u0639 CharSize 16.`);
  if (marker(bytes, 4) !== "TABL") fail("\u0644\u0627 \u064A\u062D\u0645\u0644 \u0643\u062A\u0644\u0629 TABL \u0641\u064A \u0627\u0644\u062A\u0631\u0648\u064A\u0633\u0629.");
  const tablSize = u32(view, 8);
  if (tablSize === 0 || tablSize % 12 !== 0 || 12 + tablSize > bytes.length) {
    fail("\u062D\u062C\u0645 \u062C\u062F\u0648\u0644 TABL \u063A\u064A\u0631 \u0635\u062D\u064A\u062D.");
  }
  const tables = [];
  const names = /* @__PURE__ */ new Set();
  for (let at = 12; at < 12 + tablSize; at += 12) {
    const name = tableName(bytes, at);
    const offset = u32(view, at + 8);
    if (!name) fail("\u0627\u0633\u0645 \u062C\u062F\u0648\u0644 \u0641\u0627\u0631\u063A \u0641\u064A TABL.");
    if (names.has(name)) fail(`\u0627\u0633\u0645 \u062C\u062F\u0648\u0644 \u0645\u0643\u0631\u0631: ${name}.`);
    names.add(name);
    if (offset + 8 > bytes.length) fail(`\u0625\u0632\u0627\u062D\u0629 \u062C\u062F\u0648\u0644 ${name} \u062E\u0627\u0631\u062C \u0627\u0644\u0645\u0644\u0641.`);
    const prefix = marker(bytes, offset);
    const tkeyOffset = prefix === "TKEY" ? offset : offset + 8;
    if (marker(bytes, tkeyOffset) !== "TKEY") fail(`\u0643\u062A\u0644\u0629 TKEY \u0645\u0641\u0642\u0648\u062F\u0629 \u0645\u0646 \u0627\u0644\u062C\u062F\u0648\u0644 ${name}.`);
    const keyBytes = u32(view, tkeyOffset + 4);
    if (keyBytes % 8 !== 0 || tkeyOffset + 8 + keyBytes + 8 > bytes.length) {
      fail(`\u062D\u062C\u0645 TKEY \u063A\u064A\u0631 \u0635\u062D\u064A\u062D \u0641\u064A \u0627\u0644\u062C\u062F\u0648\u0644 ${name}.`);
    }
    const tdatOffset = tkeyOffset + 8 + keyBytes;
    if (marker(bytes, tdatOffset) !== "TDAT") fail(`\u0643\u062A\u0644\u0629 TDAT \u0645\u0641\u0642\u0648\u062F\u0629 \u0645\u0646 \u0627\u0644\u062C\u062F\u0648\u0644 ${name}.`);
    const textBytes = u32(view, tdatOffset + 4);
    if (textBytes % 2 !== 0 || tdatOffset + 8 + textBytes > bytes.length) {
      fail(`\u062D\u062C\u0645 TDAT \u063A\u064A\u0631 \u0635\u062D\u064A\u062D \u0641\u064A \u0627\u0644\u062C\u062F\u0648\u0644 ${name}.`);
    }
    const payloadOffset = tdatOffset + 8;
    const entries = [];
    for (let keyAt = tkeyOffset + 8; keyAt < tkeyOffset + 8 + keyBytes; keyAt += 8) {
      const dataOffset = u32(view, keyAt);
      if (dataOffset >= textBytes) fail(`\u0625\u0632\u0627\u062D\u0629 \u0646\u0635 \u062E\u0627\u0631\u062C TDAT \u0641\u064A \u0627\u0644\u062C\u062F\u0648\u0644 ${name}.`);
      entries.push({
        dataOffset,
        crc: u32(view, keyAt + 4),
        textUnits: readGxtTextUnits(view, payloadOffset, textBytes, dataOffset, name)
      });
    }
    tables.push({ name, offset, tkeyOffset, tdatOffset, textBytes, entries });
  }
  return { version, charSize, bytes: bytes.length, tables };
}

// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/units.ts
var BASE = [
  [65152, "hamza"],
  [65153, "alef-madda"],
  [65155, "alef-hamza"],
  [65157, "waw-hamza"],
  [65159, "alef-hamza-below"],
  [65161, "yeh-hamza"],
  [65165, "alef"],
  [65167, "beh"],
  [65171, "teh-marbuta"],
  [65173, "teh"],
  [65177, "theh"],
  [65181, "jeem"],
  [65185, "hah"],
  [65189, "khah"],
  [65193, "dal"],
  [65195, "thal"],
  [65197, "reh"],
  [65199, "zain"],
  [65201, "seen"],
  [65205, "sheen"],
  [65209, "sad"],
  [65213, "dad"],
  [65217, "tah"],
  [65221, "zah"],
  [65225, "ain"],
  [65229, "ghain"],
  [65233, "feh"],
  [65237, "qaf"],
  [65241, "kaf"],
  [65245, "lam"],
  [65249, "meem"],
  [65253, "noon"],
  [65257, "heh"],
  [65261, "waw"],
  [65263, "alef-maksura"],
  [65265, "yeh"]
];
var FORMS = ["ISO", "FIN", "INI", "MED"];
function nameOf(cp) {
  if (cp === 1567) return "?ar";
  for (let i = BASE.length - 1; i >= 0; i--) {
    if (cp >= BASE[i][0]) {
      const n = cp - BASE[i][0];
      return `${BASE[i][1]}.${FORMS[n] ?? "?" + n}`;
    }
  }
  return "U+" + cp.toString(16);
}
var buf = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/a5c910b1-russian_3.gxt");
var gxt = parseGtaIvGxt(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
function dump(crcHex) {
  for (const t of gxt.tables) {
    for (const e of t.entries) {
      if (e.crc.toString(16) !== crcHex) continue;
      console.log(`
=== ${t.name}/${crcHex} \u2014 \u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0645\u0644\u0641 (\u064A\u0633\u0627\u0631\u2190\u064A\u0645\u064A\u0646 \u0639\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629)`);
      const parts = [];
      for (const u of Array.from(e.textUnits)) {
        if (u === 32) {
          parts.push("\xB7");
          continue;
        }
        if (u < 128) {
          parts.push(String.fromCharCode(u));
          continue;
        }
        const cp = GTAIV_RU_UNIT_TO_CODEPOINT.get(u);
        parts.push(cp === void 0 ? `?${u}` : `[${u}=${nameOf(cp)}]`);
      }
      console.log(parts.join(" "));
      return;
    }
  }
  console.log("not found", crcHex);
}
for (const t of gxt.tables) {
  for (const e of t.entries) {
    const text = decodeGtaIvArabicFontUnits(e.textUnits, true);
    if (text.includes("\u0627\u0644\u0645\u0644\u0627\u0628\u0633") && text.includes("INPUT_PICKUP")) {
      console.log("FOUND", t.name, e.crc.toString(16));
      dump(e.crc.toString(16));
    }
  }
}
