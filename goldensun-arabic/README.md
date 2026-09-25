# تعريب Golden Sun من الكود المصدري

البناء من [Coaltergeist/goldensun-decomp](https://github.com/Coaltergeist/goldensun-decomp)
على الإيداع `67a8e5c`، مع عكس اتجاه النص في المحرك نفسه.

## الملفات

| الملف | ما فيه |
|---|---|
| `engine.patch` | تعديل المحرك: الخط العربي، رفع حدّ الحروف، عكس الاتجاه |
| `test-strings.patch` | أسطر تجربة معرّبة (القائمة الأولى وأول حوار) |
| `scripts/gsfont.py` | يبني `data/arabic_font.bin` من خط المستخدم `FONT12_user.NFTR` ويكتب `codes.json` |
| `scripts/enc.ts` | يحوّل النص العربي إلى بايتات اللعبة بصيغة `\xNN` كما في `strings.txt` |
| `scripts/key.sh`, `shot.sh` | إرسال الأزرار للمحاكي والتقاط الصورة |
| `scripts/gdb*.cmd` | نقاط توقف لتتبّع `DrawText` و`BufferString` |

`data/arabic_font.bin` غير محفوظ لأنه يحوي حروف اللعبة اللاتينية؛ يُولَّد بـ`gsfont.py`.

## الاستعمال

```sh
git clone https://github.com/Coaltergeist/goldensun-decomp && cd goldensun-decomp
git checkout 67a8e5c && cp /path/to/baserom.gba .     # SHA1 5c469520...
git apply engine.patch test-strings.patch
python3 scripts/gsfont.py      # يكتب data/arabic_font.bin
make
```

## كيف يعمل

- **النصوص**: 10,722 سطراً مضغوطة بـHuffman. `tools/unpack_strings` يخرجها إلى
  `data/strings/strings.txt` و`tools/pack_strings` يعيد بناء الأشجار. الربط
  بالرموز، فالنص يستطيع أن يطول. الإنجليزية تستعمل البايتات حتى 122 فقط.
- **الخط الرئيسي** `Data_32224`: كل حرف 32 بايتاً (عرض ثم 15 صفاً). الحروف
  العربية الشائعة في 0x90–0xFF (عدا 0xDE/0xDF لأنهما علامتا الدكتن)، والنادرة
  في رموز ASCII غير المستعملة.
- **حدّ الحروف**: `Func_80155d0` كان يرفض ما فوق 0x8F؛ صار 0xDF.
- **الاتجاه**: النص يُخزَّن بالترتيب المنطقي. `DrawText` يعكس موضع x داخل
  النافذة، و`BufferString` يقلب مقاطع الإنجليزية والأرقام حتى تعود صحيحة بعد
  العكس. دمج حرفين ضيقين في رسم واحد أُلغي.

## ما يعمل

الحوار في المحاكي: عربي متصل بخط المستخدم، الأسطر من اليمين، والأسماء
والأرقام صحيحة («Isaac»، «25»).

## ما بقي

- القوائم تستعمل الخط الصغير 8×8 (الملف 0x13) وتظهر معكوسة: تحتاج حروفاً
  عربية 8×8، وتوسيع جدول العروض `Data_370d4` (112 حرفاً فقط)، والعكس بعرض هذا
  الجدول في نوافذ العلم 8.
- الرمز `\x18` يظهر شرطة.
- قسم اللعبة في الموقع.
