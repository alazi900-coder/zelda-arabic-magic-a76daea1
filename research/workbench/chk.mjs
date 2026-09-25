// src/lib/arabic-processing.ts
function isArabicChar(ch) {
  const code = ch.charCodeAt(0);
  return code >= 1536 && code <= 1791 || code >= 64336 && code <= 65023 || code >= 65136 && code <= 65279;
}
function hasArabicChars(text) {
  return [...text].some((ch) => isArabicChar(ch));
}
var ARABIC_FORMS = {
  1569: [65152, 65152, null, null],
  1570: [65153, 65154, null, null],
  1571: [65155, 65156, null, null],
  1572: [65157, 65158, null, null],
  1573: [65159, 65160, null, null],
  1574: [65161, 65162, 65163, 65164],
  1575: [65165, 65166, null, null],
  1576: [65167, 65168, 65169, 65170],
  1577: [65171, 65172, null, null],
  1578: [65173, 65174, 65175, 65176],
  1579: [65177, 65178, 65179, 65180],
  1580: [65181, 65182, 65183, 65184],
  1581: [65185, 65186, 65187, 65188],
  1582: [65189, 65190, 65191, 65192],
  1583: [65193, 65194, null, null],
  1584: [65195, 65196, null, null],
  1585: [65197, 65198, null, null],
  1586: [65199, 65200, null, null],
  1587: [65201, 65202, 65203, 65204],
  1588: [65205, 65206, 65207, 65208],
  1589: [65209, 65210, 65211, 65212],
  1590: [65213, 65214, 65215, 65216],
  1591: [65217, 65218, 65219, 65220],
  1592: [65221, 65222, 65223, 65224],
  1593: [65225, 65226, 65227, 65228],
  1594: [65229, 65230, 65231, 65232],
  1600: [1600, 1600, 1600, 1600],
  1601: [65233, 65234, 65235, 65236],
  1602: [65237, 65238, 65239, 65240],
  1603: [65241, 65242, 65243, 65244],
  1604: [65245, 65246, 65247, 65248],
  1605: [65249, 65250, 65251, 65252],
  1606: [65253, 65254, 65255, 65256],
  1607: [65257, 65258, 65259, 65260],
  1608: [65261, 65262, null, null],
  1609: [65263, 65264, null, null],
  1610: [65265, 65266, 65267, 65268]
};
var LAM_ALEF_LIGATURES = {
  1570: [65269, 65270],
  1571: [65271, 65272],
  1573: [65273, 65274],
  1575: [65275, 65276]
};
function canConnectAfter(code) {
  const forms = ARABIC_FORMS[code];
  if (!forms) return false;
  return forms[2] !== null;
}
function isTashkeel(code) {
  return code >= 1611 && code <= 1631;
}
function getPrevArabicCode(chars, index) {
  for (let i = index - 1; i >= 0; i--) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeel(c)) continue;
    if (c >= 57344 && c <= 57599) continue;
    if (ARABIC_FORMS[c] !== void 0) return c;
    return null;
  }
  return null;
}
function getNextArabicCode(chars, index) {
  for (let i = index + 1; i < chars.length; i++) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeel(c)) continue;
    if (c >= 57344 && c <= 57599) continue;
    if (ARABIC_FORMS[c] !== void 0) return c;
    return null;
  }
  return null;
}
function reshapeArabic(text) {
  const chars = [...text];
  const result = [];
  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0);
    if (isTashkeel(code)) {
      result.push(chars[i]);
      continue;
    }
    if (code >= 57344 && code <= 57599) {
      result.push(chars[i]);
      continue;
    }
    const forms = ARABIC_FORMS[code];
    if (!forms) {
      result.push(chars[i]);
      continue;
    }
    if (code === 1604) {
      let nextIdx = i + 1;
      while (nextIdx < chars.length && isTashkeel(chars[nextIdx].charCodeAt(0))) nextIdx++;
      if (nextIdx < chars.length) {
        const nextCode2 = chars[nextIdx].charCodeAt(0);
        const ligature = LAM_ALEF_LIGATURES[nextCode2];
        if (ligature) {
          const prevCode2 = getPrevArabicCode(chars, i);
          const prevConnects2 = prevCode2 !== null && canConnectAfter(prevCode2);
          result.push(String.fromCharCode(prevConnects2 ? ligature[1] : ligature[0]));
          i = nextIdx;
          continue;
        }
      }
    }
    const prevCode = getPrevArabicCode(chars, i);
    const prevConnects = prevCode !== null && canConnectAfter(prevCode);
    const nextCode = getNextArabicCode(chars, i);
    const nextExists = nextCode !== null && ARABIC_FORMS[nextCode] !== void 0;
    let formIndex;
    if (prevConnects && nextExists && forms[2] !== null) {
      formIndex = 3;
      if (forms[3] === null) formIndex = 1;
    } else if (prevConnects) {
      formIndex = 1;
    } else if (nextExists && forms[2] !== null) {
      formIndex = 2;
    } else {
      formIndex = 0;
    }
    const glyph = forms[formIndex];
    result.push(String.fromCharCode(glyph !== null ? glyph : forms[0]));
  }
  return result.join("");
}
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
var NUMERAL_MAP = {
  "0": "\u0660",
  "1": "\u0661",
  "2": "\u0662",
  "3": "\u0663",
  "4": "\u0664",
  "5": "\u0665",
  "6": "\u0666",
  "7": "\u0667",
  "8": "\u0668",
  "9": "\u0669"
};
function convertToArabicNumerals(text) {
  return [...text].map((ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 57344 && code <= 57599) return ch;
    return NUMERAL_MAP[ch] || ch;
  }).join("");
}
function mirrorPunctuation(text) {
  const PUNCT_MAP = { "?": "\u061F", ",": "\u060C", ";": "\u061B" };
  const BRACKET_MAP = { "(": ")", ")": "(" };
  const protectedItems = [];
  const PLACEHOLDER_BASE = 59392;
  const protect = (s) => {
    const i = protectedItems.length;
    protectedItems.push(s);
    return String.fromCharCode(PLACEHOLDER_BASE + i);
  };
  let working = text.replace(/\(\s*\\?\[[^\]]+\\?\]\s*\)/g, protect).replace(/\\?\[[^\]]+\\?\]/g, protect).replace(/\{[\w]+\}/g, protect);
  working = [...working].map((ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 57344 && code <= 57599) return ch;
    if (code >= PLACEHOLDER_BASE && code < PLACEHOLDER_BASE + protectedItems.length) return ch;
    return PUNCT_MAP[ch] || BRACKET_MAP[ch] || ch;
  }).join("");
  return working.replace(
    new RegExp(`[\\u${PLACEHOLDER_BASE.toString(16)}-\\u${(PLACEHOLDER_BASE + 255).toString(16)}]`, "g"),
    (ch) => protectedItems[ch.charCodeAt(0) - PLACEHOLDER_BASE] ?? ch
  );
}
function stripDiacritics(text) {
  return text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "");
}
function processArabicText(text, options) {
  if (!hasArabicChars(text)) return text;
  let result = stripDiacritics(text);
  result = reshapeArabic(result);
  result = reverseBidi(result);
  if (options?.arabicNumerals) result = convertToArabicNumerals(result);
  if (options?.mirrorPunct) result = mirrorPunctuation(result);
  return result;
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
  [180, 65265],
  [182, 65159],
  [185, 65266],
  [186, 65267],
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
  [471, 65268],
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
var gtaIvArabicPunctuationToAscii = {
  "\u061F": "?",
  "\u060C": ",",
  "\u061B": ";",
  "\u066A": "%",
  "\u0660": "0",
  "\u0661": "1",
  "\u0662": "2",
  "\u0663": "3",
  "\u0664": "4",
  "\u0665": "5",
  "\u0666": "6",
  "\u0667": "7",
  "\u0668": "8",
  "\u0669": "9"
};
var gtaIvDollarAmountPattern = /\$\d+(?:,\d{3})*(?:\.\d+)?(?:[kKmMbB])?/g;
var gtaIvDollarAmountCandidatePattern = /\$\s*[0-9٠-٩]+(?:,[0-9٠-٩]{3})*(?:\.[0-9٠-٩]+)?(?:[kKmMbB])?|[0-9٠-٩]+(?:,[0-9٠-٩]{3})*(?:[\.,،][0-9٠-٩]{1,2})?(?:[kKmMbB])?\s*(?:\$|دولار)|[0-9٠-٩]+\s+(?:مليون|ملايين)\s+دولار/g;
function isGtaIvRuCharacterSupported(char, sourceExtendedUnits) {
  const code = char.codePointAt(0) ?? 0;
  if (GTAIV_RU_CODEPOINT_TO_UNIT.has(code)) return true;
  if (code > 127 && code <= 255 && (sourceExtendedUnits?.get(code) ?? 0) > 0) return true;
  return code > 0 && code <= 127;
}
function gtaIvSourceExtendedUnitBudget(sourceText) {
  const budget = /* @__PURE__ */ new Map();
  for (let index = 0; index < sourceText.length; index += 1) {
    const unit = sourceText.charCodeAt(index);
    if (unit <= 127 || unit > 255) continue;
    budget.set(unit, (budget.get(unit) ?? 0) + 1);
  }
  return budget;
}
var gtaIvContentTokenPattern = /^~(?:[0-9]+|[A-Za-z_][A-Za-z0-9_]+)~$/;
function layOutGtaIvArabicLine(translation) {
  const pieces = translation.split(/(~[^~]+~)/g);
  const out = [];
  let span = [];
  const flush = () => {
    for (let i = span.length - 1; i >= 0; i -= 1) out.push(span[i]);
    span = [];
  };
  pieces.forEach((piece, index) => {
    const isToken = index % 2 === 1;
    if (!isToken) {
      if (piece !== "") span.push(processGtaIvArabicPiece(piece));
      return;
    }
    if (gtaIvContentTokenPattern.test(piece)) {
      span.push(piece);
      return;
    }
    flush();
    out.push(piece);
  });
  flush();
  return out.join("");
}
function analyzeGtaIvUnsupportedCharacters(translation, sourceText = "") {
  const processedText = layOutGtaIvArabicLine(translation);
  const unsupported = /* @__PURE__ */ new Map();
  const sourceExtendedUnits = gtaIvSourceExtendedUnitBudget(sourceText);
  for (const char of processedText) {
    const codePoint = char.codePointAt(0) ?? 0;
    const sourceCount = sourceExtendedUnits.get(codePoint) ?? 0;
    if (isGtaIvRuCharacterSupported(char, sourceExtendedUnits)) {
      if (codePoint > 127 && codePoint <= 255 && sourceCount > 0) {
        sourceExtendedUnits.set(codePoint, sourceCount - 1);
      }
      continue;
    }
    const unicode = `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
    const previous = unsupported.get(unicode);
    unsupported.set(unicode, previous ? { ...previous, count: previous.count + 1 } : { character: char, unicode, count: 1 });
  }
  return {
    processedText,
    unsupported: [...unsupported.values()].sort((left, right) => left.unicode.localeCompare(right.unicode))
  };
}
function fail(message) {
  throw new Error(`\u0645\u0644\u0641 GTA IV \u063A\u064A\u0631 \u0635\u0627\u0644\u062D: ${message}`);
}
function normalizeGtaIvArabicPunctuation(value) {
  return [...value].map((char) => gtaIvArabicPunctuationToAscii[char] ?? char).join("");
}
function encodeGtaIvArabicText(sourceText, translation) {
  const dollarRepair = repairGtaIvDollarAmountSequence(sourceText, translation);
  const normalizedTranslation = dollarRepair.safe ? dollarRepair.text : translation;
  const { processedText, unsupported } = analyzeGtaIvUnsupportedCharacters(normalizedTranslation, sourceText);
  if (unsupported.length > 0) {
    const first = unsupported[0];
    fail(`\u0627\u0644\u0645\u062D\u0631\u0641 \xAB${first.character}\xBB (${first.unicode}) \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645 \u0641\u064A \u062E\u0637\u0651 \u0645\u0648\u062F GTA IV \u0627\u0644\u0631\u0648\u0633\u064A.`);
  }
  const units = [];
  for (const char of processedText) {
    const code = char.charCodeAt(0);
    const ruUnit = GTAIV_RU_CODEPOINT_TO_UNIT.get(code);
    if (ruUnit !== void 0) {
      units.push(ruUnit);
      continue;
    }
    if (code > 0 && code <= 127) {
      units.push(code);
      continue;
    }
    if (code > 127 && code <= 255) {
      units.push(code);
      continue;
    }
    fail(`\u0627\u0644\u0645\u062D\u0631\u0641 \xAB${char}\xBB \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645 \u0641\u064A \u062E\u0637\u0651 \u0645\u0648\u062F GTA IV \u0627\u0644\u0631\u0648\u0633\u064A.`);
  }
  return { processedText, textUnits: new Uint16Array(units) };
}
function processGtaIvArabicPiece(value) {
  const amounts = [];
  const shielded = normalizeGtaIvArabicPunctuation(value).replace(gtaIvDollarAmountPattern, (amount) => {
    const index = amounts.length;
    amounts.push(amount);
    if (index >= 96) return amount;
    return `\uE0F2${String.fromCharCode(57504 + index)}\uE0F2`;
  });
  const processed = processArabicText(shielded);
  return processed.replace(/\uE0F2([\uE0A0-\uE0FF])\uE0F2/g, (marker, slot) => {
    const index = slot.charCodeAt(0) - 57504;
    return amounts[index] ?? marker;
  });
}
function validateGtaIvDollarAmountSequence(source, candidate) {
  const sourceAmounts = source.match(gtaIvDollarAmountPattern) ?? [];
  const candidateAmounts = candidate.match(gtaIvDollarAmountCandidatePattern) ?? [];
  if (sourceAmounts.length !== candidateAmounts.length) {
    return { valid: false, sourceAmounts, candidateAmounts, reason: "\u0639\u062F\u062F \u0645\u0628\u0627\u0644\u063A \u0627\u0644\u062F\u0648\u0644\u0627\u0631 \u062A\u063A\u064A\u0631." };
  }
  if (sourceAmounts.some((amount, index) => normalizeGtaIvDollarAmount(amount) !== normalizeGtaIvDollarAmount(candidateAmounts[index] ?? ""))) {
    return { valid: false, sourceAmounts, candidateAmounts, reason: "\u0642\u064A\u0645\u0629 \u0623\u0648 \u062A\u0631\u062A\u064A\u0628 \u0645\u0628\u0644\u063A \u0627\u0644\u062F\u0648\u0644\u0627\u0631 \u062A\u063A\u064A\u0631." };
  }
  return { valid: true, sourceAmounts, candidateAmounts };
}
function repairGtaIvDollarAmountSequence(source, candidate) {
  const validation = validateGtaIvDollarAmountSequence(source, candidate);
  if (!validation.valid) {
    return {
      text: candidate,
      changed: false,
      safe: false,
      reason: validation.reason ?? "\u062A\u0639\u0630\u0651\u0631 \u0625\u0635\u0644\u0627\u062D \u0645\u0628\u0644\u063A \u0627\u0644\u062F\u0648\u0644\u0627\u0631 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B."
    };
  }
  let amountIndex = 0;
  const repaired = candidate.replace(gtaIvDollarAmountCandidatePattern, () => validation.sourceAmounts[amountIndex++] ?? "");
  const repairedValidation = validateGtaIvDollarAmountSequence(source, repaired);
  if (!repairedValidation.valid) {
    return { text: candidate, changed: false, safe: false, reason: repairedValidation.reason };
  }
  return { text: repaired, changed: repaired !== candidate, safe: true };
}
function normalizeGtaIvDollarAmount(value) {
  const normalized = normalizeGtaIvArabicPunctuation(value).trim().toLowerCase();
  const arabicMillions = normalized.match(/^(\d+)\s+(?:مليون|ملايين)\s+دولار$/);
  const unseparated = arabicMillions ? `${arabicMillions[1]}m` : normalized.replace(/دولار/g, "").replace(/[\s$]/g, "");
  const decimalComma = unseparated.match(/^(\d+(?:,\d{3})*),(\d{1,2})([kmb])?$/i);
  const compact = (decimalComma ? `${decimalComma[1].replace(/,/g, "")}.${decimalComma[2]}${decimalComma[3] ?? ""}` : unseparated.replace(/,/g, "")).toLowerCase();
  const parts = compact.match(/^(\d+)(?:\.(\d+))?([kmb])?$/);
  if (!parts) return compact;
  const [, integerPart, fractionalPart = "", suffix = ""] = parts;
  const scale = suffix === "k" ? 3 : suffix === "m" ? 6 : suffix === "b" ? 9 : 0;
  const digits = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, "") || "0";
  if (digits === "0") return "0";
  const decimalPlaces = fractionalPart.length - scale;
  if (decimalPlaces <= 0) return `${digits}${"0".repeat(-decimalPlaces)}`;
  const splitAt = digits.length - decimalPlaces;
  const decimal = splitAt > 0 ? `${digits.slice(0, splitAt)}.${digits.slice(splitAt)}` : `0.${"0".repeat(-splitAt)}${digits}`;
  return decimal.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/chk.ts
var u = (s) => Array.from(encodeGtaIvArabicText("", s).textUnits);
for (const w of ["\u064A", "\u0628\u064A", "\u064A\u0628", "\u0628\u064A\u0628", "\u062E\u064A\u0627\u0631\u0627\u062A"]) console.log(JSON.stringify(w), u(w));
var e = encodeGtaIvArabicText("Press ~INPUT_PICKUP~ to leave", "\u0627\u0636\u063A\u0637 ~INPUT_PICKUP~ \u0644\u0644\u062E\u0631\u0648\u062C");
console.log("units:", Array.from(e.textUnits).join(" "));
var n = encodeGtaIvArabicText("A~n~B", "\u0627\u0644\u0623\u0648\u0644~n~\u0627\u0644\u062B\u0627\u0646\u064A");
console.log("newline units:", Array.from(n.textUnits).join(" "));
