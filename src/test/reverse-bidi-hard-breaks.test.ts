import { describe, it, expect } from 'vitest';
import { reverseBidi, reshapeArabic } from '@/lib/arabic-processing';

/**
 * Regression: lines around [XENO:n] and [System:PageBreak] must NOT swap
 * during BiDi reversal. The hard-break tokens are line terminators in the
 * XC3 engine and must be treated as independent atomic segments.
 *
 * Previously a stateful /g regex used with .test() caused intermittent
 * misclassification of these tokens, producing reversed line order in-game.
 */
describe('reverseBidi preserves order around hard breaks', () => {
  it('does not swap two Arabic lines separated by [XENO:n ]', () => {
    const first = 'الجملة الأولى';
    const second = 'الجملة الثانية';
    const input = reshapeArabic(first) + '[XENO:n ]\n' + reshapeArabic(second);
    const out = reverseBidi(input);

    const firstIdx = out.indexOf('[XENO:n ]');
    expect(firstIdx).toBeGreaterThan(0);
    // The first segment should appear before the hard break, second after.
    const before = out.slice(0, firstIdx);
    const after = out.slice(firstIdx + '[XENO:n ]'.length);
    expect(before).toContain(reverseBidi(reshapeArabic(first)));
    expect(after).toContain(reverseBidi(reshapeArabic(second)));
  });

  it('does not swap lines separated by [System:PageBreak ]', () => {
    const a = 'سطر أ';
    const b = 'سطر ب';
    const input = reshapeArabic(a) + '[System:PageBreak ]' + reshapeArabic(b);
    const out = reverseBidi(input);
    const idxA = out.indexOf(reverseBidi(reshapeArabic(a)));
    const idxB = out.indexOf(reverseBidi(reshapeArabic(b)));
    const idxBreak = out.indexOf('[System:PageBreak ]');
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxBreak);
    expect(idxBreak).toBeLessThan(idxB);
  });

  it('handles realistic XC1 cutscene with multiple hard breaks without swapping', () => {
    // Real-world shape from Xenoblade scripts
    const original =
      'مرحبًا هناك.[XENO:wait wait=key ][System:PageBreak ]ماذا أُحضّر[XENO:n ]\nللعشاء؟[XENO:wait wait=key ][System:PageBreak ]ربما لفائف ملفوف؟[XENO:n ]\nإنها تخصصي.';
    const reshaped = reshapeArabic(original);
    const out = reverseBidi(reshaped);

    // All hard-break tokens preserved in original order
    const tokens = ['[XENO:wait wait=key ]', '[System:PageBreak ]', '[XENO:n ]',
                    '[XENO:wait wait=key ]', '[System:PageBreak ]', '[XENO:n ]'];
    let pos = 0;
    for (const t of tokens) {
      const idx = out.indexOf(t, pos);
      expect(idx, `missing or out-of-order token ${t}`).toBeGreaterThanOrEqual(pos);
      pos = idx + t.length;
    }
  });

  it('stable across repeated calls (no lastIndex pollution)', () => {
    const input = reshapeArabic('أ') + '[XENO:n ]\n' + reshapeArabic('ب');
    const r1 = reverseBidi(input);
    const r2 = reverseBidi(input);
    const r3 = reverseBidi(input);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it('non-global hardBreakTest does not produce stateful side effects', () => {
    // Mix many calls with different inputs to surface any /g lastIndex bug
    const inputs = [
      'x[XENO:n ]y',
      'a[System:PageBreak ]b',
      'plain text no break',
      'one[XENO:n ]\ntwo[XENO:n ]\nthree',
    ];
    for (let i = 0; i < 20; i++) {
      for (const inp of inputs) {
        const out = reverseBidi(inp);
        if (inp.includes('[XENO:n ]')) expect(out).toContain('[XENO:n ]');
        if (inp.includes('[System:PageBreak ]')) expect(out).toContain('[System:PageBreak ]');
      }
    }
  });
});
