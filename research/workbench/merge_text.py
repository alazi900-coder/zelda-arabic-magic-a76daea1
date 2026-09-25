"""Put the tool's Arabic dialogue into the pokeemerald sources, matched by text.

The tool keys every line by its offset in the retail ROM, so the retail ROM is
what says which English line each translation belongs to: decode the string at
that offset, find that same string in the sources, replace it.  Matching is on
content, never on order or position, and a line whose English maps to two
different translations is left alone rather than guessed at.
"""
import collections, json, re, sys
sys.path.insert(0, ".")
import srcstrings
from romtext import read
from toksrc import convert, Unconvertible
from merge_names import encoded_len
from reflow import measure_fn, reflow

ROM = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/e2c19936-Pokemon__Emerald_Version_USA_Europe.gba"
JSON = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/80672cb9-translations_20260811.json"
SRC = srcstrings.SRC

# A literal number is drawn mirrored like everything else, so its digits have to
# be laid out backwards here to come out forwards on screen -- the same trick
# ReverseDigitRun plays for numbers the game builds at run time.
DIGITS = re.compile(r"[0-9]{2,}")


def flip_digits(lit):
    out = []
    for part in re.split(r"(\{[^}]*\})", lit):
        out.append(part if part.startswith("{") else DIGITS.sub(lambda m: m.group(0)[::-1], part))
    return "".join(out)


WIDTH = measure_fn(SRC + "src/fonts.c", SRC + "charmap.txt")


def valid(lit):
    """No stray brace, and nothing broken across a {CODE arg}."""
    depth = 0
    for i, c in enumerate(lit):
        if c == "{":
            if depth:
                return False
            depth = 1
        elif c == "}":
            if not depth:
                return False
            depth = 0
        elif depth and (c == "\\" or c == "\n"):
            return False
    return depth == 0


def main(apply_changes):
    rom = open(ROM, "rb").read()
    data = json.load(open(JSON, encoding="utf-8"))

    en_ar = collections.defaultdict(set)
    for k, v in data.items():
        p = k.split(":")
        if len(p) == 2 and p[0] in ("pkm_rom", "pkm_list") and p[1].isdigit():
            off = int(p[1])
            if off < len(rom) and v.strip():
                en_ar[read(rom, off)].add(v)

    by_norm = collections.defaultdict(list)
    for e in srcstrings.collect():
        by_norm[e[3]].append(e)

    edits = collections.defaultdict(list)   # path -> [(start, end, text)]
    stats = collections.Counter()
    problems = []
    for en, ars in en_ar.items():
        slots = by_norm.get(en)
        if not slots:
            stats["no source slot"] += 1
            continue
        if len(ars) > 1:
            stats["ambiguous, left alone"] += 1
            continue
        try:
            lit = flip_digits(convert(next(iter(ars))))
        except Unconvertible as e:
            stats["unconvertible code"] += 1
            problems.append((en[:40], str(e)))
            continue
        lit, rewrapped = reflow(lit, WIDTH)
        if rewrapped:
            stats["page re-wrapped to fit the box"] += 1
        if not valid(lit):
            stats["malformed after conversion"] += 1
            problems.append((en[:40], lit[:60]))
            continue
        probe = re.sub(r"\{[^}]*\}|\\.", "", lit)
        if encoded_len(probe) is None:
            stats["character with no glyph"] += 1
            problems.append((en[:40], probe[:30]))
            continue
        for path, spans, lits, _ in slots:
            keep = "$" if lits[-1].endswith("$") else ""
            edits[path].append((spans[0][0], spans[0][1], lit + (keep if len(spans) == 1 else "")))
            for i, (a, b) in enumerate(spans[1:], 1):
                edits[path].append((a, b, keep if i == len(spans) - 1 else ""))
            stats["slots written"] += 1

    for k, v in stats.most_common():
        print(f"  {k:26s} {v}")
    if problems:
        print(f"\n  first problems:")
        for p in problems[:8]:
            print("   ", p)

    if not apply_changes:
        print("\ndry run: nothing written")
        return
    for path, es in edits.items():
        text = open(path, encoding="utf-8").read()
        for a, b, new in sorted(es, reverse=True):
            text = text[:a] + new + text[b:]
        open(path, "w", encoding="utf-8").write(text)
    print(f"\nrewrote {len(edits)} files")


if __name__ == "__main__":
    main("--apply" in sys.argv)
