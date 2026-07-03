
# خطة تنفيذ Risen 1 — `strings.p00`

## الحالة: تم التحقق من البنية الثنائية بالكامل مقابل ملف حقيقي (19MB)

تحليل → إعادة بناء بدون أي تعديل على النصوص → مطابقة تامة بايت-بايت مع الملف
الأصلي (اختبار round-trip ناجح على ملف Risen 1 حقيقي، وليس بيانات مصطنعة فقط).

## المكوّنات

### 1. `src/lib/risen-p00.ts`
النواة الكاملة (parse + extract + apply translations + build)، بدقة كاملة (full-fidelity):
- `parseRisenP00Full(buffer)`: يقرأ الرأس الرئيسي (48 بايت، توقيع `G3V0`)، يستخرج
  `dataAddress` و`offsetToFileInfo`، يبحث عن جداول `TAB0` **مع التحقق من كل مرشّح**
  (يرفض أي تطابق بايتات مصادف داخل نص UTF-16 عبر فحص `field_count` معقول (1–50)
  واسم أول حقل مطبوع سليم — بدون رمي استثناء، فقط `console.warn` ورفض المرشّح).
- يقرأ `FileInfoHdr` الحقيقي في نهاية الملف ويستخرج **الاسم الحقيقي لكل جدول**
  (`quests.tab` / `infos.tab` / `documents.tab`) من هناك — لا تخمين بالموضع.
- `buildRisenP00(doc)`: إعادة بناء **حتمية بالكامل** من نموذج مُحلَّل بالذاكرة —
  كل بايت بالمخرج محسوب من حقول معروفة (لا بحث-واستبدال على بايتات خام في أي مكان).
  يعيد حساب إزاحات الجداول وأحجامها في `FileInfoHdr` تلقائياً.
- `applyTranslations(doc, translations)`: يطبّق قاموس ترجمات على النموذج قبل البناء.
  المفتاح: `makeKey(table, field, rowIndex)` = `` `${table}::${field}::${rowIndex}` ``.
- Whitelist للحقول القابلة للترجمة: `/^(German|English|French|Italian|Spanish)_Text$/` + `/^(German|English|French)_StageDir$/`.

### 2. `src/lib/risen-extractor.ts`
- `extractEntriesFromP00(buffer)`: يحوّل نتائج `parseRisenP00Full` إلى مصفوفة `ExtractedEntry[]` بصيغة المحرر الحالي.
- **مصدر النص لكل صف مستقل عن باقي الصفوف**: يجرّب `English_Text[r]` ثم `German_Text[r]`
  ثم `French_Text[r]` لنفس الصف — الصف يُحذف فقط إذا كانت كل اللغات فاضية له تحديداً
  (وليس اختيار لغة مصدر واحدة للجدول كامل).
- Context: يبني من حقول `Owner`/`Role`/`Voice` من نفس الصف.

### 3. `src/pages/Risen.tsx`
- صفحة hub مطابقة لأسلوب `Xenoblade.tsx` (Hero + GameInfoSection + زر "ابدأ").
- Accent color مختلف (نستخدم أخضر داكن `#4a7c3f` — يناسب أجواء اللعبة).

### 4. `src/pages/RisenProcess.tsx`
- Upload → parse → استخراج → حفظ الـbuffer الخام في IndexedDB → توجيه إلى `/editor`.
- زر Build → `parseRisenP00Full` + `applyTranslations` + `buildRisenP00` → تنزيل `strings.p00` جديد.
- بناء مستقل داخل الصفحة (بنفس نمط Pokemon وDanganronpa Classic) — لا يمر عبر `useEditorFileIO` المشترك.

## اختبارات (Vitest) — `src/test/risen-tab0-roundtrip.test.ts`
- parse/rebuild roundtrip على buffer مصطنع بنفس الصيغة الحقيقية بالضبط (رأس 48 بايت
  + `FileInfoHdr` حقيقي) — بايت-بايت مطابق.
- اختبار fallback لغة لكل صف (English فاضي/German معبّى)، بما في ذلك حالة وجود
  `German_StageDir` بين الحقول اللغوية (مطابق لترتيب الحقول الحقيقي في `infos.tab`).
- اختبار رفض توقيع `TAB0` مصادف داخل بيانات UTF-16 حقيقية بدون رمي استثناء.
- **ملاحظة**: التحقق مقابل الملف الحقيقي (19MB) تم يدوياً في جلسة التطوير (parse→rebuild
  بايت-بايت مطابق تماماً) لكن الملف نفسه غير مُضاف للمستودع (حجمه كبير جداً لاختبارات CI).
  اختبارات Vitest المرفوعة تستخدم بيانات مصطنعة صغيرة بنفس الصيغة المؤكدة.

## قيود صريحة (مذكورة بصفحة Risen)
- **البتات (Bitmap fonts) غير مدعومة في هذه المرحلة**: التعريب سينتج نصاً UTF-16 عربياً صحيحاً في `strings.p00`، لكن اللعبة لن تعرضه ما لم يُستبدل الخط. هذا خارج نطاق هذه المرحلة.
- **حقل الاستبدال**: افتراضياً نستبدل `English_Text` بالعربي (لأن اللعبة تحمّل حسب لغة الإعدادات والإنجليزية أشيع).
- **الـ 32 بايت الفاصلة**: تُنسخ كما هي بدون تعديل (طوابع زمنية على الأرجح، لا تؤثر على الترجمة).
