"""Overlay the friend's hand-drawn Arabic sheet onto Platinum's font, on top of
whatever import_m3_glyphs.py already wrote.

The source is a 256x256 sheet, white glyphs on black, laid out in 16x18 cells
(16 columns; the bottom ~4px of each 18-tall cell is always blank padding, so
every glyph's real ink already fits the top 16 rows -- the same height as
Platinum's own 16x16 font cell, so cells are pasted in directly with no
scaling, just a bottom crop).

Rows 0-3 are plain ASCII (verified against the sheet: `! " # $ % & ' ( ) * +
, - . /`, `0 1..9 : ; < = > ?`, `@ A..O`, `P..Z [ \\ ] ^ _`) and are not
touched here -- only rows 4-11 (the Arabic) are used. Three cells in row 5
(columns 11-13) are stray "{ | }" marks the artist drew, not Arabic, and are
skipped; row 5 column 15 and all of rows 12-14 are blank.

CELL_TO_CODEPOINT below is not a guess at layout -- it is the result of
measuring every populated cell against a reference alphabet (each of the 129
presentation-form codepoints rasterised from a real Arabic TTF into the same
16x18 box) and solving the cell<->codepoint pairing as an assignment problem,
then, within each run of cells that a single Arabic letter's own forms
occupy (found from that solve and confirmed against real joining rules --
ء get 1 cell, dual-joining letters e.g. ب ت ث ج.. get 4, right-joining-only
letters e.g. ا د ذ ر ز و get 2), re-solving just that small group against its
own 2 or 4 candidate forms. That second pass is what pins down which cell is
isolated vs final vs initial vs medial -- the letter families whose shapes
barely differ between those four (ب ت ث ة, ط ظ, ك) were the ones actually at
risk of a wrong presentation form, not a wrong letter.

The sheet does not cover all 129 forms (it has 127 populated Arabic-looking
cells for 125 FE8x-FEFC forms + bare hamza + the Arabic semicolon; 3 of those
127 are the stray brackets, and yeh (ي) only got its isolated and final forms
drawn, not initial/medial). Whatever this file does not place is left exactly
as import_m3_glyphs.py (or the TTF pass before it) already rendered it --
this script only overwrites the cells it has real art for, so coverage never
regresses.
"""
import json
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_ttf_glyphs import charmap, FONTS, CELL, PLAT
from import_m3_glyphs import _new_tile, _add_shadow

SRC_IMAGE = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/cea9eed6-image.png"
SRC_CELL_W = 16
SRC_CELL_H = 18  # only the top 16 rows are ever inked; the rest is padding

# (row, col) in the source sheet -> Unicode codepoint it draws.
CELL_TO_CODEPOINT = {
    # Row 4: hamza-carriers (drawn as iso/final pairs) + alef + waw.
    (4, 0): 0xFE83, (4, 1): 0xFE84,   # أ isolated, final
    (4, 2): 0xFE81, (4, 3): 0xFE82,   # آ isolated, final
    (4, 4): 0xFE85, (4, 5): 0xFE86,   # ؤ isolated, final
    (4, 6): 0xFE87, (4, 7): 0xFE88,   # إ isolated, final
    (4, 8): 0xFE89, (4, 9): 0xFE8A, (4, 10): 0xFE8B, (4, 11): 0xFE8C,  # ئ iso/fin/init/med
    (4, 12): 0xFE8D, (4, 13): 0xFE8E,  # ا isolated, final
    (4, 14): 0xFEED, (4, 15): 0xFEEE,  # و isolated, final

    # Row 5: alef maksura, the lam-alef ligatures, bare hamza, semicolon.
    (5, 0): 0xFEEF, (5, 1): 0xFEF0,   # ى isolated, final
    (5, 2): 0xFEF5, (5, 3): 0xFEF8, (5, 4): 0xFEF7, (5, 5): 0xFEF6,
    (5, 6): 0xFEF9, (5, 7): 0xFEFA, (5, 8): 0xFEFB, (5, 9): 0xFEFC,  # لا ligatures
    (5, 10): 0xFE80,  # ء (bare hamza, only form)
    # (5, 11)-(5, 13): stray "{ | }" marks, not Arabic -- skipped.
    (5, 14): 0x061B,  # ؛
    # (5, 15): blank.

    # Row 6: ب ة ت ث ج(start)
    (6, 0): 0xFE8F, (6, 1): 0xFE90, (6, 2): 0xFE91, (6, 3): 0xFE92,   # ب
    (6, 4): 0xFE93, (6, 5): 0xFE94,                                    # ة
    (6, 6): 0xFE95, (6, 7): 0xFE96, (6, 8): 0xFE97, (6, 9): 0xFE98,   # ت
    (6, 10): 0xFE99, (6, 11): 0xFE9A, (6, 12): 0xFE9B, (6, 13): 0xFE9C,  # ث
    (6, 14): 0xFE9D, (6, 15): 0xFE9E,                                   # ج iso, final

    # Row 7: ج(end) ح خ د ذ ر
    (7, 0): 0xFE9F, (7, 1): 0xFEA0,                                    # ج init, medial
    (7, 2): 0xFEA1, (7, 3): 0xFEA2, (7, 4): 0xFEA3, (7, 5): 0xFEA4,   # ح
    (7, 6): 0xFEA5, (7, 7): 0xFEA6, (7, 8): 0xFEA7, (7, 9): 0xFEA8,   # خ
    (7, 10): 0xFEA9, (7, 11): 0xFEAA,  # د
    (7, 12): 0xFEAB, (7, 13): 0xFEAC,  # ذ
    (7, 14): 0xFEAD, (7, 15): 0xFEAE,  # ر

    # Row 8: ز س ش ص ض(start)
    (8, 0): 0xFEAF, (8, 1): 0xFEB0,   # ز
    (8, 2): 0xFEB1, (8, 3): 0xFEB2, (8, 4): 0xFEB3, (8, 5): 0xFEB4,   # س
    (8, 6): 0xFEB5, (8, 7): 0xFEB6, (8, 8): 0xFEB7, (8, 9): 0xFEB8,   # ش
    (8, 10): 0xFEB9, (8, 11): 0xFEBA, (8, 12): 0xFEBB, (8, 13): 0xFEBC,  # ص
    (8, 14): 0xFEBD, (8, 15): 0xFEBE,                                    # ض iso, final

    # Row 9: ض(end) ط ظ ع غ(start)
    (9, 0): 0xFEBF, (9, 1): 0xFEC0,                                   # ض init, medial
    (9, 2): 0xFEC1, (9, 3): 0xFEC2, (9, 4): 0xFEC3, (9, 5): 0xFEC4,  # ط
    (9, 6): 0xFEC5, (9, 7): 0xFEC6, (9, 8): 0xFEC7, (9, 9): 0xFEC8,  # ظ
    (9, 10): 0xFEC9, (9, 11): 0xFECA, (9, 12): 0xFECB, (9, 13): 0xFECC,  # ع
    (9, 14): 0xFECD, (9, 15): 0xFECE,                                    # غ iso, final

    # Row 10: غ(end) ف ق ك ل(start)
    (10, 0): 0xFECF, (10, 1): 0xFED0,                                  # غ init, medial
    (10, 2): 0xFED1, (10, 3): 0xFED2, (10, 4): 0xFED3, (10, 5): 0xFED4,  # ف
    (10, 6): 0xFED5, (10, 7): 0xFED6, (10, 8): 0xFED7, (10, 9): 0xFED8,  # ق
    (10, 10): 0xFED9, (10, 11): 0xFEDA, (10, 12): 0xFEDB, (10, 13): 0xFEDC,  # ك
    (10, 14): 0xFEDD, (10, 15): 0xFEDE,                                      # ل iso, final

    # Row 11: ل(end) م ن ه ي(only 2 forms)
    (11, 0): 0xFEDF, (11, 1): 0xFEE0,                                  # ل init, medial
    (11, 2): 0xFEE1, (11, 3): 0xFEE2, (11, 4): 0xFEE3, (11, 5): 0xFEE4,  # م
    (11, 6): 0xFEE5, (11, 7): 0xFEE6, (11, 8): 0xFEE7, (11, 9): 0xFEE8,  # ن
    (11, 10): 0xFEE9, (11, 11): 0xFEEA, (11, 12): 0xFEEB, (11, 13): 0xFEEC,  # ه
    (11, 14): 0xFEF1, (11, 15): 0xFEF2,  # ي isolated, final (init/medial not drawn here)
}

assert len(set(CELL_TO_CODEPOINT.values())) == len(CELL_TO_CODEPOINT), "duplicate codepoint in mapping"


def _crop_cell(sheet, row, col):
    """The source sheet's (row, col) cell, top 16 rows only (see module doc)."""
    x0, y0 = col * SRC_CELL_W, row * SRC_CELL_H
    return sheet.crop((x0, y0, x0 + SRC_CELL_W, y0 + CELL))


def to_glyph_from_sheet_cell(cell_img):
    """A cropped source cell (16x16, greyscale, white ink on black) -> Platinum's
    4-color indexed tile, same convention as import_m3_glyphs.to_glyph_from_rows:
    ink at 1, transparent at 0, shadow synthesized one pixel down-right."""
    idx = _new_tile()
    px = idx.load()
    src = cell_img.load()
    max_x = 0
    any_ink = False
    for y in range(CELL):
        for x in range(SRC_CELL_W):
            ink = src[x, y] > 100
            px[x, y] = 1 if ink else 0
            if ink:
                any_ink = True
                max_x = max(max_x, x)
    _add_shadow(px)
    width = (max_x + 1) if any_ink else 1
    return idx, width


def main():
    from PIL import Image

    sheet = Image.open(SRC_IMAGE).convert("L")
    code_of_plat = charmap()

    missing_slots = [cp for cp in CELL_TO_CODEPOINT.values() if cp not in code_of_plat]
    if missing_slots:
        raise SystemExit(f"لا يوجد خانة في charmap.txt لهذه الرموز: {[hex(c) for c in missing_slots]}")

    tiles = {}
    for (row, col), cp in CELL_TO_CODEPOINT.items():
        cell_img = _crop_cell(sheet, row, col)
        tiles[cp] = to_glyph_from_sheet_cell(cell_img)

    for name in FONTS:
        png_path = f"{PLAT}res/fonts/{name}.png"
        json_path = f"{PLAT}res/fonts/{name}.json"
        out = Image.open(png_path).convert("P")
        meta = json.load(open(json_path, encoding="utf-8"))

        for cp, (tile, width) in tiles.items():
            slot = code_of_plat[cp] - 1  # see render_ttf_glyphs.py's comment on the same -1
            col, row = slot % 16, slot // 16
            out.paste(tile, (col * CELL, row * CELL))
            meta["glyphWidths"][slot] = width

        out.save(png_path)
        json.dump(meta, open(json_path, "w", encoding="utf-8"), indent=1)

    print(f"استُبدلت {len(tiles)} رسمة (من أصل {len(CELL_TO_CODEPOINT)} خانة في الورقة) "
          f"في {len(FONTS)} خطوط بخط الصديق الجديد")


if __name__ == "__main__":
    main()
