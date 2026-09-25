"""Every text string in the pokeemerald sources, with where it lives.

A single ROM string is often several source lines: an .inc message is a run of
consecutive `.string` directives that the assembler concatenates until the one
holding "$".  Matching a ROM string therefore has to join that whole run, not
look at one line.
"""
import glob, re

SRC = "/home/user/decomps/pokeemerald/"
UNESCAPE = {"n": "\n", "l": "\n", "p": "\n", "\\": "\\", '"': '"'}

# A byte often spells more than one character -- 0xB4 is both ' and ’, 0xB1 is
# both " and “ -- so the source and the decoded ROM can write the same byte two
# different ways.  Canonicalising every character through its byte makes the
# two sides identical by construction instead of by luck.
def _canon_map():
    import romtext
    out = {}
    for line in open(romtext.VANILLA, encoding="utf-8"):
        m = re.match(r"^'(\\?.)'\s*=\s*([0-9A-F]{2})\s*$", line.split("@")[0].strip())
        if m:
            ch = m.group(1)
            if len(ch) == 2 and ch[0] == "\\":
                if ch[1] in "nlp":     # line breaks, handled separately
                    continue
                ch = ch[1]             # \' and \\ spell themselves
            b = int(m.group(2), 16)
            prim = romtext.CMAP.get(b)
            if prim:
                out[ch] = prim
    return out


CANON = _canon_map()


def norm(lit):
    """Source literal -> the same shape romtext.read() produces."""
    out, i = [], 0
    while i < len(lit):
        c = lit[i]
        if c == "\\" and i + 1 < len(lit):
            out.append(UNESCAPE.get(lit[i + 1], "\0")); i += 2
        elif c == "{":
            j = lit.find("}", i)
            if j < 0:
                out.append(c); i += 1
            else:
                out.append("\0"); i = j + 1
        elif c == "$":
            break
        else:
            out.append(CANON.get(c, c)); i += 1
    return "".join(out)


LIT = r'"((?:[^"\\]|\\.)*)"'

# Slots that are one fixed-size name field.  They were merged already, each
# against its own byte limit; a dialogue-sized string dropped into one of them
# overruns the array and the build fails on "excess elements".
FIXED_FILES = ("species_names.h", "move_names.h", "trainer_class_names.h")
FIXED_FIELD = re.compile(r"\.(?:name|categoryName|trainerName)\s*=\s*$")
FIXED_ARRAY = {"abilities.h": "gAbilityNames[", "battle_main.c": "gTypeNames["}


def is_fixed_slot(path, text, start):
    if path.endswith(FIXED_FILES):
        return True
    if FIXED_FIELD.search(text[max(0, start - 40):start]):
        return True
    for f, arr in FIXED_ARRAY.items():
        if path.endswith(f) and arr in text:
            a = text.index(arr)
            if a < start < text.index("};", a):
                return True
    return False


def collect():
    """-> list of (path, span_start, span_end, [literals], normalized)"""
    out = []
    seen = set()
    for pat in ("data/**/*.inc", "data/**/*.s", "src/**/*.c", "src/**/*.h"):
        for path in sorted(set(glob.glob(SRC + pat, recursive=True))):
            if path in seen:
                continue
            seen.add(path)
            text = open(path, encoding="utf-8").read()
            if path.endswith((".inc", ".s")):
                # runs of consecutive .string lines, joined until one carries $
                for m in re.finditer(r'(?:^[ \t]*\.string[ \t]+' + LIT + r'[ \t]*\r?\n)+',
                                     text, re.M):
                    block = m.group(0)
                    lits = re.findall(r'\.string[ \t]+' + LIT, block)
                    joined = "".join(lits)
                    # one entry per "$"-terminated message inside the run
                    parts, cur, spans = [], [], []
                    pos = m.start()
                    for lm in re.finditer(r'\.string[ \t]+' + LIT, block):
                        cur.append(lm.group(1))
                        spans.append((pos + lm.start(1), pos + lm.end(1)))
                        if "$" in lm.group(1):
                            parts.append((list(cur), list(spans)))
                            cur, spans = [], []
                    if cur:
                        parts.append((cur, spans))
                    for lits2, sp in parts:
                        n = norm("".join(lits2))
                        if n:
                            out.append((path, sp, lits2, n))
            else:
                for m in re.finditer(r'(?<![A-Za-z0-9_])_\(\s*' + LIT + r'\s*\)', text):
                    n = norm(m.group(1))
                    if n and not is_fixed_slot(path, text, m.start()):
                        out.append((path, [(m.start(1), m.end(1))], [m.group(1)], n))
    return out


if __name__ == "__main__":
    s = collect()
    print("strings found in the sources:", len(s))
    for e in s[:3]:
        print("  ", e[0].replace(SRC, ""), e[3][:60].replace("\n", "\\n"))
