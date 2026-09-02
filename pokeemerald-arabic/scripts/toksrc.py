"""Turn one of the tool's Arabic lines into a pokeemerald string literal.

The tool writes a line the way pkm-charmap.ts's decoder does:
  \\n          CHAR_NEWLINE          -> \\n
  {fb} \\n      CHAR_PARAGRAPH        -> \\p   (the break after it is layout only)
  {fa} \\n      CHAR_PROMPT_SCROLL    -> \\l
  {FD:xx}      a run-time value      -> the charmap name for FD xx, e.g. {PLAYER}
  {FC:aa:bb}   a formatting code     -> the charmap name for FC aa, with bb as
                                       a plain number ({CLEAR_TO 56} shows the
                                       assembler takes numeric arguments)
"""
import re, sys
sys.path.insert(0, ".")
from arshape import shape

VANILLA = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/charmap_vanilla.txt"


def _names():
    """(FD xx) -> name and (FC xx) -> name, from the charmap's own constants."""
    fd, fc = {}, {}
    for line in open(VANILLA, encoding="utf-8"):
        m = re.match(r"^([A-Z_][A-Z_0-9]*)\s*=\s*((?:[0-9A-F]{2}\s*)+)$",
                     line.split("@")[0].strip())
        if not m:
            continue
        by = [int(x, 16) for x in m.group(2).split()]
        if len(by) == 2 and by[0] == 0xFD:
            fd.setdefault(by[1], m.group(1))
        elif len(by) == 2 and by[0] == 0xFC:
            fc.setdefault(by[1], m.group(1))
    return fd, fc


def _byte_chars():
    out = {}
    for line in open(VANILLA, encoding="utf-8"):
        m = re.match(r"^'(\\?.)'\s*=\s*([0-9A-F]{2})\s*$", line.split("@")[0].strip())
        if m:
            ch = m.group(1)
            if len(ch) == 2:
                ch = ch[1]
            out.setdefault(int(m.group(2), 16), ch)
    return out


FD_NAME, FC_NAME = _names()
BYTE_CHAR = _byte_chars()
TOKEN = re.compile(r"\{(?:FD:[0-9a-fA-F]{2}|FC(?::[0-9a-fA-F]{2})+|[0-9a-fA-F]{2})\}")


class Unconvertible(Exception):
    pass


def _quotes(seg):
    """A straight " cannot live inside _(); the game writes “ ” anyway."""
    out, open_q = [], True
    for c in seg:
        if c == '"':
            out.append("\u201c" if open_q else "\u201d")
            open_q = not open_q
        else:
            out.append(c)
    return "".join(out)


def _token(tok):
    body = tok[1:-1]
    if body.lower() == "fb":
        return "\\p", True          # True = swallow the layout break that follows
    if body.lower() == "fa":
        return "\\l", True
    if body.startswith("FD:"):
        n = int(body[3:], 16)
        if n not in FD_NAME:
            raise Unconvertible(tok)
        return "{" + FD_NAME[n] + "}", False
    if body.startswith("FC:"):
        parts = [int(x, 16) for x in body[3:].split(":")]
        if parts[0] not in FC_NAME:
            raise Unconvertible(tok)
        name = FC_NAME[parts[0]]
        args = "".join(f" {a}" for a in parts[1:])
        return "{" + name + args + "}", False
    if re.fullmatch(r"[0-9a-fA-F]{2}", body):
        # A byte the tool could not name but the charmap can, ¥ among them.
        ch = BYTE_CHAR.get(int(body, 16))
        if ch:
            return ch, False
    raise Unconvertible(tok)        # anything still unnamed is left alone


def convert(ar):
    """-> a literal ready to sit inside .string "..." / _("...")"""
    out, i = [], 0
    for m in TOKEN.finditer(ar):
        out.append(("text", ar[i:m.start()]))
        esc, swallow = _token(m.group(0))
        out.append(("esc", esc))
        i = m.end()
        if swallow and ar[i:i + 1] == "\n":
            i += 1
    out.append(("text", ar[i:]))

    # The tool's decoder prints these as real arrows; the assembler knows them
    # only by name.
    ARROWS = {"\u2191": "{UP_ARROW}", "\u2193": "{DOWN_ARROW}",
              "\u2190": "{LEFT_ARROW}", "\u2192": "{RIGHT_ARROW}"}

    res = []
    for kind, part in out:
        if kind == "esc":
            res.append(part)
            continue
        for seg in re.split(r"(\n)", part):
            if seg == "\n":
                res.append("\\n")
            elif seg:
                for piece in re.split("([\u2190\u2191\u2192\u2193])", seg):
                    if piece in ARROWS:
                        res.append(ARROWS[piece])
                    elif piece:
                        res.append(_quotes(shape(piece).replace("\\", "\\\\")))
    return "".join(res)
