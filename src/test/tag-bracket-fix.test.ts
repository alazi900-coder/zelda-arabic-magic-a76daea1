import { describe, it, expect } from 'vitest';
import { fixTagBracketsStrict, hasTechnicalBracketTag } from '@/lib/tag-bracket-fix';

describe('hasTechnicalBracketTag', () => {
  it('detects [Tag:Value] patterns', () => {
    expect(hasTechnicalBracketTag('Hello [ML:Name] world')).toBe(true);
    expect(hasTechnicalBracketTag('No tags here')).toBe(false);
    expect(hasTechnicalBracketTag('[ML:EnhanceParam paramtype=1 ]')).toBe(true);
  });

  it('detects generic English word tags with spaces and hyphens', () => {
    expect(hasTechnicalBracketTag('Use [Arts Seal] here')).toBe(true);
    expect(hasTechnicalBracketTag('Use [Lock-On] here')).toBe(true);
  });
});

describe('fixTagBracketsStrict', () => {
  it('returns unchanged text when no tags in original', () => {
    const { text } = fixTagBracketsStrict('Hello world', 'مرحبا بالعالم');
    expect(text).toBe('مرحبا بالعالم');
  });

  it('returns unchanged text when tags are already correct', () => {
    const original = 'Hello [ML:Name] world';
    const translation = 'مرحبا [ML:Name] بالعالم';
    const { text } = fixTagBracketsStrict(original, translation);
    expect(text).toBe('مرحبا [ML:Name] بالعالم');
  });

  it('fixes reversed brackets ]tag[', () => {
    const original = 'Hello [ML:Name] world';
    const translation = 'مرحبا ]ML:Name[ بالعالم';
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toBe('مرحبا [ML:Name] بالعالم');
    expect(stats.reversed).toBe(1);
  });

  it('fixes ]tag] mismatched brackets', () => {
    const original = 'Hello [ML:Name] world';
    const translation = 'مرحبا ]ML:Name] بالعالم';
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toBe('مرحبا [ML:Name] بالعالم');
    expect(stats.mismatched).toBe(1);
  });

  it('fixes [tag[ mismatched brackets', () => {
    const original = 'Hello [ML:Name] world';
    const translation = 'مرحبا [ML:Name[ بالعالم';
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toBe('مرحبا [ML:Name] بالعالم');
    expect(stats.mismatched).toBe(1);
  });

  it('wraps bare tag content in brackets', () => {
    const original = 'Hello [ML:Name] world';
    const translation = 'مرحبا ML:Name بالعالم';
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toBe('مرحبا [ML:Name] بالعالم');
    expect(stats.bare).toBe(1);
  });

  it('does NOT delete brackets destructively', () => {
    const original = 'Use [ML:EnhanceParam paramtype=1 ] to boost';
    const translation = 'استخدم [ML:EnhanceParam paramtype=1 ] للتعزيز [ملاحظة]';
    const { text } = fixTagBracketsStrict(original, translation);
    // The [ملاحظة] brackets should NOT be removed
    expect(text).toContain('[ملاحظة]');
    expect(text).toContain('[ML:EnhanceParam paramtype=1 ]');
  });

  it('does NOT remove orphan brackets', () => {
    const original = 'Hello [ML:Name] world';
    const translation = 'مرحبا [ML:Name] بالعالم [اختبار]';
    const { text } = fixTagBracketsStrict(original, translation);
    // Should preserve [اختبار] since we don't do orphan cleanup
    expect(text).toContain('[اختبار]');
  });

  it('handles multiple tags', () => {
    const original = 'Start [ML:A] middle [ML:B] end';
    const translation = 'بداية ]ML:A[ وسط ML:B نهاية';
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toContain('[ML:A]');
    expect(text).toContain('[ML:B]');
    expect(stats.total).toBe(2);
  });

  it('handles tag with optional parentheses description', () => {
    const original = 'Sound [ML:number digit=8 ](Crowd noise)';
    const translation = 'صوت ]ML:number digit=8 [(ضوضاء الجمهور)';
    const { text } = fixTagBracketsStrict(original, translation);
    expect(text).toContain('[ML:number digit=8 ]');
  });

  it('handles bare tag adjacent to Arabic text (no spaces)', () => {
    const original = 'Use [ML:Name] here';
    const translation = 'استخدمML:Nameهنا';
    const { text } = fixTagBracketsStrict(original, translation);
    expect(text).toContain('[ML:Name]');
  });

  it('fixes N[TAG] format (number before tag)', () => {
    const original = 'Show 1[ML] on map';
    const translation = 'عرض 1]ML[ على الخريطة';
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toContain('1[ML]');
    expect(stats.reversed).toBe(1);
  });

  it('fixes bare N TAG format', () => {
    const original = 'Show 1[ML] on map';
    const translation = 'عرض 1ML على الخريطة';
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toContain('1[ML]');
    expect(stats.bare).toBe(1);
  });

  it('fixes [TAG=Value] reversed brackets', () => {
    const original = 'Use [Color=Red] here';
    const translation = 'استخدم ]Color=Red[ هنا';
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toContain('[Color=Red]');
    expect(stats.reversed).toBe(1);
  });

  it('fixes {TAG:Value} reversed braces', () => {
    const original = 'Hello {player:name} world';
    const translation = 'مرحبا }player:name{ بالعالم';
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toContain('{player:name}');
    expect(stats.reversed).toBe(1);
  });

  it('same input produces same output (idempotent)', () => {
    const original = 'Hello [ML:Name] world';
    const translation = 'مرحبا ]ML:Name[ بالعالم';
    const { text: first } = fixTagBracketsStrict(original, translation);
    const { text: second } = fixTagBracketsStrict(original, first);
    expect(second).toBe(first);
  });
});
