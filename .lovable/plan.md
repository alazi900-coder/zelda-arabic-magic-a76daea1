
# خطة تنفيذ Risen 1 — `strings.p00`

## المكوّنات (5 ملفات جديدة + تعديلين)

### 1. `src/lib/risen-tab0-parser.ts` (جديد)
- `parseP00(buffer: ArrayBuffer)`: يفحص الرأس الرئيسي (48 بايت)، يستخرج `offset_to_fileinfo` و`total_filesize`.
- `findAllTab0Offsets(buf)`: بحث ثنائي عن التوقيع `54 41 42 30`.
- `parseTab0(buf, start)`: يطبّق البنية الموثقة بالضبط (flag/unk/name_len/name/row_count/rows، كل row = uint16 len + UTF-16LE).
- يعيد `Tab0Table { name, offset, endOffset, fields: TabField[] }`.
- Whitelist للحقول القابلة للترجمة: `/^(German|English|French|Italian|Spanish)_Text$/` + `/^(German|English|French)_StageDir$/`.
- **تحقق**: يجب أن ينتهي كل حقل عند بدء الحقل التالي بدون فجوة.

### 2. `src/lib/risen-tab0-writer.ts` (جديد)
- `rebuildP00(originalBuffer, translations: Map<string, string>)`:
  1. يستنسخ الجداول الثلاثة، يستبدل قيم `Arabic` (نكتبها فوق `English_Text` أو نضيف حقل جديد — سنستخدم استبدال حقل واحد قابل للاختيار).
  2. يعيد بناء كل TAB0 من الصفر بـ `strLen` جديد (UTF-16 units).
  3. ينسخ الـ 32 بايت الفاصلة كما هي.
  4. يعيد بناء `FileInfoHdr` بإزاحات جديدة.
  5. يحدّث `offset_to_fileinfo` + `total_filesize` في الرأس.
- **قرار**: نستبدل نص `English_Text` بالعربي (لأن اللعبة تحمّل حسب لغة الإعدادات، والإنجليزية أشيع). قابل للتغيير لاحقاً.

### 3. `src/lib/risen-extractor.ts` (جديد)
- `extractEntriesFromP00(buffer)`: يحوّل نتائج `parseP00` إلى مصفوفة `ExtractedEntry[]` بصيغة المحرر الحالي.
- المفتاح: `${tableName}:${fieldName}:${rowIndex}`.
- Source: `English_Text` (fallback: `German_Text`).
- Context: يبني من حقول `Owner`/`Role` من نفس الصف في `infos.tab` (يستفيد من قدرات AI enhance).

### 4. `src/pages/Risen.tsx` (جديد)
- صفحة hub مطابقة لأسلوب `Xenoblade.tsx` (Hero + GameInfoSection + زر "ابدأ").
- Accent color مختلف (نستخدم أخضر داكن `#4a7c3f` — يناسب أجواء اللعبة).

### 5. `src/pages/RisenProcess.tsx` (جديد)
- Upload → parse → استخراج → حفظ في IndexedDB بمفتاح خاص → توجيه إلى `/editor?source=risen`.
- زر Build → يقرأ الترجمات من الحالة → `rebuildP00` → تنزيل `strings.p00` جديد.
- يستخدم `useEditorFileIO` بنفس النمط.

### تعديلات
- **`src/App.tsx`**: إضافة `<Route path="/risen">` و `<Route path="/risen/process">`.
- **`src/pages/Home.tsx`**: إضافة بطاقة Risen 1 لقائمة الألعاب.
- **`src/hooks/useEditorFileIO.ts`** (تعديل بسيط): دعم `source=risen` عند البناء لاستدعاء `rebuildP00` بدلاً من BDAT writer.
- **`src/lib/changelog.ts` + `version.ts` + `index.html`**: bump 0.x.y → 0.(x+1).0 مع سطر "دعم أولي للعبة Risen 1".

## اختبارات (Vitest)
- `src/test/risen-tab0-roundtrip.test.ts`: يبني buffer TAB0 مصطنع صغير (3 حقول × 2 صف)، parse → modify → rebuild → parse مجدداً → القيم مطابقة والحجم متسق.
- **بدون ملف حقيقي**: نعتمد على البنية الموثقة والاختبارات المصطنعة.

## قيود صريحة (سنُعلمها للمستخدم في صفحة Risen)
- **البتات (Bitmap fonts) غير مدعومة في هذه المرحلة**: التعريب سينتج نصاً UTF-16 عربياً صحيحاً في `strings.p00`، لكن اللعبة لن تعرضه ما لم يُستبدل الخط. هذا خارج نطاق هذه المرحلة.
- **BiDi/reshaping**: سنطبّق pre-shaping + BiDi reversal اختيارياً كـ toggle في المحرر (نفس منطق XC1 DE)، لأن Genome Engine لا يدعم Unicode BiDi.
- **حقل الاستبدال**: افتراضياً نستبدل `English_Text`. المستخدم يقدر يغيّر إلى حقل آخر من إعدادات الصفحة.
- **الـ 32 بايت الفاصلة**: تُنسخ كما هي بدون تعديل (طوابع زمنية على الأرجح، لا تؤثر على الترجمة).

## ترتيب التنفيذ
1. parser + writer + اختبار roundtrip → تحقق بالبناء
2. extractor + صفحة Risen + RisenProcess
3. تعديل useEditorFileIO + App routes + Home card
4. version bump + changelog

## مخاطر معروفة
- **لا يوجد ملف حقيقي للاختبار**: قد نكتشف انحرافات صغيرة عند تجربة أول ملف. سيحتاج جولة إصلاح واحدة على الأقل بعد رفع المستخدم ملفاً حقيقياً.
- **حقل Arabic منفصل بدل استبدال English**: خيار بديل نظرياً لكنه يزيد `field_count` من 6 إلى 7، وقد يكسر تحقق داخلي في اللعبة. لذلك اخترنا الاستبدال.
