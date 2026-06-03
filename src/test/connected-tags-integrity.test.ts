import { describe, it, expect } from 'vitest';
import { restoreTagsLocally } from '../lib/xc3-tag-restoration';

describe('Connected Tags Integrity ([Always Active][XENO:n])', () => {
  it('should treat connected bracket tags as an atomic sequence and preserve their relative order', () => {
    const original = "Skill effect [Always Active][XENO:n] applies to all party.";
    // Simulate AI misplacing or reversing tags
    const translation = "تأثير المهارة [XENO:n][Always Active] ينطبق على الفريق.";
    
    const restored = restoreTagsLocally(original, translation);
    
    // The restoration system should rebuild the layout based on original order
    expect(restored).toContain("[Always Active][XENO:n]");
    expect(restored).not.toContain("[XENO:n][Always Active]");
  });

  it('should restore connected tags even if AI completely omits them', () => {
    const original = "Status: [Battle Party][XENO:n] Ready.";
    const translation = "الحالة: جاهز.";
    
    const restored = restoreTagsLocally(original, translation);
    
    expect(restored).toContain("[Battle Party][XENO:n]");
  });

  it('should handle multiple connected tag blocks in one sentence', () => {
    const original = "[TAG1][TAG2] Text [TAG3][TAG4]";
    const translation = "نص";
    
    const restored = restoreTagsLocally(original, translation);
    
    expect(restored).toMatch(/^\[TAG1\]\[TAG2\].*\[TAG3\]\[TAG4\]$/);
  });
});
