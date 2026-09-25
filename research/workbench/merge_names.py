"""Merge the tool's Arabic name tables into the pokeemerald sources.

The tool keyed every line by its byte offset in the *retail* ROM, and a ROM
built from source shares none of those offsets -- which is why importing the
file back by position put translations on the wrong lines.  The fixed-stride
tables are recoverable anyway: Gen 3 stores them as arrays of equal-sized
slots at addresses that are the same in every retail Emerald, so an offset
divides back into an exact array index, and the index is what the source
indexes by too.  Nothing here is matched by order or by guesswork.

Each table below was confirmed by its first entry before being trusted:
index 1 is BULBASAUR / POUND / STENCH / MASTER BALL / CHERI in the source and
بولباسور / لكم / رائحة كريهة / كرة ماستر / تشيري in the file.
"""
import json, re, sys
sys.path.insert(0, "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad")
from arshape import shape

SRC = "/home/user/decomps/pokeemerald/"
JSON = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/80672cb9-translations_20260811.json"

# section, retail base, slot size, source file, byte limit, index shift.
# The shift is only ever 0 or -1: gBerries in the source starts straight at
# CHERI (the code reads it as gBerries[berry - 1]) while the retail array keeps
# a dummy slot 0, so the same berry sits one index lower here.
TABLES = [
    ("pkm_species", 0x3185C8, 11, "src/data/text/species_names.h", 10, 0),
    ("pkm_moves",   0x31977C, 13, "src/data/text/move_names.h",    12, 0),
    ("pkm_moves",   0x31B6DB, 13, "src/data/text/abilities.h",     13, 0),
    ("pkm_items",   0x5839A0, 44, "src/data/items.h",              14, 0),
    ("pkm_items",   0x58A654, 28, "src/berry.c",                    6, -1),
    ("pkm_people",  0x30FCD4, 13, "src/data/text/trainer_class_names.h", 13, 0),
]

STR_RE = re.compile(r'_\("((?:[^"\\]|\\.)*)"\)')


def charmap():
    cm = {}
    for line in open(SRC + "charmap.txt", encoding="utf-8"):
        m = re.match(r"^'(\\?.)'\s*=\s*([0-9A-F]{2})(?:\s+([0-9A-F]{2}))?\s*$",
                     line.split("@")[0].strip())
        if m:
            ch = m.group(1)
            if len(ch) == 2 and ch[0] == "\\":
                ch = {"n": "\n", "l": "\l", "p": "\p"}.get(ch[1], ch[1])
            cm[ch] = 2 if m.group(3) else 1
    return cm


CM = charmap()


def encoded_len(s):
    """Bytes this string costs.  The rarest Arabic forms (ظ ذ ز ث ؛) stayed on
    the two-byte escape, so a name can outgrow its slot without looking long."""
    n = 0
    for ch in s:
        if ch not in CM:
            return None
        n += CM[ch]
    return n


def slots_in(path, kind):
    """(index, english, full matched literal) for every slot of the array."""
    text = open(SRC + path, encoding="utf-8").read()
    if kind in ("items", "berries"):
        start = text.index("gItems[] =" if kind == "items" else "gBerries[] =")
        pat = re.compile(r'\.name = _\("((?:[^"\\]|\\.)*)"\)')
    else:
        start = text.index("gAbilityNames[") if kind == "abilities" else 0
        pat = STR_RE
    return [(i, m.group(1), start + m.start(1), start + m.end(1))
            for i, m in enumerate(pat.finditer(text[start:]))]


def entries(section):
    out = {}
    for k, v in json.load(open(JSON, encoding="utf-8")).items():
        p = k.split(":")
        if len(p) == 2 and p[0] == section and p[1].isdigit():
            out[int(p[1])] = v
    return out


def main(apply_changes):
    report = {"written": 0, "too_long": [], "no_glyph": []}
    for section, base, stride, path, limit, shift in TABLES:
        kind = ("items" if path.endswith("items.h") else
                "berries" if path.endswith("berry.c") else
                "abilities" if path.endswith("abilities.h") else "plain")
        slots = {i: (en, a, b) for i, en, a, b in slots_in(path, kind)}
        picked = {}
        for off, ar in entries(section).items():
            if (off - base) % stride:
                continue
            i = (off - base) // stride + shift
            if i < 0 or i not in slots:
                continue
            picked[i] = ar

        text = open(SRC + path, encoding="utf-8").read()
        edits, done = [], 0
        for i, ar in sorted(picked.items()):
            en, a, b = slots[i]
            sh = shape(ar)
            n = encoded_len(sh)
            if n is None:
                report["no_glyph"].append((path, i, en, ar)); continue
            if n > limit:
                report["too_long"].append((path, i, en, ar, n, limit)); continue
            edits.append((a, b, sh))
            done += 1
        for a, b, sh in sorted(edits, reverse=True):   # back to front: spans stay valid
            text = text[:a] + sh + text[b:]
        print(f"{path:38s} slots={len(slots):4d} matched={len(picked):4d} written={done:4d}")
        report["written"] += done
        if apply_changes:
            open(SRC + path, "w", encoding="utf-8").write(text)

    print(f"\ntotal written: {report['written']}")
    for name in ("too_long", "no_glyph"):
        if report[name]:
            print(f"\n{name}: {len(report[name])}")
            for r in report[name][:20]:
                print("   ", r)
    if not apply_changes:
        print("\ndry run: nothing written")


if __name__ == "__main__":
    main("--apply" in sys.argv)
