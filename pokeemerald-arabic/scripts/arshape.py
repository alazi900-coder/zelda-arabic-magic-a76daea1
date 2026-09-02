"""Logical Arabic -> the presentation forms this font's charmap knows.

The engine mirrors where each glyph is drawn (see CopyGlyphToWindow in
src/text.c), not the glyph itself and not the string, so nothing here reverses
the character order -- only the letter shapes change, left in logical order.
"""

# base letter -> (isolated, final, initial, medial); None = that form does not
# exist, and the letter then never joins to what follows it.
FORMS = {
    0x0621: (0xFE80, 0xFE80, None, None),
    0x0622: (0xFE81, 0xFE82, None, None),
    0x0623: (0xFE83, 0xFE84, None, None),
    0x0624: (0xFE85, 0xFE86, None, None),
    0x0625: (0xFE87, 0xFE88, None, None),
    0x0626: (0xFE89, 0xFE8A, 0xFE8B, 0xFE8C),
    0x0627: (0xFE8D, 0xFE8E, None, None),
    0x0628: (0xFE8F, 0xFE90, 0xFE91, 0xFE92),
    0x0629: (0xFE93, 0xFE94, None, None),
    0x062A: (0xFE95, 0xFE96, 0xFE97, 0xFE98),
    0x062B: (0xFE99, 0xFE9A, 0xFE9B, 0xFE9C),
    0x062C: (0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0),
    0x062D: (0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4),
    0x062E: (0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8),
    0x062F: (0xFEA9, 0xFEAA, None, None),
    0x0630: (0xFEAB, 0xFEAC, None, None),
    0x0631: (0xFEAD, 0xFEAE, None, None),
    0x0632: (0xFEAF, 0xFEB0, None, None),
    0x0633: (0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4),
    0x0634: (0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8),
    0x0635: (0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC),
    0x0636: (0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0),
    0x0637: (0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4),
    0x0638: (0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8),
    0x0639: (0xFEC9, 0xFECA, 0xFECB, 0xFECC),
    0x063A: (0xFECD, 0xFECE, 0xFECF, 0xFED0),
    0x0641: (0xFED1, 0xFED2, 0xFED3, 0xFED4),
    0x0642: (0xFED5, 0xFED6, 0xFED7, 0xFED8),
    0x0643: (0xFED9, 0xFEDA, 0xFEDB, 0xFEDC),
    0x0644: (0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0),
    0x0645: (0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4),
    0x0646: (0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8),
    0x0647: (0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC),
    0x0648: (0xFEED, 0xFEEE, None, None),
    0x0649: (0xFEEF, 0xFEF0, None, None),
    0x064A: (0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4),
}

# lam + one of these alefs becomes a single glyph that joins only backward.
LIGATURES = {
    0x0622: (0xFEF5, 0xFEF6),
    0x0623: (0xFEF7, 0xFEF8),
    0x0625: (0xFEF9, 0xFEFA),
    0x0627: (0xFEFB, 0xFEFC),
}

TASHKEEL = set(range(0x064B, 0x0653)) | {0x0640, 0x0670, 0x0653, 0x0654, 0x0655}
FOLD = {0x06A4: 0x0641}       # Veh -> Feh: no dedicated glyph
PUNCT = {0x060C: 0x060C, 0x061B: 0x061B, 0x061F: 0x061F}  # pass through as-is


def _joins_forward(cp):
    f = FORMS.get(cp)
    return bool(f and f[2] is not None)


def normalize(text):
    out = []
    for ch in text:
        cp = ord(ch)
        if cp in TASHKEEL:
            continue
        out.append(chr(FOLD.get(cp, cp)))
    return "".join(out)


def shape(text):
    src = normalize(text)
    out = []
    i = 0
    prev_joins_forward = False
    while i < len(src):
        cp = ord(src[i])

        if cp == 0x0644 and i + 1 < len(src) and ord(src[i + 1]) in LIGATURES:
            iso, fin = LIGATURES[ord(src[i + 1])]
            out.append(chr(fin if prev_joins_forward else iso))
            prev_joins_forward = False
            i += 2
            continue

        if cp not in FORMS:
            out.append(src[i])
            prev_joins_forward = False
            i += 1
            continue

        iso, fin, ini, med = FORMS[cp]
        nxt = ord(src[i + 1]) if i + 1 < len(src) else None
        forward = nxt is not None and nxt in FORMS and _joins_forward(cp)

        if prev_joins_forward and forward:
            out.append(chr(med or fin))
        elif prev_joins_forward:
            out.append(chr(fin))
        elif forward:
            out.append(chr(ini or iso))
        else:
            out.append(chr(iso))

        prev_joins_forward = forward
        i += 1
    return "".join(out)
