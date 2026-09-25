"""Keep a translated page inside the dialogue box.

The translators often merged two English lines into one Arabic sentence, which
reads better but runs off the 26-tile box -- the game does not wrap, it just
draws past the edge. So any page with a line too wide is laid out again from
its own words, in the shape Emerald's own text uses: the first two lines of a
page are joined with \\n, every line after that with \\l, which scrolls the box.

Pages that already fit are left exactly as the translator wrote them.
"""
import re

BOX_PX = 26 * 8          # the standard dialogue window
PLACEHOLDER_PX = 42      # a run-time value ({PLAYER}, {STR_VAR_1}) at print time


def measure_fn(fonts_c, charmap):
    text = open(fonts_c, encoding="utf-8").read()
    W = [int(n) for n in re.findall(r"-?\d+", re.search(
        r"gFontNormalLatinGlyphWidths\[\] = \{(.*?)\};", text, re.S).group(1))]
    cm = {}
    for line in open(charmap, encoding="utf-8"):
        m = re.match(r"^'(\\?.)'\s*=\s*([0-9A-F]{2})(?:\s+([0-9A-F]{2}))?\s*$",
                     line.split("@")[0].strip())
        if m:
            ch = m.group(1)
            if len(ch) == 2:
                ch = ch[1]
            cm[ch] = 0x100 + int(m.group(3), 16) if m.group(3) else int(m.group(2), 16)

    def width(s):
        n = 0
        for piece in re.split(r"(\{[^}]*\})", s):
            if piece.startswith("{"):
                n += PLACEHOLDER_PX
            else:
                n += sum(W[cm[c]] for c in piece if c in cm)
        return n
    return width


TOKEN = re.compile(r"\\[nlp]")


def reflow(lit, width):
    """lit is a finished literal (\\n \\l \\p escapes, {NAME} codes)."""
    pages = lit.split("\\p")
    out_pages = []
    changed = False
    for page in pages:
        lines = TOKEN.split(page)
        if all(width(ln) <= BOX_PX for ln in lines):
            out_pages.append(page)
            continue
        changed = True
        # split on spaces that are not inside a {...} code
        words = [w for w in re.split(r"\s+(?![^{]*\})", " ".join(lines)) if w]
        new, cur = [], ""
        for w in words:
            trial = (cur + " " + w) if cur else w
            if cur and width(trial) > BOX_PX:
                new.append(cur); cur = w
            else:
                cur = trial
        if cur:
            new.append(cur)
        # first two lines share the box; anything after scrolls it
        page = new[0] if new else ""
        if len(new) > 1:
            page += "\\n" + new[1]
        for extra in new[2:]:
            page += "\\l" + extra
        out_pages.append(page)
    return "\\p".join(out_pages), changed
