#!/bin/bash
# Bring the emulator up and keep it up.  Xvfb and mGBA are detached with setsid
# so they are not reaped when the shell that started them exits, and mGBA runs
# with a dummy audio device: it syncs to audio by default and a missing ALSA
# device freezes the core outright (black screen, zero CPU).
export DISPLAY=:77 SDL_AUDIODRIVER=dummy
ROM=/home/user/decomps/pokeemerald/pokeemerald.gba
S=/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad

up() {
  pgrep -x Xvfb >/dev/null || { setsid Xvfb :77 -screen 0 900x700x24 -ac +extension GLX >/dev/null 2>&1 < /dev/null & sleep 3; }
  pgrep -x twm  >/dev/null || { setsid twm >/dev/null 2>&1 < /dev/null & sleep 2; }
  pgrep -x mgba >/dev/null || {
    setsid /usr/games/mgba -C audioSync=0 -3 "$ROM" >/dev/null 2>&1 < /dev/null &
    sleep 9
    xdotool windowfocus $(xdotool search --name mGBA | head -1); sleep 1
  }
}
shot() { import -window "$(xdotool search --name mGBA | head -1)" "$S/$1"; }
press() { xdotool keydown --clearmodifiers "$1"; sleep 0.25; xdotool keyup --clearmodifiers "$1"; sleep "${2:-1.6}"; }

case "$1" in
  up) up ;;
  restart) pkill -9 -x mgba; sleep 1; up ;;
  shot) shot "$2" ;;
  press) press "$2" "$3" ;;
esac
