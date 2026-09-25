import re
BREAKS = '\r\x0c'
EN_SENT = re.compile(r'(?<=[.!?…])\s')
AR_SENT = re.compile(r'(?<=[.!?؟۔…])\s')

def segments(text):
    """يقسم النصّ عند فواصل التوقّف، ويعيد القطع وأنواع الفواصل بينها."""
    parts, kinds, cur = [], [], []
    for ch in text:
        if ch in BREAKS:
            parts.append(''.join(cur)); kinds.append(ch); cur = []
        else:
            cur.append(ch)
    parts.append(''.join(cur))
    return parts, kinds

def sent_ends(text, rx):
    """مواضع نهايات الجمل (فهرس ما بعد الفاصل)."""
    return [m.start() for m in rx.finditer(text)]

def restore(en, ar):
    """يُدرج فواصل الأصل في الترجمة اعتماداً على محاذاة الجمل."""
    en_parts, kinds = segments(en)
    if not kinds:
        return ar
    flat = ar.replace('\r', '\n').replace('\x0c', '\n')
    # عدد جمل كل قطعة إنجليزية ⇒ عند أي جملة عربية نقطع
    per = [len(sent_ends(p, EN_SENT)) + 1 for p in en_parts]
    ends = sent_ends(flat, AR_SENT)
    cum, t = [], 0
    for n in per[:-1]:
        t += n; cum.append(t)

    cuts = []
    if len(ends) >= cum[-1]:
        cuts = [ends[k - 1] for k in cum]                  # محاذاة بالجمل
    else:
        # احتياطي: تناسب بالطول، مُلصَق بأقرب حدّ متاح
        total = sum(len(p) for p in en_parts)
        acc = 0
        cands = ends or [i for i, c in enumerate(flat) if c == '\n'] or \
                [i for i, c in enumerate(flat) if c == ' ']
        if not cands:
            return None
        for p in en_parts[:-1]:
            acc += len(p)
            target = round(acc / total * len(flat))
            cuts.append(min(cands, key=lambda c: abs(c - target)))
    if len(set(cuts)) != len(cuts):
        return None                                        # تعذّر فصل واضح
    out, prev = [], 0
    for c, k in zip(cuts, kinds):
        out.append(flat[prev:c]); out.append(k); prev = c + 1
    out.append(flat[prev:])
    return ''.join(out)
