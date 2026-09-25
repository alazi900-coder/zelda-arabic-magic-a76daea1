"""Write the English originals into the built ROM's own free space.

The editor needs to show what each Arabic line used to say, and a separate
reference file could always drift out of step with the ROM it describes. Kept
inside the ROM there is nothing to drift: one file carries both, and the tool
finds the table by its signature.

Each entry is: where the line sits in this ROM, and the English it replaced,
in the game's own encoding.
"""
import collections, json, struct, sys
sys.path.insert(0, ".")
import srcstrings
from gameenc import encode, Unencodable
from romtext import read
from toksrc import convert
from merge_text import flip_digits, ROM as RETAIL, JSON, WIDTH
from reflow import reflow

BUILT = "/home/user/decomps/pokeemerald/pokeemerald.gba"
MAGIC = b"PKMARABICREF1\0\0\0"


def pairs():
    """(english, the literal that replaced it) for every line the merge wrote."""
    retail = open(RETAIL, "rb").read()
    data = json.load(open(JSON, encoding="utf-8"))
    en_ar = collections.defaultdict(set)
    for k, v in data.items():
        p = k.split(":")
        if len(p) == 2 and p[0] in ("pkm_rom", "pkm_list") and p[1].isdigit():
            off = int(p[1])
            if off < len(retail) and v.strip():
                en_ar[read(retail, off)].add(v)
    out = []
    for en, ars in en_ar.items():
        if len(ars) != 1:
            continue
        try:
            lit, _ = reflow(flip_digits(convert(next(iter(ars)))), WIDTH)
        except Exception:
            continue
        out.append((en, lit))
    return out


def rom_index(rom):
    """Every 0xFF-terminated run in the ROM, by its bytes."""
    idx = collections.defaultdict(list)
    start = None
    for i, b in enumerate(rom):
        if b == 0xFF:
            if start is not None and i > start:
                idx[bytes(rom[start:i])].append(start)
            start = i + 1
        elif b == 0x00 and start is not None and i == start:
            start = i + 1
    return idx


def main(apply_changes):
    rom = bytearray(open(BUILT, "rb").read())
    idx = rom_index(rom)
    found, missing = [], 0
    for en, lit in pairs():
        try:
            body = encode(lit.rstrip("$"))
        except Unencodable:
            missing += 1
            continue
        offs = idx.get(body)
        if not offs:
            missing += 1
            continue
        try:
            eng = encode(en.replace("\n", "\\n").replace("\0", ""))
        except Unencodable:
            missing += 1
            continue
        for o in offs:
            found.append((o, eng))

    blob = bytearray(MAGIC)
    blob += struct.pack("<I", len(found))
    for off, eng in found:
        blob += struct.pack("<II", off, len(eng)) + eng
    print(f"lines located in the ROM: {len(found)}   not located: {missing}")
    print(f"table size: {len(blob)/1024:.0f} KB")

    # the largest run of untouched 0xFF, so nothing the game uses is overwritten
    best = cur = bs = 0
    for i, b in enumerate(rom):
        if b == 0xFF:
            if cur == 0:
                s = i
            cur += 1
            if cur > best:
                best, bs = cur, s
        else:
            cur = 0
    print(f"free space: {best/1024:.0f} KB at {bs:#x}")
    if len(blob) + 16 > best:
        raise SystemExit("the table does not fit")
    at = bs + 16
    if apply_changes:
        rom[at:at + len(blob)] = blob
        open(BUILT, "wb").write(rom)
        print(f"written at {at:#x}")
    else:
        print(f"dry run: would write at {at:#x}")


if __name__ == "__main__":
    main("--apply" in sys.argv)
