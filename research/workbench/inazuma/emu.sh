#!/bin/bash
# Emulator control helpers for Inazuma testing.
#
# Two things the earlier attempts got wrong:
#  1. the .sav never loaded (autodetect picked EEPROM 4kbit for a 64KB file),
#     so every boot started a new game at the name-entry screen
#  2. xdotool's instant click is press+release inside one X event, which the
#     emulator's once-per-frame input poll can miss entirely -- touch needs to
#     be HELD for several frames
#
# Screen geometry: the SDL window is 256x384 (two DS screens stacked). Touch
# coordinates are given in DS bottom-screen space (0..255, 0..191) and mapped
# to window space by adding the 192px top-screen offset.

SCRATCH="/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma"
export DISPLAY=:77

emu_win() {
  # the title is "Desmume <fps>" and changes every frame, so match loosely
  # (xdotool search has no -i flag, hence the character class)
  xdotool search --name "[Dd]esmume" 2>/dev/null | tail -1
}

emu_geom() {
  local w; w=$(emu_win)
  [ -z "$w" ] && { echo "no window" >&2; return 1; }
  xdotool getwindowgeometry --shell "$w"
}

# tap <ds_x> <ds_y> [hold_seconds]
# DS bottom-screen coordinates, 0..255 x 0..191.
tap() {
  local dsx=$1 dsy=$2 hold=${3:-0.35}
  local w; w=$(emu_win)
  [ -z "$w" ] && { echo "no window" >&2; return 1; }
  eval "$(xdotool getwindowgeometry --shell "$w")"
  # window is 256 wide, 384 tall: top screen rows 0-191, bottom screen rows 192-383
  local px=$(( X + dsx ))
  local py=$(( Y + 192 + dsy ))
  xdotool mousemove "$px" "$py"
  sleep 0.08
  xdotool mousedown 1
  sleep "$hold"
  xdotool mouseup 1
  sleep 0.15
}

# press <key> [times] [delay]
press() {
  local key=$1 times=${2:-1} delay=${3:-0.25}
  for _ in $(seq 1 "$times"); do
    xdotool key "$key"
    sleep "$delay"
  done
}

shot() {
  import -window root "$SCRATCH/shots/$1.png"
}

start_emu() {
  local rom=$1 sav=$2
  pkill desmume-cli 2>/dev/null
  pkill Xvfb 2>/dev/null
  sleep 1
  [ -n "$sav" ] && cp "$sav" "${rom%.nds}.sav"
  Xvfb :77 -screen 0 1024x768x24 &
  sleep 2
  # save-type 3 = EEPROM 512kbit = 65536 bytes, which is what the .sav actually is
  /usr/games/desmume-cli --disable-sound --disable-limiter --cpu-mode=1 \
    --save-type=3 "$rom" > /tmp/desmume_run.log 2>&1 &
  sleep 3
  local w; w=$(emu_win)
  [ -n "$w" ] && xdotool windowactivate "$w" 2>/dev/null
  sleep 0.5
  grep -E "BackupDevice|savetype|save type" /tmp/desmume_run.log
}
