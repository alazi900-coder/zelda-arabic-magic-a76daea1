"""Pair each Arabic cell of the Zelda sheet with the presentation form it draws.

Shape alone cannot tell ـبـ from بـ -- the two differ by one connecting pixel --
so the join is decided first and separately: a form's class is read off its
Unicode codepoint (the Presentation Forms-B block lists every letter as
isolated, final, initial, medial), and a cell's class is measured from whether
its ink reaches the left and right ends of its own advance. Only cells and
codepoints of the same class are allowed to pair, and inside a class the
pairing is solved as an assignment problem on shape overlap.
"""
import os
import struct
import sys

import numpy as np
from PIL import Image
from scipy.optimize import linear_sum_assignment

SCRIPTS = "/home/user/zelda-arabic-magic-a76daea1/pokeplatinum-arabic/scripts"
sys.path.insert(0, SCRIPTS)
sys.path.insert(0, "/home/user/zelda-arabic-magic-a76daea1/pokeemerald-arabic/scripts")

from arshape import FORMS
from render_ttf_glyphs import needed_codepoints, rasterize

GZF = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/2ad2b126-ltn16.gzf"
SHEET1 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gzf/tile1.png")
TTF = "/home/user/zelda-arabic-magic-a76daea1/pokeplatinum-arabic/fonts/DGShamaelBlack_Fixed.ttf"

CW, CH = 16, 18
KEEP = 16          # Platinum's cell is two rows shorter than the sheet's
ARABIC_ROWS = 5    # rows 0-4 of sheet 1; row 5 starts Latin Extended
NORM = 20          # shapes are compared at this size, bbox-normalised
STRONG = 8         # half coverage: what counts as ink when measuring


def form_class():
    """codepoint -> 0 isolated, 1 final, 2 initial, 3 medial."""
    out = {}
    for base, forms in FORMS.items():
        for i, cp in enumerate(forms):
            if cp:
                out[cp] = i
    return out


def zelda_cells():
    d = open(GZF, "rb").read()
    sheet = np.array(Image.open(SHEET1)) // 17
    out = []
    for i in range(struct.unpack_from("<I", d, 0x14)[0]):
        cp, w, s, bearing, pos = struct.unpack_from("<IHHHH", d, 0x48 + i * 12)
        col, row = pos & 0xFF, pos >> 8
        if s != 1 or row >= ARABIC_ROWS:
            continue
        cell = sheet[row * CH:row * CH + KEEP, col * CW:(col + 1) * CW]
        adv = max(1, min(w, CW))
        left = cell[:, 0].max() >= STRONG
        right = cell[:, adv - 1].max() >= STRONG
        cls = {(False, False): 0, (False, True): 1, (True, False): 2, (True, True): 3}[
            (bool(left), bool(right))
        ]
        out.append({"src": cp, "adv": w, "col": col, "row": row, "cls": cls, "cell": cell})
    return out


def normalise(mask):
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return np.zeros((NORM, NORM), bool)
    crop = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray((crop * 255).astype(np.uint8)).resize((NORM, NORM), Image.BILINEAR)
    return np.array(im) > 110


def main():
    cls_of = form_class()
    wanted = [cp for cp in needed_codepoints() if cp in cls_of]
    refs = rasterize(TTF, wanted)

    ref_shape, ref_cls = {}, {}
    for cp in wanted:
        tile, _ = refs[cp]
        m = np.array(tile) == 1
        ref_shape[cp] = normalise(m)
        ref_cls[cp] = cls_of[cp]

    cells = zelda_cells()
    for c in cells:
        c["shape"] = normalise(c["cell"] >= STRONG)

    names = {0: "isolated", 1: "final", 2: "initial", 3: "medial"}
    pairs = {}
    for k in range(4):
        cs = [c for c in cells if c["cls"] == k]
        cps = [cp for cp in wanted if ref_cls[cp] == k]
        if not cs or not cps:
            print(f"{names[k]:9s}: cells={len(cs)} forms={len(cps)} -- nothing to pair")
            continue
        cost = np.zeros((len(cs), len(cps)))
        for i, c in enumerate(cs):
            for j, cp in enumerate(cps):
                a, b = c["shape"], ref_shape[cp]
                inter = (a & b).sum()
                union = (a | b).sum()
                cost[i, j] = 1 - (inter / union if union else 0)
        ri, ci = linear_sum_assignment(cost)
        scores = []
        for i, j in zip(ri, ci):
            iou = 1 - cost[i, j]
            pairs[cps[j]] = (cs[i], iou)
            scores.append(iou)
        print(f"{names[k]:9s}: cells={len(cs):3d} forms={len(cps):3d} paired={len(ri):3d} "
              f"IoU mean={np.mean(scores):.2f} min={np.min(scores):.2f}")

    print(f"\ncovered {len(pairs)} of {len(wanted)} forms")
    weak = sorted((v[1], cp) for cp, v in pairs.items())[:12]
    print("weakest pairings:", [(hex(cp), round(s, 2)) for s, cp in weak])
    return pairs, cells, wanted


if __name__ == "__main__":
    main()
