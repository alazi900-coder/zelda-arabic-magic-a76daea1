"""Apply the right-to-left patch to a Phantom Hourglass (USA) ROM.

    pip install bsdiff4
    python3 apply.py "Phantom Hourglass (USA).nds"

Writes <name>_rtl.nds beside it. The source ROM must be the USA release,
sha1 4c8f52dd719918bbcd46e73a8bae8628139c1b85 — the patch is refused otherwise,
since applying it to a different dump produces a ROM that only looks fine.
"""
import hashlib, os, sys

EXPECT = "4c8f52dd719918bbcd46e73a8bae8628139c1b85"

def main(rom):
    import bsdiff4
    data = open(rom, "rb").read()
    got = hashlib.sha1(data).hexdigest()
    if got != EXPECT:
        sys.exit(f"هذا ليس روم USA المطلوب.\n  المتوقع: {EXPECT}\n  الموجود: {got}")
    patch = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ph_arabic_rtl.bsdiff")
    out = os.path.splitext(rom)[0] + "_rtl.nds"
    open(out, "wb").write(bsdiff4.patch(data, open(patch, "rb").read()))
    print("تمّ:", out)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
