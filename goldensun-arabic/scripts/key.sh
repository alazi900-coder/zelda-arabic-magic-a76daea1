#!/bin/bash
# key.sh KEY [hold_seconds]  -> press one mGBA key (x=A z=B Return=Start BackSpace=Select arrows)
W=$(DISPLAY=:78 xdotool search --name "mGBA" | head -1)
DISPLAY=:78 xdotool keydown --window $W $1; sleep ${2:-0.15}; DISPLAY=:78 xdotool keyup --window $W $1
