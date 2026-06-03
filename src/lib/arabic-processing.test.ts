
import { describe, it, expect } from 'vitest';
import { reverseBidi, reshapeArabic } from './arabic-processing';

describe('Xenoblade Arabic Processing Fix', () => {
  it('should not swap lines when [XENO:n] is present', () => {
    const input = "الجملة الأولى[XENO:n]الجملة الثانية";
    const reshaped = reshapeArabic(input);
    const reversed = reverseBidi(reshaped);
    
    // الترتيب الصحيح: الجملة الأولى (المعكوسة) يجب أن تظل قبل [XENO:n]
    // والجملة الثانية (المعكوسة) يجب أن تظل بعد [XENO:n]
    expect(reversed.indexOf("الأولى")).toBeLessThan(reversed.indexOf("[XENO:n]"));
    expect(reversed.indexOf("[XENO:n]")).toBeLessThan(reversed.indexOf("الثانية"));
  });

  it('should handle [System:PageBreak] similarly', () => {
    const input = "صفحة 1[System:PageBreak]صفحة 2";
    const reshaped = reshapeArabic(input);
    const reversed = reverseBidi(reshaped);
    
    expect(reversed.indexOf("1")).toBeLessThan(reversed.indexOf("[System:PageBreak]"));
    expect(reversed.indexOf("[System:PageBreak]")).toBeLessThan(reversed.indexOf("2"));
  });

  it('should still handle regular newlines independently', () => {
    const input = "سطر 1\nسطر 2";
    const reshaped = reshapeArabic(input);
    const reversed = reverseBidi(reshaped);
    
    expect(reversed.indexOf("1")).toBeLessThan(reversed.indexOf("\n"));
    expect(reversed.indexOf("\n")).toBeLessThan(reversed.indexOf("2"));
  });
});
