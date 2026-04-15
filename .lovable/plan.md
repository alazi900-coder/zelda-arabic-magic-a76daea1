

## خطة: تحسين Atomic Tag Grouping بناءً على ملاحظات ChatGPT

### الملاحظات المقبولة (3 نقاط صحيحة)

**1. Adjacency check بدل الاعتماد على `relPos` فقط**
- صحيح: وسمان بنفس `relPos` قد يكون بينهما مسافة/سطر جديد — يجب فحص النص الفعلي بينهما في الأصل
- الحل: فحص `original.slice(tagA.end, tagB.start)` — إذا كان فارغاً أو مسافات فقط → نفس المجموعة

**2. منع دمج أنواع مختلفة (PUA vs XENO)**
- صحيح: `\uE000` و `[XENO:wait]` لا يجب أن يكونا في نفس الكتلة الذرية حتى لو كانا متجاورين
- الحل: تصنيف الوسوم إلى أنواع (PUA / bracket / brace / control) ومنع الدمج بين الأنواع

**3. اختبار "false adjacency" — وسوم غير متجاورة أصلاً لا تُدمج**
- صحيح: `[wait]Hello[del]` → بينهما نص → يجب أن تبقى منفصلة حتى لو الترجمة قرّبتهما

### التعديلات

**الملف `src/lib/xc3-tag-restoration.ts`** (الجزء الأساسي):

بعد بناء `tagPositions[]` (سطر 180-196)، إضافة منطق تجميع ذري محسّن:

```text
tagPositions مع endIndex لكل وسم في النص الأصلي
      ↓
فحص adjacency: هل النص بين وسم A ووسم B في الأصل فارغ/مسافات فقط؟
      ↓
فحص النوع: هل A و B من نفس الفئة (PUA/bracket/brace)؟
      ↓
إذا نعم لكليهما → نفس المجموعة
      ↓
كل مجموعة تُدخل ككتلة واحدة (concatenation)
```

- إضافة دالة `getTagType(tag)` تُرجع `'pua' | 'control' | 'bracket' | 'brace'`
- إضافة دالة `areAdjacent(original, endA, startB)` تفحص النص الفعلي بينهما
- تعديل `TagPosition` ليشمل `startIdx` و `endIdx` في النص الأصلي

**الملف `src/test/tag-order-sequence.test.ts`** — اختبارات جديدة:
- وسوم متجاورة من نفس النوع → تبقى ككتلة
- وسوم متجاورة من أنواع مختلفة (PUA + XENO) → لا تُدمج
- وسوم بينها نص في الأصل → لا تُدمج حتى لو الترجمة قرّبتها
- `[XENO:wait]Hello[XENO:del]` → تبقى منفصلة في الترجمة

### الملفات المعدلة
1. `src/lib/xc3-tag-restoration.ts` — adjacency + type checking + atomic grouping
2. `src/test/tag-order-sequence.test.ts` — 4 اختبارات جديدة

