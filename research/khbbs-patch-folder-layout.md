# مجلد باتش Kingdom Hearts: Birth by Sleep Final Mix English 1.0.12

## النتيجة المؤكدة

تظهر بنية المجلد في لقطة المستخدم: `CTD` و`EXA` و`EXTRA` و`FIX` و`LBA` و`LY2` و`TIM2`، مع `BBS Patcher.exe` و`dnas_installer.exe`. هذه مجلدات خارجية داخل أرشيف الباتش، وليست مجلدات تتوقع الأداة العثور عليها عند فتح ISO أو `BBS.DAT`.

تؤكد تعليمات GameBrew أن المستخدم يضع `BBS0.DAT` و`BBS1.DAT` و`BBS2.DAT` و`BBS3.DAT` بجانب `BBS Patcher.exe`. لذا تستخدم أداة الباتش هذه المجلدات الخارجية كمواد إدخال لتعديل DAT؛ لا تتحول إلى مجلدات مرئية داخل الروم.

## أثر ذلك على واجهة الأداة

ينبغي أن تقبل الأداة مجلد الباتش أو ZIP الخاص به مباشرة، وتفتح ملفات `CTD` منه للتحرير ثم تنشئ ZIP محافظاً على نفس البنية. لا ينبغي أن تطلب من المستخدم البحث عن مجلد `CTD` داخل ISO.

## ما يحتاج فحصاً من أرشيف الباتش

أسماء الملفات داخل `FIX` و`TIM2` وغيرهما هي التي تحدد موضع ملف الخط الحقيقي. لا يجوز أن تفترض الأداة أن `Font.arabic.arc` يذهب إلى مجلد معين قبل قراءة قائمة الملفات من أرشيف الباتش الفعلي.

## المصدر

- [GameBrew — Kingdom Hearts: Birth by Sleep Final Mix Translation Patch](https://www.gamebrew.org/wiki/Kingdom_Hearts_-_Birth_by_Sleep_-_Final_Mix_Translateion_Patch_PSP)

## حالة الحصول على الأرشيف للتحليل

صفحة Romhacking المرتبطة بالباتش محمية بتحقق CAPTCHA، فلم يُنزّل أي أرشيف ولم يُشغّل أي ملف تنفيذي. أظهر البحث مصدراً حديثاً آخر يصف تطبيق `xdelta3` على ISO ياباني نظيف، لكنه لا يوفّر دليلاً على منطق `BBS Patcher.exe` أو أسماء الملفات داخل مجلدات الباتش. لذلك لا يجوز تنفيذ أو ادعاء إعادة بناء الباتشر قبل فحص أرشيف `BBS FM English Patch 1.0.12.zip` الفعلي.

- [GameBanana — Truthkey translation fix](https://gamebanana.com/mods/690443)
