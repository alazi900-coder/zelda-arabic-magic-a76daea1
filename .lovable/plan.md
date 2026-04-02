

## المشكلة

عند فتح ملف WILAY، الأداة تفك الضغط (xbc1/zstd/deflate) وتخزن البيانات المفكوكة فقط. عند الحفظ، تحفظ البيانات المفكوكة بدون إعادة ضغطها — فيصبح الملف المحفوظ مختلفاً عن الأصلي ولا يعمل في اللعبة.

## الحل

### 1. حفظ معلومات الضغط الأصلية عند الفتح

في `LoadedFile` نضيف:
- `originalRaw: ArrayBuffer` — البيانات الخام قبل فك الضغط
- `compressionSteps: string[]` — خطوات الضغط (مثل `["xbc1"]` أو `["zstd"]`)
- `xbc1Header: Uint8Array | null` — أول 48 بايت من حاوية xbc1 الأصلية (تحتوي نوع الضغط واسم الملف)

### 2. إضافة دالة إعادة الضغط في `xbc1-utils.ts`

دالة `rewrapWilayData(modifiedData, originalRaw, steps)`:
- إذا كان الملف الأصلي xbc1 مع deflate → يضغط البيانات المعدلة بـ deflate ويعيد بناء حاوية xbc1 بنفس الـ header (اسم الملف، نوع الضغط)
- إذا كان xbc1 بدون ضغط (type 0) → يلف البيانات بحاوية xbc1 بدون ضغط
- إذا لم يكن مضغوطاً → يعيد البيانات كما هي

### 3. تعديل `handleDownloadModified` في `WilayViewer.tsx`

قبل الحفظ، يستدعي `rewrapWilayData` لإعادة ضغط البيانات المعدلة بنفس طريقة الملف الأصلي، ثم يحفظ بنفس الاسم الأصلي مع الامتداد الصحيح.

### التفاصيل التقنية

**ملف `xbc1-utils.ts`** — إضافة:
```text
rewrapWilayData(data, originalRaw, steps)
  ├─ إذا steps يحتوي "xbc1":
  │   ├─ يقرأ header الأصلي (48 بايت)
  │   ├─ يحدد نوع الضغط (0=بدون، 1=deflate، 3=zstd)
  │   ├─ يضغط data بنفس النوع
  │   └─ يبني حاوية xbc1 جديدة بنفس الاسم والنوع
  └─ وإلا يعيد data مباشرة
```

**ملف `WilayViewer.tsx`** — تعديلات:
- `LoadedFile` يحفظ `originalRaw` و `compressionSteps`
- `handleDownloadModified` يستدعي `rewrapWilayData` قبل إنشاء Blob

