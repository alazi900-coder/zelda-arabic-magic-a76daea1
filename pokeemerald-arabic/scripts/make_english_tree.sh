#!/bin/sh
# Build the English twin of the Arabic ROM.
#
# The two files the translator works with are the same build: same engine, same
# font, same fixes -- one with the text translated and one with it still
# English. The English one is what the tool opens, because the scanner reads a
# line by the game's English character set and the Arabic build's letters sit
# in codes it will not accept (7,752 lines found instead of 18,817).
#
# It is made by reverting, not by re-deriving: every file the text merge wrote
# into goes back to its committed state, and the engine, font and graphics
# files stay. Three engine edits live inside files that are otherwise pure
# text, so they are put back by hand afterwards.
set -e
AR=${1:-/home/user/decomps/pokeemerald}
EN=${2:-/home/user/decomps/pokeemerald-en}

rm -rf "$EN"
cp -a "$AR" "$EN"
cd "$EN"
make clean >/dev/null 2>&1 || true

# Everything the merge touched goes back; this list is what does not.
cat > /tmp/keep.txt <<'KEEP'
charmap.txt
graphics/fonts/latin_narrow.png
graphics/fonts/latin_normal.png
graphics/fonts/latin_short.png
graphics/fonts/latin_small.png
graphics/fonts/latin_small_narrow.png
graphics/title_screen/emerald_version.png
graphics/title_screen/pokemon_logo.png
graphics/title_screen/press_start.png
include/constants/global.h
include/data.h
include/decoration.h
include/pokedex.h
include/text.h
src/battle_controller_player.c
src/battle_controller_safari.c
src/battle_interface.c
src/fonts.c
src/graphics.c
src/item_menu.c
src/list_menu.c
src/main_menu.c
src/menu.c
src/naming_screen.c
src/string_util.c
src/text.c
src/text_input_strings.c
src/title_screen.c
src/data/arabic_shaping.h
KEEP
git status --porcelain | awk '{print $2}' | grep -vxF -f /tmp/keep.txt | xargs git checkout --

# The wider trainer-class slot is a struct dimension sitting in a data file.
sed -i 's/^const u8 gTrainerClassNames\[\]\[13\] = {$/const u8 gTrainerClassNames[][14] = {/' \
    src/data/text/trainer_class_names.h

# The battle windows copy seven tiles, not eight, so a nickname printed at 0
# loses its first letter once the window is mirrored.
python3 - <<'PY'
import re
p = 'src/battle_message.c'
s = open(p, encoding='utf-8', errors='surrogateescape').read()
for t in ('B_WIN_ACTION_MENU', 'B_WIN_MOVE_NAME_1', 'B_WIN_MOVE_NAME_2',
          'B_WIN_MOVE_NAME_3', 'B_WIN_MOVE_NAME_4'):
    s = re.sub(r'\[' + t + r'\] = \{.*?\n    \},',
               lambda m: re.sub(r'(\n\s*\.x = )0,', r'\g<1>8,', m.group(0), count=1),
               s, flags=re.S)
open(p, 'w', encoding='utf-8', errors='surrogateescape').write(s)
PY

# The tag the tool reads to tell the two builds apart.
sed -i 's/"PKMARABICSRC1AR"/"PKMARABICSRC1EN"/' src/text.c

make -j"$(nproc)"
