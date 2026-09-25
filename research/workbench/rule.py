import io

path = "src/lib/enhance-rules.ts"
src = io.open(path, encoding="utf-8").read()

anchor = "  {\n    id: 'detect_line_breaks',"
assert src.count(anchor) == 1

block = """  {
    id: 'detect_crashlands_tags',
    label: 'رموز %r و# (Crashlands)',
    description:
      'يحمي %r — قيمة يضعها المحرّك وقت التشغيل — و# فاصل السطر، ويمنع مسّ النسب المئوية العادية مثل -25% — فعّال فقط عند مراجعة ملفات Crashlands',
    kind: 'detect',
    defaultEnabled: true,
    prompt:
      '**split_and_tags** — [خاص بـCrashlands] في نصّ هذه اللعبة رمزان لا ثالث لهما: `%r` قيمة يضعها المحرّك وقت التشغيل («deals %r% bonus damage») وليس نصّاً، و`#` فاصل سطر ضياعه يدمج سطرين على الشاشة. أبقِهما بنفس العدد ونفس الترتيب ونفس الموضع بين الكلمات، ولا تخترع واحداً من عندك. وما عداهما نصّ عادي: علامة `%` وحدها في مثل `-25% physical resistance` نسبة مئوية من الجملة لا رمز، فلا تحذفها ولا تحمِها. ولا توجد في هذه اللعبة وسوم من الشكل `{…}` أو `<…>` أو `[…]`، فلا تضفها.',
  },
  {
    id: 'detect_crashlands_invented_names',
    label: 'أسماء Crashlands المخترعة',
    description:
      'أسماء مثل Lognest وFlux Dabes وBawg اختُرعت للعبة ولا مقابِل لها: تُنقل صوتياً ولا تُ«تُصحّح» إلى كلمة مألوفة — فعّال فقط عند مراجعة ملفات Crashlands',
    kind: 'detect',
    defaultEnabled: true,
    prompt:
      '**accuracy** — [خاص بـCrashlands] نبرة اللعبة ساخرة هازلة، ومعظم أسمائها مخترعة لها وحدها (Lognest، Flux Dabes، Juicebox، Bawg، Tendrilis). لا تعامل اسماً منها على أنّه خطأ إملائي لكلمة إنجليزية معروفة، ولا تستبدله بما تظنّه المقصود: انقله صوتياً كما هو. ولا تفترض مصطلحات أو شخصيات من Xenoblade أو أي لعبة أخرى.',
  },
"""

src = src.replace(anchor, block + anchor, 1)
io.open(path, "w", encoding="utf-8").write(src)
print("ok")
