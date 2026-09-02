"""Assemble a source string literal into the bytes the ROM holds.

This is what tools/preproc does at build time, reimplemented here so a built
ROM can be searched for a line without rebuilding it: the reference table is
keyed by where each line actually landed.
"""
import re

SRC = "/home/user/decomps/pokeemerald/"


def tables():
    chars, names = {}, {}
    for line in open(SRC + "charmap.txt", encoding="utf-8"):
        body = line.split("@")[0].strip()
        m = re.match(r"^'(\\?.)'\s*=\s*((?:[0-9A-F]{2}\s*)+)$", body)
        if m:
            ch = m.group(1)
            if len(ch) == 2:
                ch = {"n": "\n", "s": " "}.get(ch[1], ch[1])
            chars.setdefault(ch, [int(x, 16) for x in m.group(2).split()])
            continue
        m = re.match(r"^([A-Z_][A-Z_0-9]*)\s*=\s*((?:[0-9A-F]{2}\s*)+)$", body)
        if m:
            names.setdefault(m.group(1), [int(x, 16) for x in m.group(2).split()])
    return chars, names


CHARS, NAMES = tables()
ESC = {"n": 0xFE, "l": 0xFA, "p": 0xFB}


class Unencodable(Exception):
    pass


def encode(lit):
    out, i = [], 0
    while i < len(lit):
        c = lit[i]
        if c == "\\":
            e = lit[i + 1]
            if e in ESC:
                out.append(ESC[e])
            elif e in CHARS:
                out.extend(CHARS[e])
            elif e == "\\":
                out.extend(CHARS.get("\\", [0x00]))
            else:
                raise Unencodable(lit[i:i + 2])
            i += 2
        elif c == "{":
            j = lit.index("}", i)
            parts = lit[i + 1:j].split()
            name = parts[0]
            if name not in NAMES:
                raise Unencodable(parts[0])
            out.extend(NAMES[name])
            for a in parts[1:]:
                out.append(int(a, 0) if not a.isalpha() else NAMES[a][-1])
            i = j + 1
        elif c == "$":
            out.append(0xFF)
            i += 1
        else:
            if c not in CHARS:
                raise Unencodable(c)
            out.extend(CHARS[c])
            i += 1
    return bytes(out)
