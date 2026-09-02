"""The four tables the tool left unnamed but that are still fixed-stride.

Same principle as merge_names.py: a retail offset divides back into an exact
array index, so nothing is matched by order.  Each base was pinned by checking
one entry against the source before being used --

    gTrainers[1]            SAWYER      ساوير
    gTypeNames[0]           NORMAL      عادي     (and [11] WATER ماء)
    gPokedexEntries[0]      UNKNOWN     مجهول
    gDecorations[0]         SMALL DESK  مكتب صغير

-- and gDecorations, like gBerries, sits one index lower here than in the
retail array.
"""
import re, sys
sys.path.insert(0, ".")
from merge_names import SRC, STR_RE, encoded_len, entries, shape

# base, stride, file, field regex (None = plain string array), byte limit, shift
TABLES = [
    (0x310034, 40, "src/data/trainers.h",                r'\.trainerName = _\("((?:[^"\\]|\\.)*)"\)', 10,  0),
    (0x31AE38,  7, "src/battle_main.c",                  None,                                         6,  0),
    (0x56B5B0, 32, "src/data/pokemon/pokedex_entries.h", r'\.categoryName = _\("((?:[^"\\]|\\.)*)"\)', 17,  0),
    (0x5A5BE9, 32, "src/data/decoration/header.h",       r'\.name = _\("((?:[^"\\]|\\.)*)"\)',         22, -1),
]


def slots(path, field):
    text = open(SRC + path, encoding="utf-8").read()
    start = text.index("gTypeNames[NUMBER_OF_MON_TYPES]") if field is None else 0
    pat = re.compile(field) if field else STR_RE
    return text, [(i, m.group(1), start + m.start(1), start + m.end(1))
                  for i, m in enumerate(pat.finditer(text[start:]))]


def run(apply_changes):
    total, skipped = 0, []
    for base, stride, path, field, limit, shift in TABLES:
        text, sl = slots(path, field)
        by_i = {i: (en, a, b) for i, en, a, b in sl}
        picked = {}
        for off, ar in entries("pkm_list").items():
            if (off - base) % stride:
                continue
            i = (off - base) // stride + shift
            if i in by_i:
                picked[i] = ar
        edits = []
        for i, ar in sorted(picked.items()):
            en, a, b = by_i[i]
            sh = shape(ar)
            n = encoded_len(sh)
            if n is None or n > limit:
                skipped.append((path, i, en, ar, n, limit)); continue
            edits.append((a, b, sh))
        for a, b, sh in sorted(edits, reverse=True):
            text = text[:a] + sh + text[b:]
        print(f"{path:40s} slots={len(by_i):5d} matched={len(picked):5d} written={len(edits):5d}")
        total += len(edits)
        if apply_changes:
            open(SRC + path, "w", encoding="utf-8").write(text)
    print(f"\ntotal: {total}")
    if skipped:
        print(f"skipped (too long / unknown glyph): {len(skipped)}")
        for r in skipped[:15]:
            print("   ", r)
    if not apply_changes:
        print("dry run")


if __name__ == "__main__":
    run("--apply" in sys.argv)
