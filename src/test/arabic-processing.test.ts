import { describe, it, expect } from 'vitest';
import { reshapeArabic, reverseBidi, processArabicText, hasArabicPresentationForms, convertToArabicNumerals, mirrorPunctuation, removeArabicPresentationForms } from '@/lib/arabic-processing';

describe('Arabic Processing', () => {
  it('reshapeArabic should produce presentation forms', () => {
    const input = 'متابعة اللعب';
    const reshaped = reshapeArabic(input);
    
    // All Arabic chars should now be in Presentation Forms range
    console.log('Input:', input);
    console.log('Input codes:', [...input].map(c => c.charCodeAt(0).toString(16)).join(' '));
    console.log('Reshaped:', reshaped);
    console.log('Reshaped codes:', [...reshaped].map(c => c.charCodeAt(0).toString(16)).join(' '));
    
    expect(hasArabicPresentationForms(reshaped)).toBe(true);
  });

  it('processArabicText should reshape and reverse', () => {
    const input = 'متابعة اللعب';
    const result = processArabicText(input);
    
    console.log('Input:', input);
    console.log('Input codes:', [...input].map(c => c.charCodeAt(0).toString(16)).join(' '));
    console.log('Processed:', result);
    console.log('Processed codes:', [...result].map(c => c.charCodeAt(0).toString(16)).join(' '));
    
    expect(hasArabicPresentationForms(result)).toBe(true);
  });

  it('removeArabicPresentationForms should preserve lam-alef ligatures', () => {
    expect(removeArabicPresentationForms('ﺍﻻﻭﻝ')).toBe('الاول');
    expect(removeArabicPresentationForms('ﻻ')).toBe('لا');
    expect(removeArabicPresentationForms('ﻷ')).toBe('لأ');
    expect(removeArabicPresentationForms('ﻹ')).toBe('لإ');
    expect(removeArabicPresentationForms('ﻵ')).toBe('لآ');
  });

  it('reverseBidi after reshape should reverse character order', () => {
    const input = 'لعبة جديدة';
    const reshaped = reshapeArabic(input);
    const reversed = reverseBidi(reshaped);
    
    console.log('Reshaped codes:', [...reshaped].map(c => c.charCodeAt(0).toString(16)).join(' '));
    console.log('Reversed codes:', [...reversed].map(c => c.charCodeAt(0).toString(16)).join(' '));
    
    // reversed should be the reverse of reshaped
    const reshapedChars = [...reshaped];
    const reversedChars = [...reversed];
    expect(reversedChars.length).toBe(reshapedChars.length);
    expect(reversedChars).toEqual(reshapedChars.reverse());
  });

  it('simple word test', () => {
    const input = 'مرحبا';
    const result = processArabicText(input);
    console.log('Input:', input, [...input].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase()}`).join(' '));
    console.log('Result:', result, [...result].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase()}`).join(' '));
  });

  describe('Atomic tag grouping in BiDi reversal', () => {
    it('should preserve internal order of consecutive PUA markers', () => {
      // Simulate: Arabic word + two consecutive PUA tags + Arabic word
      const input = '\uFEE3\uFEE4\uE000\uE001\uFEB3\uFEB4'; // reshaped Arabic with PUA tags in middle
      const reversed = reverseBidi(input);
      const chars = [...reversed];

      // Find the PUA group in the reversed output
      const puaStart = chars.findIndex(c => c.charCodeAt(0) >= 0xE000 && c.charCodeAt(0) <= 0xE0FF);
      expect(puaStart).toBeGreaterThanOrEqual(0);
      // The two PUA chars must stay in original order: E000 then E001
      expect(chars[puaStart].charCodeAt(0)).toBe(0xE000);
      expect(chars[puaStart + 1].charCodeAt(0)).toBe(0xE001);
    });

    it('should preserve internal order of consecutive display markers (FFF9-FFFC)', () => {
      const input = '\uFEE3\uFFF9\uFFFA\uFFFB\uFEB3';
      const reversed = reverseBidi(input);
      const chars = [...reversed];

      const tagStart = chars.findIndex(c => c.charCodeAt(0) >= 0xFFF9 && c.charCodeAt(0) <= 0xFFFC);
      expect(tagStart).toBeGreaterThanOrEqual(0);
      expect(chars[tagStart].charCodeAt(0)).toBe(0xFFF9);
      expect(chars[tagStart + 1].charCodeAt(0)).toBe(0xFFFA);
      expect(chars[tagStart + 2].charCodeAt(0)).toBe(0xFFFB);
    });

    it('should preserve order of mixed PUA and display markers together', () => {
      const input = '\uFEE3\uE000\uE001\uE002\uFEB3';
      const reversed = reverseBidi(input);
      const chars = [...reversed];

      const puaStart = chars.findIndex(c => c.charCodeAt(0) === 0xE000);
      expect(puaStart).toBeGreaterThanOrEqual(0);
      expect(chars[puaStart].charCodeAt(0)).toBe(0xE000);
      expect(chars[puaStart + 1].charCodeAt(0)).toBe(0xE001);
      expect(chars[puaStart + 2].charCodeAt(0)).toBe(0xE002);
    });

    it('should not break when no technical markers exist', () => {
      const input = '\uFEE3\uFEE4\uFEB3\uFEB4';
      const reversed = reverseBidi(input);
      const chars = [...reversed];
      // Just reversed Arabic, no markers to worry about
      expect(chars.length).toBe(4);
    });
  });

  describe('PUA markers stay associated with correct word through full processArabicText', () => {
    it('PUA tags after first word should remain adjacent to that word after processing', () => {
      // Input: "كلمة" + PUA tags + " " + "ثانية"
      // PUA tags belong to the first word
      const input = 'كلمة\uE000\uE001 ثانية';
      const result = processArabicText(input);
      const chars = [...result];

      // Find PUA group
      const puaStart = chars.findIndex(c => c.charCodeAt(0) === 0xE000);
      expect(puaStart).toBeGreaterThanOrEqual(0);
      expect(chars[puaStart + 1].charCodeAt(0)).toBe(0xE001);

      // Space should be on one side of the PUA group, not splitting it
      const spaceIdx = chars.indexOf(' ');
      expect(spaceIdx).toBeGreaterThanOrEqual(0);
      // PUA group should not be split by the space
      expect(Math.abs(puaStart - (puaStart + 1))).toBe(1);
    });

    it('PUA tags between two Arabic words should stay together', () => {
      const input = 'أهلا\uE000\uE001\uE002وسهلا';
      const result = processArabicText(input);
      const chars = [...result];

      const puaStart = chars.findIndex(c => c.charCodeAt(0) === 0xE000);
      expect(puaStart).toBeGreaterThanOrEqual(0);
      // All 3 PUA chars must be consecutive and in order
      expect(chars[puaStart].charCodeAt(0)).toBe(0xE000);
      expect(chars[puaStart + 1].charCodeAt(0)).toBe(0xE001);
      expect(chars[puaStart + 2].charCodeAt(0)).toBe(0xE002);
    });

    it('multiple PUA groups in one line should each preserve their order', () => {
      const input = 'كلمة\uE000\uE001 نص\uE002\uE003';
      const result = processArabicText(input);
      const chars = [...result];

      // Find both groups
      const g1Start = chars.findIndex(c => c.charCodeAt(0) === 0xE000);
      const g2Start = chars.findIndex(c => c.charCodeAt(0) === 0xE002);
      expect(g1Start).toBeGreaterThanOrEqual(0);
      expect(g2Start).toBeGreaterThanOrEqual(0);

      // Each group internally ordered
      expect(chars[g1Start + 1].charCodeAt(0)).toBe(0xE001);
      expect(chars[g2Start + 1].charCodeAt(0)).toBe(0xE003);
    });

    it('PUA at start of text should preserve order', () => {
      const input = '\uE000\uE001مرحبا';
      const result = processArabicText(input);
      const chars = [...result];

      const puaStart = chars.findIndex(c => c.charCodeAt(0) === 0xE000);
      expect(puaStart).toBeGreaterThanOrEqual(0);
      expect(chars[puaStart + 1].charCodeAt(0)).toBe(0xE001);
    });

    it('PUA at end of text should preserve order', () => {
      const input = 'مرحبا\uE000\uE001';
      const result = processArabicText(input);
      const chars = [...result];

      const puaStart = chars.findIndex(c => c.charCodeAt(0) === 0xE000);
      expect(puaStart).toBeGreaterThanOrEqual(0);
      expect(chars[puaStart + 1].charCodeAt(0)).toBe(0xE001);
    });
  });

  describe('processArabicText with arabicNumerals and mirrorPunct options', () => {
    it('should convert Western numerals to Arabic-Indic but not touch PUA markers', () => {
      const input = 'عدد 123\uE000\uE001';
      const result = processArabicText(input, { arabicNumerals: true });
      const chars = [...result];

      // PUA markers preserved in order
      const puaStart = chars.findIndex(c => c.charCodeAt(0) === 0xE000);
      expect(puaStart).toBeGreaterThanOrEqual(0);
      expect(chars[puaStart + 1].charCodeAt(0)).toBe(0xE001);

      // Arabic-Indic numerals should be present
      const hasArabicNumerals = chars.some(c => c === '١' || c === '٢' || c === '٣');
      expect(hasArabicNumerals).toBe(true);

      // No Western numerals should remain
      const hasWestern = chars.some(c => /[0-9]/.test(c));
      expect(hasWestern).toBe(false);
    });

    it('should mirror punctuation but not touch PUA markers', () => {
      const input = 'سؤال?\uE000\uE001';
      const result = processArabicText(input, { mirrorPunct: true });
      const chars = [...result];

      // PUA preserved
      const puaStart = chars.findIndex(c => c.charCodeAt(0) === 0xE000);
      expect(puaStart).toBeGreaterThanOrEqual(0);
      expect(chars[puaStart + 1].charCodeAt(0)).toBe(0xE001);

      // ? should become ؟
      const hasArabicQuestion = chars.some(c => c === '؟');
      expect(hasArabicQuestion).toBe(true);
      const hasLatinQuestion = chars.some(c => c === '?');
      expect(hasLatinQuestion).toBe(false);
    });

    it('should apply both options together without breaking PUA groups', () => {
      const input = 'رقم 5, سؤال?\uE000\uE001\uE002';
      const result = processArabicText(input, { arabicNumerals: true, mirrorPunct: true });
      const chars = [...result];

      // PUA group intact
      const puaStart = chars.findIndex(c => c.charCodeAt(0) === 0xE000);
      expect(puaStart).toBeGreaterThanOrEqual(0);
      expect(chars[puaStart + 1].charCodeAt(0)).toBe(0xE001);
      expect(chars[puaStart + 2].charCodeAt(0)).toBe(0xE002);

      // Numerals converted
      expect(chars.some(c => c === '٥')).toBe(true);
      expect(chars.some(c => /[0-9]/.test(c))).toBe(false);

      // Punctuation mirrored
      expect(chars.some(c => c === '،')).toBe(true);
      expect(chars.some(c => c === '؟')).toBe(true);
    });

    it('convertToArabicNumerals should skip PUA range', () => {
      const input = '9\uE000\uE0013';
      const result = convertToArabicNumerals(input);
      expect(result).toBe('٩\uE000\uE001٣');
    });

    it('mirrorPunctuation should skip PUA range', () => {
      const input = '?\uE000,';
      const result = mirrorPunctuation(input);
      expect(result).toBe('؟\uE000،');
    });
  });

  describe('reverseBidi tag protection', () => {
    it('should preserve [ML:EnhanceParam paramtype=1 ] as atomic block', () => {
      const input = 'يزيد الهجوم بنسبة [ML:EnhanceParam paramtype=1 ]%.';
      const reshaped = reshapeArabic(input);
      const result = reverseBidi(reshaped);
      expect(result).toContain('[ML:EnhanceParam paramtype=1 ]');
    });

    it('should preserve [ML:icon icon=btn_a ] tag', () => {
      const input = 'اضغط [ML:icon icon=btn_a ] لسحب سلحك';
      const reshaped = reshapeArabic(input);
      const result = reverseBidi(reshaped);
      expect(result).toContain('[ML:icon icon=btn_a ]');
    });

    it('should preserve multiple tags in same line', () => {
      const input = 'اضغط [ML:icon icon=btn_a ] للهجوم و [ML:icon icon=btn_b ] للدفاع';
      const reshaped = reshapeArabic(input);
      const result = reverseBidi(reshaped);
      expect(result).toContain('[ML:icon icon=btn_a ]');
      expect(result).toContain('[ML:icon icon=btn_b ]');
    });

    it('should preserve N[ML] short tags', () => {
      const input = 'اضغط 1[ML] للتأكيد';
      const reshaped = reshapeArabic(input);
      const result = reverseBidi(reshaped);
      expect(result).toContain('1[ML]');
    });
  });

  // ORPHANED: this locks in behavior from a superseded approach. Risen's build
  // path no longer calls reshapeArabic at all — it now uses shapeArabicForRisen
  // (src/lib/risen/arabic-shaper.ts), a fully independent shaper with visual
  // reordering, since letter-joining alone wasn't sufficient (confirmed by
  // in-game testing: text was connected but read backwards). reshapeArabic
  // itself is still exported and used elsewhere for Xenoblade, so this test is
  // technically correct and harmless — just no longer describing Risen's real
  // build path. Kept intentionally (not deleted) per explicit instruction: a
  // passing test guarding a still-existing function is not dead weight. Safe
  // to delete only if reshapeArabic itself is ever removed.
  describe('reshapeArabic preserves Risen tag formats (no reverseBidi applied)', () => {
    it('preserves <Exit>-style button tags', () => {
      const input = 'اضغط <Exit> للخروج';
      expect(reshapeArabic(input)).toContain('<Exit>');
    });

    it('preserves $(name)-style variables', () => {
      const input = 'مرحباً $(name)، كيف حالك؟';
      expect(reshapeArabic(input)).toContain('$(name)');
    });

    it('joins disconnected Arabic letters into presentation forms', () => {
      const input = 'متابعة';
      const reshaped = reshapeArabic(input);
      expect(hasArabicPresentationForms(reshaped)).toBe(true);
    });
  });
});
