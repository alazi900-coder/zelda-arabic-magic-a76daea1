

## تقييمي للتحليل

التحليل دقيق ومتقدم جداً. هذه قراءتي بصراحة:

**أصاب فيه (100%):**
- **غياب Single Source of Truth** — النص يمر بـ7+ تحويلات وكل طبقة تعيد تفسيره.
- **`[XENO:n ]` كـ semantic anchor** — حلّيناها جزئياً (hard-break في balancing) لكنها لم تصبح Token حقيقي في كامل الـpipeline.
- **Cache/versioning** — حرج. لا يوجد `SCHEMA_VERSION` يمسح IndexedDB عند تغيّر بنية البيانات.
- **Non-deterministic pipeline** — صحيح جزئياً. ترتيب arabic-processing + tag-protection + balance أحياناً يعطي مخرجات مختلفة.
- **Web Worker للأداء** — صحيح للجوال.

**مبالغ فيه:**
- **"Parser based بدل regex"** — ROI منخفض، الـregex يغطي >98%.
- **"Timing weight سينمائي"** — micro-optimization، لن يحل تجمّد اللعبة.
- **"Fingerprint للملفات المبنية"** — موجود جزئياً عبر `mapPresentationFormsToStandard`.

**ما لم يذكره وهو حرج:**
- **Service Worker caching للأصول** — السبب الحقيقي لـ"التحديثات لا تصل"، أهم من schema versioning.
- **IndexedDB migration** — بدون migration script، حتى مع SCHEMA_VERSION ستفقد ترجمات المستخدمين.

## إعادة ترتيب الأولويات حسب الأثر الفعلي

```text
1. Schema versioning + IndexedDB migration  ← يحل "التحديثات لا تصل"
2. XENO:n كـ Token حقيقي في كامل الـpipeline ← يحل تجمّد المشاهد + drift
3. Pipeline deterministic (pure functions)   ← يحل عدم الاتساق
4. Web Worker للمعالجة الثقيلة              ← يحل تهنيج الجوال
5. Parser-based / Timing weight             ← مؤجل
```

## الخطة (3 مراحل)

### المرحلة 1 — Schema Versioning (الأكثر أثراً، صغيرة)
- إضافة `SCHEMA_VERSION = 1` في `src/lib/idb-storage.ts`.
- عند فتح IndexedDB: فحص النسخة المخزّنة → migration أو wipe آمن.
- تخزين `appVersion` (من `version.ts`) داخل IndexedDB.
- عند فتح المحرر: إذا اختلفت النسخة → toast يقترح "جلب التحديث" تلقائياً.
- زر "نسخ احتياطي قبل الترقية" يصدّر JSON.

**ملفات متأثرة:** `src/lib/idb-storage.ts`, `src/hooks/useEditorState.ts`, `src/components/UpdateBanner.tsx`.

### المرحلة 2 — XENO:n / PageBreak كـ Token حقيقي
- ملف جديد `src/lib/text-tokens.ts`:
  ```ts
  type TextToken =
    | { kind: 'text'; value: string }
    | { kind: 'hardBreak'; raw: string }   // [XENO:n ]\n + [System:PageBreak ]
    | { kind: 'tag'; raw: string }
    | { kind: 'pua'; raw: string }
    | { kind: 'control'; raw: string }
  ```
- تحديث `balance-lines.ts` و`xc3-tag-protection.ts` ليستخدما الـtokens مباشرة.
- ضمان: لا توجد عملية تنقل/تحذف `hardBreak`.

### المرحلة 3 — Web Worker للجوال
- `src/workers/diagnostic.worker.ts` ينقل: `detectIssues` + الموازنة الجماعية.
- Wrapper يستخدم Worker إذا متاح، وإلا fallback main thread.

## توصيتي

ابدأ بـ**المرحلة 1 فقط** الآن:
- تحل المشكلة الفورية ("التحديثات لا تصل")
- ~3 ملفات
- لا تكسر شيئاً
- ROI فوري ومرئي

ثم نقيّم قبل الانتقال لـ2 و3.

## أسئلة للحسم

**1. نطاق التنفيذ؟**
- (أ) المرحلة 1 فقط — موصى به
- (ب) المرحلتان 1 و2 معاً
- (ج) الثلاث دفعة واحدة

**2. عند ترقية الـschema، ماذا نفعل بترجمات المستخدم القديمة؟**
- (أ) تنزيل JSON تلقائي قبل المسح — الأكثر أماناً ✅
- (ب) Dialog يسأل المستخدم
- (ج) مسح فوري بدون سؤال

أخبرني بإجاباتك وسأبدأ التنفيذ فور الموافقة.

