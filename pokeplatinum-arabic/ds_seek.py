"""Drive the DS emulator until the dialogue box is on screen, then stop.

Chasing a frame by sleeping the right number of seconds does not work: the
intro's fades and the title's blink drift, and every run lands somewhere else.
So this presses, looks, and decides -- the box is a wide light band across the
bottom of the top screen, which nothing else in the intro looks like.
"""
import subprocess, sys, time
from PIL import Image

S = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/"
EMU = "./ds_emu.sh"


def shot(name):
    subprocess.run([EMU, "shot", name], capture_output=True)
    return Image.open(S + name.replace(".png", "_top.png")).convert("RGB")


def has_dialogue(im):
    """A light band low on a flat screen.

    The band alone is not enough -- the title screen's cloud border is pale
    too, and it matched on the first run. What separates them is how many
    colours the screen carries: the title is a painted logo with hundreds, an
    intro scene with a message window has a few dozen.
    """
    band = im.crop((0, int(im.height * 0.80), im.width, im.height))
    px = list(band.getdata())
    light = sum(1 for r, g, b in px if r > 200 and g > 195 and b > 180)
    colours = len(im.getcolors(200000) or [])
    # A fade to white passes both tests above and is not a message window, so
    # a frame that is nearly one colour is rejected outright.
    top = im.crop((0, 0, im.width, int(im.height * 0.6)))
    top_px = list(top.getdata())
    flat = max(top.getcolors(200000) or [(0, None)])[0] > len(top_px) * 0.9
    return light > len(px) * 0.45 and colours < 120 and not flat


def main(key, tries, out):
    for i in range(int(tries)):
        im = shot("seek.png")
        if has_dialogue(im):
            im.save(S + out)
            print(f"لوحة الحوار ظهرت بعد {i} ضغطة -> {out}")
            return 0
        subprocess.run([EMU, "press", key, "1.2"], capture_output=True)
        time.sleep(0.3)
    print("لم تظهر لوحة الحوار")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
