# فحص باتش Kingdom Hearts: Birth by Sleep Final Mix — English Translation 1.0.12

التاريخ: 2026-08-20

## النتيجة

تؤكد صفحة GameBrew وصفحة فريق الترجمة أن باتش الإنجليزية 1.0.12 لا يعمل على ملفات نصوص منفصلة فقط؛ بل ينتج نسخاً معدلة من `BBS0.DAT` و`BBS1.DAT` و`BBS2.DAT` و`BBS3.DAT` ثم يعيدها إلى ISO، ويستبدل أيضاً `PSP_GAME/SYSDIR/EBOOT.BIN` بملف مرفق. يصف المصدر الترجمة بأنها تعتمد في معظمها على توطين النسخة الإنجليزية الأصلية، ولا يثبت أن الباتش ينسخ موارد الإنجليزية بلا تعديل؛ لذلك لا ينبغي افتراض تطابق كامل بين موارد Final Mix والنسخة الأمريكية.

## المتطلبات التي يثبتها المصدر

| الملف | ما يحدده المصدر |
|---|---|
| `BBS0.DAT` | يستخرج من ISO ثم يضعه المطبق بجوار أداة الباتش. |
| `BBS1.DAT` و`BBS2.DAT` و`BBS3.DAT` | تُفك عبر برنامج DNAS على PSP أولاً، ثم تُعاد تسميتها وتدخل إلى أداة الباتش. |
| `BBS4.DAT` | لا يذكره الباتش الإنجليزي 1.0.12 ضمن ملفات التطبيق. |
| `EBOOT.BIN` | يستبدل من مجلد `EXTRA` في `PSP_GAME/SYSDIR`، وليس ملف `UPDATE`. |

## صلته بالأداة

مسار مدير ملفات Kingdom Hearts يفتح BBS0–BBS4 لأن فهرس BBSA قد يوزع موارد اللعبة بينها. لكن عند العمل فوق هذا الباتش الإنجليزي تحديداً، ينبغي البدء من ملفات `BBS0.DAT` إلى `BBS3.DAT` الموجودة فعلياً في ISO الذي جرى تطبيق الباتش عليه؛ BBS4 ليس ملفاً يدّعي الباتش أنه عدّله. إذا عدّل المستخدم مورداً داخل DAT من خلال «فتح قابل للكتابة»، فالنتيجة تحفظ في ملف DAT الذي اختاره، ثم يجب أن يعاد إدراجه في ISO مع بقية ملفات الباتش إن كان العمل خارج ISO مفكوك.

## المصادر

1. [GameBrew — Kingdom Hearts: Birth by Sleep Final Mix Translation Patch](https://www.gamebrew.org/wiki/Kingdom_Hearts_-_Birth_by_Sleep_-_Final_Mix_Translateion_Patch_PSP)
2. [TK Translations — Kingdom Hearts: Birth by Sleep Final Mix English Translation 1.0.12](https://tk-translations.blogspot.com/2012/12/kingdom-hearts-birth-by-sleep-final-mix.html)
