#!/bin/bash
# Boot Platinum in desmume and grab the two screens the title sequence shows:
# the GAME FREAK credit (early) and the logo (after the intro plays out).
# desmume is detached with setsid because it dies when the bash call that
# launched it returns.
export DISPLAY=:77 SDL_AUDIODRIVER=dummy
S=/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad
ROM=/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds
pgrep -x Xvfb >/dev/null || { setsid Xvfb :77 -screen 0 900x800x24 -ac >/dev/null 2>&1 </dev/null & sleep 3; }
setsid desmume-cli --disable-sound "$ROM" >/dev/null 2>&1 </dev/null &
for i in $(seq 30); do WID=$(xdotool search --name "[Dd]e[Ss]mu[Mm]E" | head -1); [ -n "$WID" ] && break; sleep 1; done
[ -z "$WID" ] && { echo "no window"; exit 1; }
sleep 6
import -window "$WID" "$S/nds_gf.png"
sleep 14
import -window "$WID" "$S/nds_logo.png"
echo DONE
