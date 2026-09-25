#!/bin/bash
export DISPLAY=:77 SDL_AUDIODRIVER=dummy
S=/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad
cp /root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/09b8dd7e-1.sav /home/user/decomps/pokeemerald/pokeemerald.sav
setsid /usr/games/mgba -C audioSync=0 -3 /home/user/decomps/pokeemerald/pokeemerald.gba >/dev/null 2>&1 </dev/null &
for i in $(seq 30); do WID=$(xdotool search --name mGBA | head -1); [ -n "$WID" ] && break; sleep 1; done
[ -z "$WID" ] && { echo "no window"; exit 1; }
sleep 8; xdotool windowfocus "$WID"; sleep 1
p(){ xdotool keydown --clearmodifiers "$1"; sleep 0.25; xdotool keyup --clearmodifiers "$1"; sleep "${2:-1.6}"; }
p x 2.5; p x 3.5; p x 3.5          # title -> continue -> overworld
p x 2; p x 3; p x 3; p x 3         # bag scene -> battle begins
p x 2; p x 2                       # past the intro messages
p z 1.5; p Left 1.2; p x 2.5       # action menu -> BAG -> open it
import -window "$WID" "$S/bag3.png"
p Right 1.5                        # next pocket, to see the name scroll
import -window "$WID" "$S/bag4.png"
echo DONE
