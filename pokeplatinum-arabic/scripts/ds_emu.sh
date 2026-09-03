#!/bin/bash
# desmume-cli on a headless X server, for checking the Platinum build.
#
# Two things that look like unrelated failures are actually one rule: this
# container has no touchscreen and no sound card, so anything the emulator
# waits on from either freezes it solid with no error message.
#
#   --console-type=fat   DSi mode (the default) shows a "Health and Safety"
#                         screen that waits for a touch on real hardware.
#                         There is no touch emulation here, so it never
#                         advances -- a permanently white screen. `fat` (a
#                         plain DS) skips it entirely; the DSi mode was only
#                         ever an optional extra, never required by the game.
#
#   SDL_AUDIODRIVER=dummy DeSmuME syncs to audio by default. With no ALSA
#                         device, that wait never resolves -- a black screen,
#                         0% CPU, and nothing in the log to say why.
#
# melonDS (built from source) and RetroArch were tried first and both failed
# here for reasons specific to this container: melonDS binds its savestates
# to Qt shortcuts that need window focus, and no window manager here grants
# it; RetroArch crashes in video_driver_init_internal() once detached from
# the launching terminal. desmume-cli reads the keyboard directly and needs
# neither.
export DISPLAY=:77 SDL_AUDIODRIVER=dummy
EMU=/usr/games/desmume-cli
ROM="${ROM:-/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds}"
S=/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad

win() { xdotool search --name -- "Desmume" 2>/dev/null | tail -1; }

up() {
  pgrep -x Xvfb >/dev/null || { setsid Xvfb :77 -screen 0 900x900x24 -ac >/dev/null 2>&1 </dev/null & sleep 4; }
  pgrep -x desmume-cli >/dev/null || {
    setsid "$EMU" --console-type=fat --num-cores=1 "$ROM" >/tmp/desmume.log 2>&1 </dev/null &
    sleep 8
  }
  pgrep -x desmume-cli >/dev/null || { echo "لم يقلع"; return 1; }
  echo "يعمل: $(pgrep -x desmume-cli)"
}

shot() {
  # No window manager, so the emulator's window has no titlebar to find by
  # name reliably in every state -- grabbing the whole (otherwise black) root
  # and splitting it is simpler and has not missed yet.
  import -window root "$S/$1" 2>/dev/null
  python3 - "$S/$1" <<'PY'
import sys
from PIL import Image
path = sys.argv[1]
im = Image.open(path).convert("RGB")
box = im.getbbox()
if box:
    im = im.crop(box)
im.save(path)
h = im.height // 2
im.crop((0, 0, im.width, h)).save(path.replace(".png", "_top.png"))
im.crop((0, h, im.width, im.height)).save(path.replace(".png", "_bottom.png"))
PY
}

press() {
  local w
  w=$(win)
  xdotool key --window "${w:-1}" --clearmodifiers "$1"
  sleep "${2:-1.5}"
}

case "$1" in
  up)      up ;;
  restart) pkill -x desmume-cli; for _ in $(seq 15); do pgrep -x desmume-cli >/dev/null || break; sleep 1; done; up ;;
  shot)    shot "$2" ;;
  press)   press "$2" "$3" ;;
  down)    pkill -x desmume-cli ;;
  *)       echo "usage: ds_emu.sh {up|restart|shot FILE.png|press KEY [SEC]|down}" ;;
esac
