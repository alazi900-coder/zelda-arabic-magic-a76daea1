#!/bin/bash
# The DS counterpart of emu.sh: bring DeSmuME up on a headless X server and
# keep it there. The container has no sound card, so audio is forced to the
# dummy driver -- SDL blocks on a missing ALSA device and the emulator never
# draws a frame otherwise, which looks exactly like a crashed ROM.
#
# The DS has two screens stacked in one 256x384 window, so `shot` also writes
# the top and bottom halves on their own: most of what needs checking sits on
# one screen at a time.
#
# Keys, measured on this build: arrows are the D-pad, x is A, z is B, Return is
# START. A black frame is usually a fade, not a hang -- check the process is
# still burning CPU before believing the emulator died.
export DISPLAY=:77 SDL_AUDIODRIVER=dummy
ROM="${ROM:-/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds}"
S=/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad
EMU=/usr/games/desmume-cli

win() { xdotool search --name -- "DeSmuME" 2>/dev/null | head -1; }

up() {
  pgrep -x Xvfb >/dev/null || { setsid Xvfb :77 -screen 0 900x900x24 -ac +extension GLX >/dev/null 2>&1 </dev/null & sleep 3; }
  pgrep -x twm  >/dev/null || { setsid twm >/dev/null 2>&1 </dev/null & sleep 2; }
  pgrep -x desmume-cli >/dev/null || {
    setsid "$EMU" --num-cores=1 "$ROM" >/dev/null 2>&1 </dev/null &
    for _ in $(seq 25); do [ -n "$(win)" ] && break; sleep 1; done
    sleep 6
  }
  [ -z "$(win)" ] && { echo "لم تُفتح نافذة"; return 1; }
  W=$(win); [ -z "$W" ] && { echo "لا نافذة"; return 1; }
  xdotool windowfocus "$W" 2>/dev/null
  echo "$W"
}

shot() {
  W=$(win); [ -z "$W" ] && { echo "لا نافذة"; return 1; }
  import -window "$W" "$S/$1"
  python3 - "$S/$1" <<'PY'
import sys
from PIL import Image
p = sys.argv[1]
im = Image.open(p)
h = im.height // 2
im.crop((0, 0, im.width, h)).save(p.replace(".png", "_top.png"))
im.crop((0, h, im.width, im.height)).save(p.replace(".png", "_bottom.png"))
PY
}

press() {
  W=$(win)
  xdotool key --window "$W" --clearmodifiers "$1"
  sleep "${2:-1.5}"
}

case "$1" in
  up)      up ;;
  restart)
    # Wait for it to actually be gone: `up` skips launching when it still sees
    # a process, and the screenshot then lands on nothing at all.
    pkill -x desmume-cli
    for _ in $(seq 15); do pgrep -x desmume-cli >/dev/null || break; sleep 1; done
    up ;;
  shot)    shot "$2" ;;
  press)   press "$2" "$3" ;;
  down)    pkill -x desmume-cli ;;
  *)       echo "usage: ds_emu.sh {up|restart|shot FILE.png|press KEY [SEC]|down}" ;;
esac
