import { describe, it, expect } from 'vitest';
import { splitEvenlyByLines } from '@/lib/balance-lines';

describe('splitEvenlyByLines', () => {
  it('returns flat text when numLines is 1', () => {
    const text = 'اذهب إلى القرية واحصل على السيف';
    expect(splitEvenlyByLines(text, 1)).toBe(text);
  });

  it('splits short text into 2 lines evenly', () => {
    const text = 'اذهب إلى القرية واحصل على السيف';
    const result = splitEvenlyByLines(text, 2);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.every(l => l.trim().length > 0)).toBe(true);
  });

  it('splits long text into 3 lines', () => {
    const text = 'هذا النص الطويل يحتاج إلى تقسيم على ثلاثة أسطر لكي يظهر بشكل متوازن في صندوق الحوار';
    const result = splitEvenlyByLines(text, 3);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines.every(l => l.trim().length > 0)).toBe(true);
  });

  it('preserves PUA tags without breaking them', () => {
    const text = 'اضغط \uE001 للمتابعة ثم اضغط \uE002 للإلغاء';
    const result = splitEvenlyByLines(text, 2);
    expect(result).toContain('\uE001');
    expect(result).toContain('\uE002');
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('preserves [ML:] bracket tags', () => {
    const text = 'اضغط [ML:icon icon=btn_a ] للتأكيد واضغط [ML:icon icon=btn_b ] للإلغاء';
    const result = splitEvenlyByLines(text, 2);
    expect(result).toContain('[ML:icon icon=btn_a ]');
    expect(result).toContain('[ML:icon icon=btn_b ]');
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('preserves Platinum {STRVAR_1 N, N, N} and {COLOR N} tags as one atomic unit', () => {
    const text = 'بيضة {STRVAR_1 74, 6, 0} غامضة تلقّتها من {COLOR 2}{STRVAR_1 4, 8, 0}{COLOR 0} اليوم';
    const result = splitEvenlyByLines(text, 2);
    expect(result).toContain('{STRVAR_1 74, 6, 0}');
    expect(result).toContain('{STRVAR_1 4, 8, 0}');
    expect(result).toContain('{COLOR 2}');
    expect(result).toContain('{COLOR 0}');
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    // The tag's internal comma/space must never be split across a line boundary.
    expect(result).not.toMatch(/\{STRVAR_1\s*$/m);
    expect(result).not.toMatch(/^\s*74,/m);
  });

  it('handles text with existing newlines by flattening first', () => {
    const text = 'السطر الأول\nالسطر الثاني\nالسطر الثالث';
    const result = splitEvenlyByLines(text, 2);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('returns flat text when words fewer than numLines', () => {
    const text = 'كلمة';
    const result = splitEvenlyByLines(text, 3);
    expect(result).toBe('كلمة');
  });

  it('handles empty string', () => {
    expect(splitEvenlyByLines('', 2)).toBe('');
  });

  it('avoids orphan words (single word on a line)', () => {
    const text = 'يجب أن تذهب إلى المدينة وتجد السيف القديم';
    const result = splitEvenlyByLines(text, 3);
    const lines = result.split('\n');
    // Each line should have at least 2 words (DP penalty prevents orphans)
    for (const line of lines) {
      const words = line.trim().split(/\s+/).filter(Boolean);
      expect(words.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('handles mixed tags and Arabic text for 3 lines', () => {
    const text = 'حصلت على \uE010 قطعة ذهبية و [ML:icon icon=item ] سيف حديدي من المتجر';
    const result = splitEvenlyByLines(text, 3);
    expect(result).toContain('\uE010');
    expect(result).toContain('[ML:icon icon=item ]');
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
  });
});
