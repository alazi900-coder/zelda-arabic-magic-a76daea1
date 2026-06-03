import { describe, it, expect } from 'vitest';
import { protectTags } from '../lib/xc3-tag-protection';
import { restoreTagsLocally } from '../lib/xc3-tag-restoration';

describe('اختبار النص المعقد للمستخدم', () => {
  it('يجب أن يحمي الوسوم المتصلة ويعيدها لمكانها الصحيح في البداية', () => {
    const original = "[Always Active][XENO:n]Successfully completed[XENO:n]quests award more EXP.";
    
    // 1. التحقق من الحماية (ما يراه الذكاء الاصطناعي)
    const protectedData = protectTags(original);
    // نتوقع العثور على 4 وسوم: [Always Active], [XENO:n], [XENO:n], EXP
    expect(protectedData.tags.length).toBe(4);
    expect(protectedData.tags[0].original).toBe("[Always Active]");
    
    // 2. محاكاة ترجمة خاطئة من الذكاء الاصطناعي (بعثرة الوسوم ورميها في النهاية)
    const aiTranslation = "تمنح المهام المكتملة بنجاح المزيد من EXP. [XENO:n][Always Active][XENO:n]";
    
    // 3. محاولة الإصلاح التلقائي بواسطة النظام
    const restored = restoreTagsLocally(original, aiTranslation);
    
    // التحقق من النتيجة النهائية
    // يجب أن تبدأ بالوسوم المتصلة بالترتيب الصحيح
    expect(restored.startsWith("[Always Active][XENO:n]")).toBe(true);
  });
});
