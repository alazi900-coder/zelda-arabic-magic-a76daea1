#!/bin/bash
# melonDS on a headless X server, with savestates.
#
# DeSmuME's CLI frontend was the first attempt and it has no savestate keys at
# all -- only `--load-slot`, which loads a state it cannot make -- so every
# check meant replaying the intro and hoping the timing landed on the right
# frame. It rarely did: the fades and the title's blink drift on every run.
#
# melonDS is built from source here and binds savestates to Shift+F1..F8 (save)
# and F1..F8 (load), plus a frame-step. So a check becomes: load the state,
# take the shot. No waiting, no drift, same frame every time.
#
# No window manager: twm made xdotool's window search hang, and nothing here
# needs one.
export DISPLAY=:77 XDG_RUNTIME_DIR=/run/user/0
EMU=/home/user/decomps/melonDS/build/melonDS
ROM="${ROM:-/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds}"
S=/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad
MENU_BAR=22   # the Qt menu bar sits above the DS screens; cropped out of shots

win() { xdotool search --name -i melon 2>/dev/null | tail -1; }

up() {
  mkdir -p "$XDG_RUNTIME_DIR"; chmod 700 "$XDG_RUNTIME_DIR"
  pgrep -x Xvfb >/dev/null || { setsid Xvfb :77 -screen 0 800x800x24 -ac >/dev/null 2>&1 </dev/null & sleep 4; }
  pgrep -x melonDS >/dev/null || {
    setsid "$EMU" "$ROM" >/tmp/melon.log 2>&1 </dev/null &
    sleep 12
  }
  pgrep -x melonDS >/dev/null || { echo "لم يقلع"; return 1; }
  echo "يعمل: $(pgrep -x melonDS)"
}

shot() {
  # The whole X root is grabbed and the emulator cut out of it. xdotool cannot
  # find the window with no window manager running, and xwininfo comes back
  # empty here -- but the rest of the root is pure black, so the window's own
  # bounding box says where it is.
  import -window root "$S/$1" 2>/dev/null
  python3 - "$S/$1" "$MENU_BAR" <<'PY'
import sys
from PIL import Image
path, bar = sys.argv[1], int(sys.argv[2])
# A fixed rectangle, not the frame's own bounding box: a dark frame trims
# itself and the two screens then split off-centre. With no window manager
# melonDS always opens in the same corner, so the numbers hold -- measured
# once: the window at (0,20), 256 wide, menu bar 22 tall, then 192+192.
im = Image.open(path).convert("RGB")
X0, Y0, W, SCREEN = 0, 20, 256, 192
im = im.crop((X0, Y0 + bar, X0 + W, Y0 + bar + SCREEN * 2))
im.save(path)
im.crop((0, 0, im.width, SCREEN)).save(path.replace(".png", "_top.png"))
im.crop((0, SCREEN, im.width, im.height)).save(path.replace(".png", "_bottom.png"))
PY
}

# Keys go through XTEST, not XSendEvent: Qt ignores synthetic events aimed at
# a window, so the menu's own shortcuts -- which is what the savestates are --
# never fired when they were sent that way.
press() { xdotool key --clearmodifiers "$1"; sleep "${2:-1.2}"; }
save()  { xdotool key --clearmodifiers "shift+F$1"; sleep 2; }
load()  { xdotool key --clearmodifiers "F$1"; sleep 2; }
step()  { for _ in $(seq "${1:-1}"); do xdotool key --clearmodifiers n; sleep 0.15; done; }

case "$1" in
  up)      up ;;
  restart) pkill -x melonDS; for _ in $(seq 15); do pgrep -x melonDS >/dev/null || break; sleep 1; done; up ;;
  shot)    shot "$2" ;;
  press)   press "$2" "$3" ;;
  save)    save "${2:-1}" ;;
  load)    load "${2:-1}" ;;
  step)    step "$2" ;;
  down)    pkill -x melonDS ;;
  *)       echo "usage: ds_emu.sh {up|restart|shot F.png|press KEY [SEC]|save N|load N|step N|down}" ;;
esac
