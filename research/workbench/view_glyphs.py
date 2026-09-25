import sys, json
sys.path.insert(0, "/home/user/zelda-arabic-magic-a76daea1/pokeplatinum-arabic/scripts")
from render_ttf_glyphs import charmap, CELL
from PIL import Image

code_of_plat = charmap()

# codepoints for letters in مرحبا (shaped forms) - let's just grab a broad range
# of the presentation-forms block directly instead, to visualize a chunk.
img = Image.open("/home/user/decomps/pokeplatinum/res/fonts/font_system.png").convert("RGB")
print("image size:", img.size)

# find slot range for presentation forms 0xFE80-0xFEFC
slots = []
for cp in range(0xFE80, 0xFEFD):
    if cp in code_of_plat:
        slots.append(code_of_plat[cp] - 1)
slots.sort()
print("num slots:", len(slots), "min/max:", min(slots), max(slots))

# Crop a region covering these slots (16 cols per row)
minrow = min(s // 16 for s in slots)
maxrow = max(s // 16 for s in slots)
print("row range:", minrow, maxrow)
crop = img.crop((0, minrow*CELL, 256, (maxrow+1)*CELL))
crop = crop.resize((crop.width*3, crop.height*3), Image.NEAREST)
crop.save("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/arabic_glyph_region.png")
print("saved crop")
