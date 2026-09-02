"""Draw a line of text the way src/text.c would, straight from the built
sources, so a spacing change can be judged without a 4-minute ROM build."""
import re, sys
from PIL import Image
SRC = "/home/user/decomps/pokeemerald/"

cmap = {}
for line in open(SRC + "charmap.txt", encoding="utf-8"):
    m = re.match(r"^'(.)'\s*=\s*([0-9A-F]{2})(?:\s+([0-9A-F]{2}))?\s*$",
                 line.split("@")[0].strip())
    if m:
        cmap.setdefault(m.group(1), [int(m.group(2), 16)] + ([int(m.group(3), 16)] if m.group(3) else []))

text_c = open(SRC + "src/fonts.c", encoding="utf-8").read()
table = sys.argv[2] if len(sys.argv) > 2 else "gFontNormalLatinGlyphWidths"
mm = re.search(rf"{table}\[\] = \{{(.*?)\}};", text_c, re.S)
W = [int(n) for n in re.findall(r"-?\d+", mm.group(1))]

sheet = Image.open(SRC + "graphics/fonts/latin_normal.png").convert("RGB")

line = sys.argv[1]
WIN = 26 * 8   # a normal dialogue window is 26 tiles wide
out = Image.new("RGB", (WIN, 16), (255, 255, 255))
x = 0
for ch in line:
    seq = cmap.get(ch)
    if seq is None:
        print("no charmap entry for", hex(ord(ch)), ch); continue
    idx = 0x100 + seq[1] if len(seq) == 2 else seq[0]
    w = W[idx]
    cell = sheet.crop((idx % 16 * 16, idx // 16 * 16, idx % 16 * 16 + 16, idx // 16 * 16 + 16))
    # text.c mirrors the draw position inside the window, keeping logical order
    out.paste(cell.crop((0, 0, w, 16)), (WIN - x - w, 0))
    x += w
out.resize((out.width * 3, out.height * 3), Image.NEAREST).save("line.png")
print("drew", len(line), "chars,", x, "px wide")
