#!/bin/bash
W=$(DISPLAY=:78 xdotool search --name "mGBA" | head -1)
DISPLAY=:78 import -window $W "$1"
