"""Arabic glyphs into Pokémon Platinum's message font.

Platinum is kinder than Emerald here. Its font manager reads a glyph as
`narcBuf + c * glyphSize` -- the glyph index *is* the character code -- and the
sheet holds 509 of them while the English game prints only 197. So the 129
Arabic forms move into slots nothing draws, and not one letter, arrow or
special glyph is taken from the game. (In Emerald there were 95 free slots for
129 forms, and the shortfall is what cost us the four direction arrows.)

The glyphs are the same hand-drawn pixel art the other games use, and the two
fonts happen to share a palette exactly -- index 1 is the ink, 2 the shadow --
so a cell can be pasted across without touching a pixel.
"""
import json, os, re, sys
from PIL import Image

# The glyphs, and the code that reads them, are shared with the Emerald work:
# the same hand-drawn pixel art, and the two games' fonts happen to use the
# same palette, so a cell crosses over untouched.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "..", "..", "pokeemerald-arabic", "scripts"))
from import_pkm_font import CELL, load_glyphs, needed_codepoints, to_image

PLAT = "/home/user/decomps/pokeplatinum/"
CHARMAP = PLAT + "tools/msgenc/charmap.txt"
# Every font the game prints words with. They share one glyph numbering -- the
# character code is the index into all of them -- so a letter has to be drawn
# in each, or it comes out as whatever that slot happened to hold: the title
# screen showed "Y*JfaSQ" when only the message font had been filled in.
# font_unown is left alone; it is the Unown alphabet, not text.
FONTS = ["font_system", "font_message", "font_subscreen"]
SLOTS = 509        # glyphWidths entries; the sheet holds 512 cells


def charmap():
    """{char -> code} and {'{CMD}' -> code}, as msgenc reads them."""
    chars, cmds = {}, {}
    for line in open(CHARMAP, encoding="utf-8"):
        line = line.split("//")[0].rstrip("\n")
        if "=" not in line:
            continue
        h, v = line.split("=", 1)
        h = h.strip()
        if not re.fullmatch(r"[0-9A-Fa-f]{4}", h):
            continue
        c = int(h, 16)
        if v.startswith("{"):
            cmds.setdefault(v, c)
        elif len(v) == 1:
            chars.setdefault(v, c)
    return chars, cmds


def codes_the_game_prints(chars, cmds):
    """Every glyph any resource asks for, not just the dialogue.

    Scanning res/text alone was wrong and the build said so: the US cartridge
    ships the Japanese Pokedex entries too (res/pokemon/species_pokedex_entry_jp),
    so the kana this table spells are not spare after all. Every JSON under res/
    is read instead -- over-counting is the safe direction, since it can only
    make a slot look taken when it is free.
    """
    import glob
    used = set()

    def feed(s):
        for tag in re.findall(r"\{[^}]*\}", s):
            base = "{" + tag[1:].split(" ")[0].rstrip("}") + "}"
            if base in cmds:
                used.add(cmds[base])
        for ch in re.sub(r"\{[^}]*\}", "", s):
            if ch in chars:
                used.add(chars[ch])

    def walk(node):
        if isinstance(node, str):
            feed(node)
        elif isinstance(node, list):
            for v in node:
                walk(v)
        elif isinstance(node, dict):
            for v in node.values():
                walk(v)

    for path in glob.glob(PLAT + "res/**/*.json", recursive=True):
        try:
            walk(json.load(open(path, encoding="utf-8")))
        except Exception:
            continue    # metadata that is not text; nothing to reserve
    return used


def ink_width(px, code):
    col, row = code % 16, code // 16
    out = 0
    for y in range(CELL):
        for x in range(CELL):
            if px[col * CELL + x, row * CELL + y]:
                out = max(out, x + 1)
    return out


def main(apply_changes):
    chars, cmds = charmap()
    used = codes_the_game_prints(chars, cmds)
    # What must not move: any glyph the English game draws, and every command
    # code. The rest of the table is the Japanese half -- kana, full-width
    # forms -- which this build spells but never prints, and that is where the
    # room is. The line each Arabic letter displaces is commented out rather
    # than left to shadow it, so one code keeps one meaning.
    taken = used | set(cmds.values())
    free = [c for c in range(1, SLOTS) if c not in taken]

    glyphs = load_glyphs()
    wanted = needed_codepoints()
    print(f"العربية تحتاج {len(wanted)} خانة، والحرّ منها {len(free)}")
    if len(free) < len(wanted):
        raise SystemExit("لا خانات كافية")

    plan = list(zip(wanted, free[:len(wanted)]))
    print(f"المدى المستعمل: 0x{plan[0][1]:03X} .. 0x{plan[-1][1]:03X}")
    if not apply_changes:
        print("تجربة فقط، لم يُكتب شيء")
        return

    for name in FONTS:
        png, meta_path = f"{PLAT}res/fonts/{name}.png", f"{PLAT}res/fonts/{name}.json"
        sheet = Image.open(png)
        for cp, code in plan:
            # tile index is code - 1: FontManager_TryLoadGlyph decrements before
            # fetching, and the width table is read with `*str - 1` to match.
            col, row = (code - 1) % 16, (code - 1) // 16
            sheet.paste(to_image(glyphs[cp]),
                        (col * CELL, row * CELL, col * CELL + CELL, row * CELL + CELL))
        sheet.save(png)

        px = Image.open(png).load()
        meta = json.load(open(meta_path, encoding="utf-8"))
        for _, code in plan:
            meta["glyphWidths"][code - 1] = ink_width(px, code - 1)
        json.dump(meta, open(meta_path, "w", encoding="utf-8"), indent=1)
    print(f"الرسمات كُتبت في {len(FONTS)} خطوط")

    displaced = {code for _, code in plan}
    out, dropped = [], 0
    for line in open(CHARMAP, encoding="utf-8").read().split("\n"):
        m = re.match(r"([0-9A-Fa-f]{4})=", line.split("//")[0].strip())
        if m and int(m.group(1), 16) in displaced:
            out.append("// " + line + "   // slot taken by Arabic")
            dropped += 1
        else:
            out.append(line)
    text = "\n".join(out).rstrip("\n")
    text += "\n\n// Arabic presentation forms, in slots the English game never draws\n"
    for cp, code in plan:
        text += f"{code:04X}={chr(cp)}\n"
    open(CHARMAP, "w", encoding="utf-8").write(text)
    print(f"أُخرج من الخدمة {dropped} سطر كانا/عرض كامل")
    print(f"كُتب: {len(plan)} حرفاً، وعروضه، وأسطره في charmap.txt")


if __name__ == "__main__":
    main("--apply" in sys.argv)
