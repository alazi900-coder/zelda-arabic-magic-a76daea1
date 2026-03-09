import { describe, it, expect } from 'vitest';
import {
  fixTaaMarbutaHaa,
  fixYaaAlefMaqsura,
  fixRepeatedWords,
  cleanAIArtifacts,
  fixLonelyLam,
  scanAllTextFixes,
} from '@/lib/arabic-text-fixes';

describe('Arabic Text Fixes', () => {
  // === 1. Taa Marbuta / Haa ===
  describe('fixTaaMarbutaHaa', () => {
    it('should fix ه→ة in known words', () => {
      const r = fixTaaMarbutaHaa('هذه لعبه رائعه');
      expect(r.fixed).toBe('هذه لعبة رائعه'); // لعبه→لعبة, رائعه stays (not in dict)
      expect(r.changes).toBe(1);
    });

    it('should fix مهمه→مهمة', () => {
      const r = fixTaaMarbutaHaa('هذه مهمه صعبه');
      expect(r.fixed).toBe('هذه مهمة صعبه');
      expect(r.changes).toBe(1);
    });

    it('should not change correct text', () => {
      const r = fixTaaMarbutaHaa('هذه لعبة رائعة');
      expect(r.changes).toBe(0);
      expect(r.fixed).toBe('هذه لعبة رائعة');
    });

    it('should not change هذه (not in dict as هذة)', () => {
      const r = fixTaaMarbutaHaa('هذه جميل');
      expect(r.changes).toBe(0);
    });

    it('should protect technical tags', () => {
      const r = fixTaaMarbutaHaa('لعبه [ML:icon a] منطقه');
      expect(r.fixed).toBe('لعبة [ML:icon a] منطقة');
      expect(r.fixed).toContain('[ML:icon a]');
    });

    it('should handle word at end of string', () => {
      const r = fixTaaMarbutaHaa('هذه لعبه');
      expect(r.fixed).toBe('هذه لعبة');
    });
  });

  // === 2. Yaa / Alef Maqsura ===
  describe('fixYaaAlefMaqsura', () => {
    it('should fix علي→على', () => {
      const r = fixYaaAlefMaqsura('اذهب علي الجبل');
      expect(r.fixed).toBe('اذهب على الجبل');
      expect(r.changes).toBe(1);
    });

    it('should fix إلي→إلى', () => {
      const r = fixYaaAlefMaqsura('اذهب إلي هناك');
      expect(r.fixed).toBe('اذهب إلى هناك');
    });

    it('should fix فى→في', () => {
      const r = fixYaaAlefMaqsura('فى البداية');
      expect(r.fixed).toBe('في البداية');
    });

    it('should fix الذى→الذي', () => {
      const r = fixYaaAlefMaqsura('الشخص الذى ذهب');
      expect(r.fixed).toBe('الشخص الذي ذهب');
    });

    it('should not change correct text', () => {
      const r = fixYaaAlefMaqsura('على الجبل في المدينة');
      expect(r.changes).toBe(0);
    });

    it('should protect tags', () => {
      const r = fixYaaAlefMaqsura('علي [ML:test] إلي');
      expect(r.fixed).toContain('[ML:test]');
      expect(r.fixed).toContain('على');
      expect(r.fixed).toContain('إلى');
    });
  });

  // === 3. Repeated Words ===
  describe('fixRepeatedWords', () => {
    it('should remove consecutive duplicate Arabic words', () => {
      const r = fixRepeatedWords('الذهاب الذهاب إلى المدينة');
      expect(r.fixed).toBe('الذهاب إلى المدينة');
      expect(r.changes).toBe(1);
    });

    it('should remove consecutive duplicate English words', () => {
      const r = fixRepeatedWords('the the house');
      expect(r.fixed).toBe('the house');
      expect(r.changes).toBe(1);
    });

    it('should handle multiple duplicates', () => {
      const r = fixRepeatedWords('هذا هذا هو هو النص');
      expect(r.fixed).toBe('هذا هو النص');
      expect(r.changes).toBe(2);
    });

    it('should not remove single-char duplicates', () => {
      const r = fixRepeatedWords('و و');
      expect(r.changes).toBe(0); // single char, skip
    });

    it('should not change non-duplicate text', () => {
      const r = fixRepeatedWords('كلمة أخرى مختلفة');
      expect(r.changes).toBe(0);
    });

    it('should protect tags', () => {
      const r = fixRepeatedWords('كلمة كلمة [ML:icon]');
      expect(r.fixed).toContain('[ML:icon]');
      expect(r.changes).toBe(1);
    });
  });

  // === 4. AI Artifacts ===
  describe('cleanAIArtifacts', () => {
    it('should remove بالتأكيد prefix', () => {
      const r = cleanAIArtifacts('بالتأكيد! هذا هو النص');
      expect(r.fixed).toBe('هذا هو النص');
      expect(r.changes).toBe(1);
    });

    it('should remove إليك الترجمة prefix', () => {
      const r = cleanAIArtifacts('إليك الترجمة: مرحبا بالعالم');
      expect(r.fixed).toBe('مرحبا بالعالم');
    });

    it('should remove English prefix', () => {
      const r = cleanAIArtifacts("Here's the translation: مرحبا");
      expect(r.fixed).toBe('مرحبا');
    });

    it('should remove Sure prefix', () => {
      const r = cleanAIArtifacts("Sure, here's: مرحبا");
      expect(r.fixed).toBe('مرحبا');
    });

    it('should remove wrapping quotes', () => {
      const r = cleanAIArtifacts('"مرحبا بالعالم"');
      expect(r.fixed).toBe('مرحبا بالعالم');
    });

    it('should remove suffix tag', () => {
      const r = cleanAIArtifacts('مرحبا (ترجمة)');
      expect(r.fixed).toBe('مرحبا');
    });

    it('should not change clean text', () => {
      const r = cleanAIArtifacts('هذا نص عادي');
      expect(r.changes).toBe(0);
    });
  });

  // === 5. Lonely Lam (ل → لا) ===
  describe('fixLonelyLam', () => {
    it('should fix standalone ل to لا', () => {
      const r = fixLonelyLam('هذا ل يمكن');
      expect(r.fixed).toBe('هذا لا يمكن');
      expect(r.changes).toBe(1);
    });

    it('should fix ل at start of text', () => {
      const r = fixLonelyLam('ل تذهب هناك');
      expect(r.fixed).toBe('لا تذهب هناك');
      expect(r.changes).toBe(1);
    });

    it('should fix multiple standalone ل', () => {
      const r = fixLonelyLam('ل تذهب ل ترجع');
      expect(r.fixed).toBe('لا تذهب لا ترجع');
      expect(r.changes).toBe(2);
    });

    it('should not change ل attached to words', () => {
      const r = fixLonelyLam('للذهاب إلى المدينة');
      expect(r.changes).toBe(0);
    });

    it('should not change correct لا', () => {
      const r = fixLonelyLam('لا تذهب هناك');
      expect(r.changes).toBe(0);
    });

    it('should protect tags', () => {
      const r = fixLonelyLam('ل [ML:icon] تذهب');
      expect(r.fixed).toContain('[ML:icon]');
      expect(r.fixed).toContain('لا');
    });
  });

  // === 5. Combined scan ===
  describe('scanAllTextFixes', () => {
    it('should find multiple fix types across entries', () => {
      const results = scanAllTextFixes({
        'k1': 'هذه لعبه',
        'k2': 'اذهب علي الجبل',
        'k3': 'الذهاب الذهاب',
        'k4': 'بالتأكيد! مرحبا',
        'k5': 'نص سليم تماماً',
        'k6': 'هذا ل يمكن',
      });
      
      expect(results.length).toBeGreaterThanOrEqual(5);
      expect(results.find(r => r.fixType === 'taa-haa')).toBeTruthy();
      expect(results.find(r => r.fixType === 'yaa-alef')).toBeTruthy();
      expect(results.find(r => r.fixType === 'repeated')).toBeTruthy();
      expect(results.find(r => r.fixType === 'ai-artifact')).toBeTruthy();
      expect(results.find(r => r.fixType === 'lonely-lam')).toBeTruthy();
      // k5 should produce no results
      expect(results.filter(r => r.key === 'k5')).toHaveLength(0);
    });

    it('should chain fixes correctly for same key', () => {
      const results = scanAllTextFixes({
        'k1': 'بالتأكيد! هذه لعبه لعبه',
      });
      // Should find: ai-artifact, repeated, taa-haa
      const types = results.map(r => r.fixType);
      expect(types).toContain('ai-artifact');
      expect(types).toContain('repeated');
      expect(types).toContain('taa-haa');
    });

    it('should return empty for clean translations', () => {
      const results = scanAllTextFixes({
        'k1': 'نص عربي سليم',
        'k2': 'على الجبل في المدينة',
      });
      expect(results).toHaveLength(0);
    });
  });
});
