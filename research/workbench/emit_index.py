"""Write the ROM's own index of its text into the ROM.

The tool used to find the lines by scanning bytes, the way it must for a ROM
somebody else built. That does not work here: this build's Arabic sits in low
codes, and opening those to the scanner opens it to the game's own code as
well -- two thirds of what it found were ARM instructions read as Arabic.

There is no need to guess at a ROM we compile ourselves. This writes what the
build already knows: where every line is, which list it belongs to, and the
English it replaced. Three sources, none of them a heuristic --

  the linker map        the address of every table
  the tables' strides   the slot of every name in them
  the sources           every other line, matched as a whole 0xFF-run

and the retail ROM for the English of the names, since the merge overwrote it.
"""
import collections, json, re, struct, sys
sys.path.insert(0, ".")
import srcstrings
from gameenc import encode, Unencodable
from romtext import read as read_retail
from toksrc import convert
from merge_text import flip_digits, ROM as RETAIL, JSON, WIDTH
from reflow import reflow

SRC = srcstrings.SRC
BUILT = SRC + "pokeemerald.gba"
MAP = SRC + "pokeemerald.map"
MAGIC = b"PKMARABICIDX2\0\0\0"

KIND = {"rom": 0, "species": 1, "moves": 2, "items": 3, "people": 4, "list": 5}

# symbol, stride, field offset, kind, and where the same table sits in retail
TABLES = [
    ("gSpeciesNames",      11, 0, "species", 0x3185C8, 11, 0),
    ("gMoveNames",         13, 0, "moves",   0x31977C, 13, 0),
    ("gAbilityNames",      14, 0, "moves",   0x31B6DB, 13, 0),
    ("gTrainerClassNames", 14, 0, "people",  0x30FCD4, 13, 0),
    ("gTypeNames",          7, 0, "list",    0x31AE38,  7, 0),
]


def map_symbols():
    out = {}
    for line in open(MAP, encoding="utf-8", errors="ignore"):
        m = re.match(r"^\s+0x0([0-9a-f]{7})\s+([A-Za-z_][A-Za-z_0-9]*)\s*$", line)
        if m:
            addr = int(m.group(1), 16)
            if 0x8000000 <= addr < 0x9000000:      # cartridge space -> file offset
                out.setdefault(m.group(2), addr - 0x8000000)
    return out


def rom_runs(rom):
    """Every complete 0xFF-terminated run, by its bytes. A match is a whole
    line, never a piece of one, so a short name cannot land inside a longer."""
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


def strip_breaks(lit):
    """The letters of a literal, without any line-break escape."""
    return re.sub(r"\\[nlp]", "", lit.rstrip("$"))


def dialogue_pairs():
    """the letters of each merged literal -> the English it replaced.

    Keyed on the letters alone: reflow decides where the breaks fall from the
    font's widths, and those widths changed after the merge ran, so the exact
    literal is no longer reproducible. The letters are."""
    retail = open(RETAIL, "rb").read()
    data = json.load(open(JSON, encoding="utf-8"))
    en_ar = collections.defaultdict(set)
    for k, v in data.items():
        p = k.split(":")
        if len(p) == 2 and p[0] in ("pkm_rom", "pkm_list") and p[1].isdigit():
            off = int(p[1])
            if off < len(retail) and v.strip():
                en_ar[read_retail(retail, off)].add(v)
    out = {}
    for en, ars in en_ar.items():
        if len(ars) != 1:
            continue
        try:
            lit, _ = reflow(flip_digits(convert(next(iter(ars)))), WIDTH)
        except Exception:
            continue
        out[strip_breaks(lit)] = en
    return out


def source_kind(path):
    for frag, k in (("species_names.h", "species"), ("move_names.h", "moves"),
                    ("abilities.h", "moves"), ("items.h", "items"), ("berry.c", "items"),
                    ("trainer_class_names.h", "people"), ("trainers.h", "people"),
                    ("pokedex_entries.h", "list"), ("decoration/header.h", "items"),
                    ("battle_main.c", "list")):
        if path.endswith(frag):
            return k
    return "rom"


def main(apply_changes):
    rom = bytearray(open(BUILT, "rb").read())
    retail = open(RETAIL, "rb").read()
    runs = rom_runs(rom)
    syms = map_symbols()
    english_of = dialogue_pairs()

    entries = {}          # offset -> (kind, english bytes)
    stats = collections.Counter()

    # 1. the name tables, slot by slot: the map says where, the retail ROM says
    #    what each slot used to read.
    for sym, stride, field, kind, rbase, rstride, rfield in TABLES:
        base = syms.get(sym)
        if base is None:
            stats["table symbol missing: " + sym] += 1
            continue
        for i in range(1, 1200):
            off = base + i * stride + field
            if off + stride > len(rom):
                break
            end = off
            while end < len(rom) and rom[end] != 0xFF:
                end += 1
            if end == off or end - off > stride:
                continue
            en = read_retail(retail, rbase + i * rstride + rfield)
            if not en or "\0" in en:
                continue
            try:
                eb = encode(en.replace("\n", "\\n"))
            except Unencodable:
                eb = b""
            entries[off] = (KIND[kind], eb)
            stats["name slots"] += 1

    # 2. every literal still in the sources, found as a whole run
    orig = srcstrings.is_fixed_slot
    srcstrings.is_fixed_slot = lambda *a: False
    literals = srcstrings.collect()
    srcstrings.is_fixed_slot = orig
    for path, spans, lits, norm in literals:
        lit = "".join(lits)
        try:
            body = encode(lit.rstrip("$"))
        except Unencodable:
            stats["literal the encoder cannot spell"] += 1
            continue
        offs = runs.get(body)
        if not offs:
            stats["literal not found in the ROM"] += 1
            continue
        en = english_of.get(strip_breaks(lit))
        eb = b""
        if en:
            try:
                eb = encode(en.replace("\n", "\\n").replace("\0", ""))
            except Unencodable:
                eb = b""
        kind = KIND[source_kind(path)]
        for o in offs:
            if o in entries:
                continue
            entries[o] = (kind, eb)
            stats["lines from the sources"] += 1

    blob = bytearray(MAGIC) + struct.pack("<I", len(entries))
    for off in sorted(entries):
        kind, eb = entries[off]
        blob += struct.pack("<IHH", off, kind, len(eb)) + eb

    by_kind = collections.Counter(k for k, _ in entries.values())
    named = sum(1 for _, e in entries.values() if e)
    print(f"lines indexed: {len(entries)}   with their English: {named}")
    print("  by kind:", {n: by_kind[v] for n, v in KIND.items() if by_kind[v]})
    for k, v in stats.most_common():
        print(f"  {k}: {v}")
    print(f"table size: {len(blob)/1024:.0f} KB")

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
