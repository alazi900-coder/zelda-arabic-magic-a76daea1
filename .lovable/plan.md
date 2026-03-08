

# خطة: إضافة اختيار نموذج الذكاء الاصطناعي للترجمة

## الوضع الحالي
- النظام يستخدم `gemini-2.0-flash` عند وجود مفتاح شخصي، و `google/gemini-2.5-flash` عبر Lovable AI كاحتياطي
- لا يوجد خيار للمستخدم لتبديل النموذج

## الخطة

### 1. إضافة حالة `aiModel` في `useEditorState.ts`
- إضافة state جديد `aiModel` محفوظ في localStorage
- النماذج المتاحة:
  - `gemini-2.5-flash` (الافتراضي - سريع ومتوازن)
  - `gemini-2.5-pro` (الأدق - أبطأ)
  - `gemini-3.1-pro-preview` (أحدث نموذج)
  - `gpt-5` (دقة ممتازة - مكلف)
- تمرير `aiModel` إلى `useEditorTranslation`

### 2. تحديث `useEditorTranslation.ts`
- إضافة `aiModel` للـ props
- إرسال `aiModel` مع كل طلب ترجمة إلى Edge Function

### 3. تحديث Edge Function `translate-entries/index.ts`
- استقبال `aiModel` من الطلب
- استخدام النموذج المختار في Lovable AI Gateway
- عند استخدام مفتاح Gemini الشخصي: تحويل اسم النموذج لصيغة Google API المباشرة

### 4. تحديث واجهة المستخدم في `Editor.tsx`
- إضافة قائمة اختيار النموذج داخل قسم إعدادات Gemini
- عرض 4 أزرار للنماذج مع وصف مختصر لكل نموذج
- إظهار تحذير عند اختيار النماذج المكلفة

## التفاصيل التقنية

```text
Client (aiModel state) → Edge Function (aiModel param) → Lovable AI Gateway (model field)
                                                        → OR Gemini API direct (model in URL)
```

خريطة تحويل النماذج للمفتاح الشخصي:
- `gemini-2.5-flash` → `gemini-2.5-flash`
- `gemini-2.5-pro` → `gemini-2.5-pro`  
- `gemini-3.1-pro-preview` → يُستخدم عبر Lovable AI فقط
- `gpt-5` → يُستخدم عبر Lovable AI فقط

