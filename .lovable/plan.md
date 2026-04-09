

## تحليل المشكلة الجذرية

المشكلة الأساسية واضحة الآن: ملفات Switch تبدأ بـ magic `PAK0` (أربع بايتات: `0x50 0x41 0x4B 0x30`). عندما يقرأها `parsePak` كـ u32 little-endian، تكون القيمة `811,368,784` وهي أكبر من `100,000`، فيتجاهل الملف بالكامل ويرمي خطأ "لم يتم التعرف على صيغة PAK".

```text
الهيكلية الفعلية للملف:
┌──────────────────────────────┐
│ PAK0 (4 bytes magic)         │
│ u32 fileCount                │
│ N × (u32 offset, u32 size)   │  ← جدول الملفات
│ ────────────────────         │
│ LIN0 (4 bytes magic)         │  ← ملف داخلي #0
│   u32 fileCount              │
│   (nameLen, name, dataLen,   │
│    data) × N                 │
│   ├── e01_103.po             │  ← النصوص هنا!
│   └── e01_103.bytecode       │
│ ────────────────────         │
│ LIN0 ...                     │  ← ملف داخلي #1
│   ...                        │
└──────────────────────────────┘
```

## خطة الإصلاح

### 1. إضافة دعم `PAK0` magic في `danganronpa-pak-parser.ts`

في دالة `parsePak`، إضافة فحص لـ magic `PAK0` قبل الهيورستكس الحالية:
- إذا بدأ الملف بـ `PAK0`، نقرأ `fileCount` من الموقع `4` (بدل `0`)
- نقرأ جدول (offset, size) بدءاً من الموقع `8` (بدل `4`)
- كل entry يبدأ من `8 + i*8`

هذا يعني إضافة دالة `tryParsePak0` جديدة تتعامل مع الـ magic header.

### 2. تحسين `tryParseOffsetSizePak` ليدعم PAK0

بدل إنشاء دالة منفصلة، يمكن تعديل `parsePak` لتكتشف PAK0 وتمرر الـ buffer مع offset مصحح:
- فحص أول 4 بايت = "PAK0"
- قراءة fileCount من offset 4
- تمرير headerOffset = 8 لجدول الملفات

### 3. تحسين المتانة في `extractFromBuffer`

إضافة فحص إضافي: إذا فشلت كل المحاولات وكان حجم الملف كبيراً، نحاول البحث عن magic `LIN0` أو `PAK0` داخل البيانات الخام (brute-force scan) كملاذ أخير.

### التفاصيل التقنية

**ملف `src/lib/danganronpa-pak-parser.ts`:**
- إضافة كشف `PAK0` magic في بداية `parsePak`
- إنشاء `tryParsePak0WithMagic` التي تقرأ fileCount من offset 4 وجدول offset+size من offset 8

**ملف `src/pages/DanganronpaClassicProcess.tsx`:**
- إضافة خطوة fallback في `extractFromBuffer` تبحث عن `LIN0` signatures داخل البيانات الخام إذا فشلت كل الطرق الأخرى

