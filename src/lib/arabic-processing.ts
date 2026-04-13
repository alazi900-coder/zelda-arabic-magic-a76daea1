// Client-side Arabic text processing (ported from arabize edge function)

export function isArabicChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
}

export function hasArabicChars(text: string): boolean {
  return [...text].some(ch => isArabicChar(ch));
}

export function hasArabicPresentationForms(text: string): boolean {
  return [...text].some(ch => {
    const code = ch.charCodeAt(0);
    return (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
  });
}

const ARABIC_FORMS: Record<number, [number, number, number | null, number | null]> = {
  0x0621: [0xFE80, 0xFE80, null, null],
  0x0622: [0xFE81, 0xFE82, null, null],
  0x0623: [0xFE83, 0xFE84, null, null],
  0x0624: [0xFE85, 0xFE86, null, null],
  0x0625: [0xFE87, 0xFE88, null, null],
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C],
  0x0627: [0xFE8D, 0xFE8E, null, null],
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92],
  0x0629: [0xFE93, 0xFE94, null, null],
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98],
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C],
  0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0],
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8],
  0x062F: [0xFEA9, 0xFEAA, null, null],
  0x0630: [0xFEAB, 0xFEAC, null, null],
  0x0631: [0xFEAD, 0xFEAE, null, null],
  0x0632: [0xFEAF, 0xFEB0, null, null],
  0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4],
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8],
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC],
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0],
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4],
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8],
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC],
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0],
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640],
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4],
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8],
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC],
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0],
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4],
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC],
  0x0648: [0xFEED, 0xFEEE, null, null],
  0x0649: [0xFEEF, 0xFEF0, null, null],
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],
};

const LAM_ALEF_LIGATURES: Record<number, [number, number]> = {
  0x0622: [0xFEF5, 0xFEF6],
  0x0623: [0xFEF7, 0xFEF8],
  0x0625: [0xFEF9, 0xFEFA],
  0x0627: [0xFEFB, 0xFEFC],
};

// Reverse mapping: Presentation Forms back to standard Arabic
const PRESENTATION_FORMS_TO_STANDARD: Record<number, number> = {
  0xFE80: 0x0621, 0xFE81: 0x0622, 0xFE82: 0x0622, 0xFE83: 0x0623, 0xFE84: 0x0623,
  0xFE85: 0x0624, 0xFE86: 0x0624, 0xFE87: 0x0625, 0xFE88: 0x0625, 0xFE89: 0x0626,
  0xFE8A: 0x0626, 0xFE8B: 0x0626, 0xFE8C: 0x0626, 0xFE8D: 0x0627, 0xFE8E: 0x0627,
  0xFE8F: 0x0628, 0xFE90: 0x0628, 0xFE91: 0x0628, 0xFE92: 0x0628, 0xFE93: 0x0629,
  0xFE94: 0x0629, 0xFE95: 0x062A, 0xFE96: 0x062A, 0xFE97: 0x062A, 0xFE98: 0x062A,
  0xFE99: 0x062B, 0xFE9A: 0x062B, 0xFE9B: 0x062B, 0xFE9C: 0x062B, 0xFE9D: 0x062C,
  0xFE9E: 0x062C, 0xFE9F: 0x062C, 0xFEA0: 0x062C, 0xFEA1: 0x062D, 0xFEA2: 0x062D,
  0xFEA3: 0x062D, 0xFEA4: 0x062D, 0xFEA5: 0x062E, 0xFEA6: 0x062E, 0xFEA7: 0x062E,
  0xFEA8: 0x062E, 0xFEA9: 0x062F, 0xFEAA: 0x062F, 0xFEAB: 0x0630, 0xFEAC: 0x0630,
  0xFEAD: 0x0631, 0xFEAE: 0x0631, 0xFEAF: 0x0632, 0xFEB0: 0x0632, 0xFEB1: 0x0633,
  0xFEB2: 0x0633, 0xFEB3: 0x0633, 0xFEB4: 0x0633, 0xFEB5: 0x0634, 0xFEB6: 0x0634,
  0xFEB7: 0x0634, 0xFEB8: 0x0634, 0xFEB9: 0x0635, 0xFEBA: 0x0635, 0xFEBB: 0x0635,
  0xFEBC: 0x0635, 0xFEBD: 0x0636, 0xFEBE: 0x0636, 0xFEBF: 0x0636, 0xFEC0: 0x0636,
  0xFEC1: 0x0637, 0xFEC2: 0x0637, 0xFEC3: 0x0637, 0xFEC4: 0x0637, 0xFEC5: 0x0638,
  0xFEC6: 0x0638, 0xFEC7: 0x0638, 0xFEC8: 0x0638, 0xFEC9: 0x0639, 0xFECA: 0x0639,
  0xFECB: 0x0639, 0xFECC: 0x0639, 0xFECD: 0x063A, 0xFECE: 0x063A, 0xFECF: 0x063A,
  0xFED0: 0x063A, 0xFED1: 0x0641, 0xFED2: 0x0641, 0xFED3: 0x0641, 0xFED4: 0x0641,
  0xFED5: 0x0642, 0xFED6: 0x0642, 0xFED7: 0x0642, 0xFED8: 0x0642, 0xFED9: 0x0643,
  0xFEDA: 0x0643, 0xFEDB: 0x0643, 0xFEDC: 0x0643, 0xFEDD: 0x0644, 0xFEDE: 0x0644,
  0xFEDF: 0x0644, 0xFEE0: 0x0644, 0xFEE1: 0x0645, 0xFEE2: 0x0645, 0xFEE3: 0x0645,
  0xFEE4: 0x0645, 0xFEE5: 0x0646, 0xFEE6: 0x0646, 0xFEE7: 0x0646, 0xFEE8: 0x0646,
  0xFEE9: 0x0647, 0xFEEA: 0x0647, 0xFEEB: 0x0647, 0xFEEC: 0x0647, 0xFEED: 0x0648,
  0xFEEE: 0x0648, 0xFEEF: 0x0649, 0xFEF0: 0x0649, 0xFEF1: 0x064A, 0xFEF2: 0x064A,
  0xFEF3: 0x064A, 0xFEF4: 0x064A, 0xFEF5: 0x0644, 0xFEF6: 0x0644, 0xFEF7: 0x0644,
  0xFEF8: 0x0644, 0xFEF9: 0x0644, 0xFEFA: 0x0644, 0xFEFB: 0x0644, 0xFEFC: 0x0644,
  0xFE70: 0x064B, 0xFE71: 0x064B, 0xFE72: 0x064C, 0xFE74: 0x064D, 0xFE76: 0x064E,
  0xFE77: 0x064E, 0xFE78: 0x064F, 0xFE79: 0x064F, 0xFE7A: 0x0650, 0xFE7B: 0x0650,
  0xFE7C: 0x0651, 0xFE7D: 0x0651, 0xFE7E: 0x0652, 0xFE7F: 0x0652,
};

function canConnectAfter(code: number): boolean {
  const forms = ARABIC_FORMS[code];
  if (!forms) return false;
  return forms[2] !== null;
}

function isTashkeel(code: number): boolean {
  return code >= 0x064B && code <= 0x065F;
}

function getPrevArabicCode(chars: string[], index: number): number | null {
  for (let i = index - 1; i >= 0; i--) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeel(c)) continue;
    if (c >= 0xE000 && c <= 0xE0FF) continue;
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

function getNextArabicCode(chars: string[], index: number): number | null {
  for (let i = index + 1; i < chars.length; i++) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeel(c)) continue;
    if (c >= 0xE000 && c <= 0xE0FF) continue;
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

export function reshapeArabic(text: string): string {
  const chars = [...text];
  const result: string[] = [];
  
  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0);
    
    if (isTashkeel(code)) { result.push(chars[i]); continue; }
    if (code >= 0xE000 && code <= 0xE0FF) { result.push(chars[i]); continue; }
    
    const forms = ARABIC_FORMS[code];
    if (!forms) { result.push(chars[i]); continue; }
    
    if (code === 0x0644) {
      let nextIdx = i + 1;
      while (nextIdx < chars.length && isTashkeel(chars[nextIdx].charCodeAt(0))) nextIdx++;
      if (nextIdx < chars.length) {
        const nextCode = chars[nextIdx].charCodeAt(0);
        const ligature = LAM_ALEF_LIGATURES[nextCode];
        if (ligature) {
          const prevCode = getPrevArabicCode(chars, i);
          const prevConnects = prevCode !== null && canConnectAfter(prevCode);
          result.push(String.fromCharCode(prevConnects ? ligature[1] : ligature[0]));
          i = nextIdx;
          continue;
        }
      }
    }
    
    const prevCode = getPrevArabicCode(chars, i);
    const prevConnects = prevCode !== null && canConnectAfter(prevCode);
    const nextCode = getNextArabicCode(chars, i);
    const nextExists = nextCode !== null && ARABIC_FORMS[nextCode] !== undefined;
    
    let formIndex: number;
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
  
  return result.join('');
}

export function reverseBidi(text: string): string {
  // Protect technical tags as atomic placeholders before BiDi processing
  const tagPattern = /\\?\[\s*\w+\s*:[^\]]*?\s*\\?\](?:\s*\([^)]{1,100}\))?|\[\s*\w+\s*=\s*[^\]]*\]|\{\s*\w+\s*:[^}]*\}|\{[\w]+\}|\d+\s*\\?\[[A-Z]{2,10}\\?\]|\\?\[[A-Z]{2,10}\\?\]\s*\d+|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]/g;
  const tagSlots: string[] = [];
  const shielded = text.replace(tagPattern, (match) => {
    const idx = tagSlots.length;
    tagSlots.push(match);
    // Use a single PUA char sequence that reverseBidi treats as atomic
    return `\uE0F0\uE0F1${String.fromCharCode(0xE0A0 + idx)}\uE0F1\uE0F0`;
  });

  const reversed = shielded.split('\n').map(line => {
    const segments: { text: string; isLTR: boolean }[] = [];
    let current = '';
    let currentIsLTR: boolean | null = null;

    for (const ch of line) {
      const code = ch.charCodeAt(0);
      if (code >= 0xE000 && code <= 0xE0FF) { current += ch; continue; }
      if (code >= 0xFFF9 && code <= 0xFFFC) { current += ch; continue; }
      
      const charIsArabic = isArabicChar(ch);
      const charIsLTR = /[a-zA-Z0-9]/.test(ch);
      
      if (charIsArabic) {
        if (currentIsLTR === true && current) { segments.push({ text: current, isLTR: true }); current = ''; }
        currentIsLTR = false;
        current += ch;
      } else if (charIsLTR) {
        if (currentIsLTR === false && current) { segments.push({ text: current, isLTR: false }); current = ''; }
        currentIsLTR = true;
        current += ch;
      } else {
        current += ch;
      }
    }
    if (current) segments.push({ text: current, isLTR: currentIsLTR === true });

    return segments.reverse().map(seg => {
      if (seg.isLTR) return seg.text;
      // Reverse RTL segment using chunks: consecutive PUA/tag markers stay as atomic blocks
      const chunks: string[] = [];
      let ci = 0;
      const chars = [...seg.text];
      while (ci < chars.length) {
        const cc = chars[ci].charCodeAt(0);
        if ((cc >= 0xE000 && cc <= 0xE0FF) || (cc >= 0xFFF9 && cc <= 0xFFFC)) {
          let group = '';
          while (ci < chars.length) {
            const gc = chars[ci].charCodeAt(0);
            if ((gc >= 0xE000 && gc <= 0xE0FF) || (gc >= 0xFFF9 && gc <= 0xFFFC)) {
              group += chars[ci]; ci++;
            } else break;
          }
          chunks.push(group);
        } else {
          chunks.push(chars[ci]); ci++;
        }
      }
      return chunks.reverse().join('');
    }).join('');
  }).join('\n');

  // Restore protected tags from placeholders
  if (tagSlots.length === 0) return reversed;
  return reversed.replace(/\uE0F0\uE0F1([\uE0A0-\uE0FF])\uE0F1\uE0F0/g, (_m, ch) => {
    const idx = ch.charCodeAt(0) - 0xE0A0;
    return tagSlots[idx] || _m;
  });
}

const NUMERAL_MAP: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

export function convertToArabicNumerals(text: string): string {
  return [...text].map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 0xE000 && code <= 0xE0FF) return ch;
    return NUMERAL_MAP[ch] || ch;
  }).join('');
}

export function mirrorPunctuation(text: string): string {
  const PUNCT_MAP: Record<string, string> = { '?': '؟', ',': '،', ';': '؛' };
  const BRACKET_MAP: Record<string, string> = { '(': ')', ')': '(' };
  
  return [...text].map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 0xE000 && code <= 0xE0FF) return ch;
    return PUNCT_MAP[ch] || BRACKET_MAP[ch] || ch;
  }).join('');
}

export function removeArabicPresentationForms(text: string): string {
  return [...text].map(ch => {
    const code = ch.charCodeAt(0);
    const standardCode = PRESENTATION_FORMS_TO_STANDARD[code];
    return standardCode ? String.fromCharCode(standardCode) : ch;
  }).join('');
}

/** Strip all Arabic diacritics/tashkeel */
function stripDiacritics(text: string): string {
  return text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '');
}

export function processArabicText(text: string, options?: { arabicNumerals?: boolean; mirrorPunct?: boolean }): string {
  if (!hasArabicChars(text)) return text;
  // Strip diacritics first — game font cannot render combining marks (shows dotted circle)
  let result = stripDiacritics(text);
  // Reshape Arabic letters (connect them) then reverse BiDi for LTR game engine
  result = reshapeArabic(result);
  result = reverseBidi(result);
  if (options?.arabicNumerals) result = convertToArabicNumerals(result);
  if (options?.mirrorPunct) result = mirrorPunctuation(result);
  return result;
}

// === BiDi Alignment Fix for Mixed Arabic/English Text ===

const LRI = '\u2068'; // Left-to-Right Isolate
const PDI = '\u2069'; // Pop Directional Isolate
const TAG_BIDI_RE = /\\?\[\s*\/?\s*\w+\s*:[^\]]*?\s*\\?\]|\d+\s*\\?\[[A-Z]{2,10}\\?\]|\\?\[[A-Z]{2,10}\\?\]\s*\d+|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]|\[[^\]]*=.+?\]|\{[^}]*\}|[\uE000-\uE0FF]+|[\uFFF9-\uFFFC]/g;
const ENG_SEQ_RE = /[a-zA-Z][a-zA-Z0-9]*(?:[\s/\\-][a-zA-Z][a-zA-Z0-9]*)*/g;
const ARABIC_CHECK_BIDI_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

/**
 * Fix BiDi alignment issues in mixed Arabic/English text.
 * Wraps English segments with LRI (U+2068) and PDI (U+2069)
 * Unicode isolate markers so they don't disrupt RTL paragraph flow.
 * Safe to call multiple times (idempotent).
 */
export function fixMixedBidi(text: string): string {
  if (!text || !ARABIC_CHECK_BIDI_RE.test(text)) return text;
  return text.split('\n').map(line => {
    if (!line.trim() || line.includes(LRI)) return line;
    const tagRanges: [number, number][] = [];
    const tagRe = new RegExp(TAG_BIDI_RE.source, TAG_BIDI_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(line)) !== null) {
      tagRanges.push([m.index, m.index + m[0].length]);
    }
    const engRe = new RegExp(ENG_SEQ_RE.source, ENG_SEQ_RE.flags);
    const replacements: { start: number; end: number; text: string }[] = [];
    while ((m = engRe.exec(line)) !== null) {
      const s = m.index, e = s + m[0].length;
      if (tagRanges.some(([ts, te]) => s >= ts && e <= te)) continue;
      replacements.push({ start: s, end: e, text: `${LRI}${m[0]}${PDI}` });
    }
    if (replacements.length === 0) return line;
    let result = '';
    let lastEnd = 0;
    for (const r of replacements) {
      result += line.slice(lastEnd, r.start) + r.text;
      lastEnd = r.end;
    }
    result += line.slice(lastEnd);
    return result;
  }).join('\n');
}

/** Strip all BiDi isolate/embedding markers (used before game build) */
export function stripBidiMarkers(text: string): string {
  return text.replace(/[\u2066-\u2069\u202A-\u202E]/g, '');
}
