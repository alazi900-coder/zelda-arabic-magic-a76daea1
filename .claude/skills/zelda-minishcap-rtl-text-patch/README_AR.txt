مهارة: zelda-minishcap-rtl-text-patch

هذه مهارة مخصصة لعكس سريان محادثات Zelda: The Minish Cap فقط.
ليست لفاير إمبلم وليست لمذر 3.

المحتوى:
- SKILL.md: ملف المهارة الأساسي.
- references/zelda-minishcap-case.md: شرح الحالة والعناوين والمنطق.
- patches/TMC_USA_dialogue_RTL_v1.ips: باتش زيلدا فقط.
- scripts/apply_tmc_dialogue_rtl.py: أداة تطبيق الباتش.
- scripts/verify_tmc_rtl_patch.py: أداة تحقق من وجود الهوك والكود.
- scripts/make_ips.py: أداة إنشاء IPS من روم نظيف وروم معدل.

طريقة التطبيق:
python scripts/apply_tmc_dialogue_rtl.py "The Legend of Zelda - The Minish Cap (USA).gba" "TMC_USA_Dialogue_RTL.gba" --ips patches/TMC_USA_dialogue_RTL_v1.ips

الفكرة:
لا نعكس النصوص داخل السكربت. نعدل إحداثي X وقت رسم الحروف:
rtl_x = right_anchor - progress - glyph_width
