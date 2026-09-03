"""Pair every text string in the Arabic tree with the English it replaced.

The two trees are the same tree: the English one was made by reverting the
files the merge wrote into, so file for file and string for string they line
up by position. That is an exact correspondence -- no content matching, no
guessing -- and it is the only place such a correspondence still exists, since
the scanner cannot read the Arabic build's lines at all.

Output: {normalised English -> the Arabic, written the way the tool writes it}.
"""
import glob, json, os, re, sys

AR = "/home/user/decomps/pokeemerald/"
EN = "/home/user/decomps/pokeemerald-en/"
CHARMAP = EN + "charmap.txt"

LIT = r'"((?:[^"\\]|\\.)*)"'


def constants():
    """{NAME: (0xFD|0xFC, arg)} from the charmap's own constant lines."""
    out = {}
    for line in open(CHARMAP, encoding="utf-8"):
        m = re.match(r"^([A-Z_][A-Z_0-9]*)\s*=\s*((?:[0-9A-F]{2}\s*)+)$",
                     line.split("@")[0].strip())
        if m:
            by = [int(x, 16) for x in m.group(2).split()]
            out.setdefault(m.group(1), by)
    return out


CONST = constants()


def to_tool_text(lit):
    """A source literal -> the text the tool's decoder produces for it."""
    out, i = [], 0
    while i < len(lit):
        c = lit[i]
        if c == "\\" and i + 1 < len(lit):
            e = lit[i + 1]
            out.append({"n": "\n", "l": "{fa}\n", "p": "{fb}\n",
                        "\\": "\\", '"': '"', "'": "'"}.get(e, e))
            i += 2
        elif c == "{":
            j = lit.find("}", i)
            if j < 0:
                out.append(c); i += 1
                continue
            body = lit[i + 1:j].strip()
            i = j + 1
            parts = body.split()
            by = CONST.get(parts[0])
            if by is None:
                out.append("{" + body + "}")
            elif by[0] == 0xFD:
                out.append("{FD:%02x}" % by[1])
            elif by[0] == 0xFC:
                args = [by[1]] + [int(x, 0) for x in parts[1:]]
                out.append("{FC:" + ":".join("%02x" % a for a in args) + "}")
            else:
                out.append("{" + ":".join("%02x" % b for b in by) + "}")
        elif c == "$":
            break
        else:
            out.append(c); i += 1
    return "".join(out)


def units(root, path):
    """Every text string in one file, in the order it appears."""
    text = open(root + path, encoding="utf-8").read()
    out = []
    if path.endswith((".inc", ".s")):
        for m in re.finditer(r'(?:^[ \t]*\.string[ \t]+' + LIT + r'[ \t]*\r?\n)+',
                             text, re.M):
            cur = []
            for lm in re.finditer(r'\.string[ \t]+' + LIT, m.group(0)):
                cur.append(lm.group(1))
                if "$" in lm.group(1):
                    out.append("".join(cur)); cur = []
            if cur:
                out.append("".join(cur))
    else:
        for m in re.finditer(r'(?<![A-Za-z0-9_])_\(\s*' + LIT + r'\s*\)', text):
            out.append(m.group(1))
    return out


KEEP = re.compile(r"[^0-9A-Za-zÀ-ÿ]")


def key(s):
    """What is left of an English line once layout is gone.

    Codes, breaks and spacing are all things the merge was free to change, so
    matching on them would miss lines that are in fact the same line. The
    letters are not: they are what the scanner reads out of the ROM.
    """
    s = re.sub(r"\{[^}]*\}", "", s)
    return KEEP.sub("", s).upper()


def main():
    changed = [l.strip() for l in open(sys.argv[1], encoding="utf-8") if l.strip()]
    pairs, skipped, files = {}, 0, 0
    for path in changed:
        if not path.endswith((".inc", ".s", ".c", ".h")):
            continue
        if not (os.path.exists(AR + path) and os.path.exists(EN + path)):
            continue
        a, e = units(AR, path), units(EN, path)
        if len(a) != len(e):
            print(f"  !! {path}: {len(a)} vs {len(e)} strings -- skipped")
            skipped += 1
            continue
        files += 1
        for al, el in zip(a, e):
            if al == el:
                continue          # never translated
            en, v = to_tool_text(el), to_tool_text(al)
            for k in (("=" + en), key(en)):
                # A key short enough to collide is no key at all: "S" matched
                # a stray letter in the graphics and pulled a whole sentence
                # onto it. Only the exact English stands for those.
                if k.startswith("=") or len(k) >= 4:
                    if k in pairs and pairs[k] != v:
                        pairs[k] = None
                    else:
                        pairs.setdefault(k, v)
    ambiguous = sum(1 for v in pairs.values() if v is None)
    pairs = {k: v for k, v in pairs.items() if v}
    print(f"files paired: {files}  skipped: {skipped}")
    print(f"pairs: {len(pairs)}  dropped as ambiguous: {ambiguous}")
    json.dump(pairs, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)


main()
