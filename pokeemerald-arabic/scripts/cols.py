"""Where does the rendered line actually have blank columns?  Anything inside a
joined run should have none; anything between two words should have exactly one."""
import re, sys
from PIL import Image
SRC = "/home/user/decomps/pokeemerald/"
cmap = {}
for line in open(SRC + "charmap.txt", encoding="utf-8"):
    m = re.match(r"^'(.)'\s*=\s*([0-9A-F]{2})(?:\s+([0-9A-F]{2}))?\s*$", line.split("@")[0].strip())
    if m:
        cmap[m.group(1)] = [int(m.group(2), 16)] + ([int(m.group(3), 16)] if m.group(3) else [])
t = open(SRC + "src/fonts.c", encoding="utf-8").read()
W = [int(n) for n in re.findall(r"-?\d+", re.search(r"gFontNormalLatinGlyphWidths\[\] = \{(.*?)\};", t, re.S).group(1))]
sheet = Image.open(SRC + "graphics/fonts/latin_normal.png").convert("RGB")
bg = sheet.getpixel((15, 15))

s = sys.argv[1]
x = 0
report = []
strip = []   # list of (char, [columns as bool ink])
for ch in s:
    seq = cmap[ch]
    idx = 0x100 + seq[1] if len(seq) == 2 else seq[0]
    w = W[idx]
    cx, cy = idx % 16 * 16, idx // 16 * 16
    colink = []
    for dx in range(w):
        ink = any(sheet.getpixel((cx + dx, cy + dy)) != bg for dy in range(16))
        colink.append(ink)
    strip.append((ch, w, colink))

flat = []
for ch, w, colink in strip:
    flat.extend(colink)
# runs of blank columns
i = 0
while i < len(flat):
    if not flat[i]:
        j = i
        while j < len(flat) and not flat[j]:
            j += 1
        print(f"blank columns {i}..{j-1}  (width {j-i})")
        i = j
    else:
        i += 1
print()
for ch, w, colink in strip:
    print(f"U+{ord(ch):04X} {ch}  advance {w}  ink cols {''.join('#' if c else '.' for c in colink)}")
