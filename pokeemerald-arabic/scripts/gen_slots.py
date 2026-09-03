"""Which runs in the built ROM are really text, and how much room each one has.

Two things the scanner cannot know, and the source does.

Real or not: the scanner recognises a line by its bytes, so graphics and code
turn up looking like «fBl-l» or «STVYZ». A few thousand of them reach the
editor, and the machine translator happily translates them over whatever those
bytes actually were. But this ROM was built from sources we hold, so a run is
text exactly when the sources contain it -- no heuristic, no guessing.

How much room: a name inside a fixed-size C field is followed by the zero bytes
the compiler pads it with, and those belong to the field. The scanner stops at
the terminator and reports the word's own length, so «JYNX» came back with four
bytes of room when its slot holds ten.

The output is keyed by offset in one particular build, so it carries that
build's checksum and the tool ignores it for any other file.
"""
import glob, hashlib, json, re, sys

sys.path.insert(0, ".")
from pair_src import to_tool_text, units, key   # noqa: E402


def source_text(root):
    """Every string the sources contain, as the tool would render it."""
    exact, keys = set(), set()
    for pat in ("data/**/*.inc", "data/**/*.s", "src/**/*.c", "src/**/*.h"):
        for path in glob.glob(root + pat, recursive=True):
            for u in units(root, path[len(root):]):
                t = to_tool_text(u)
                exact.add(t)
                k = key(t)
                if len(k) >= 3:
                    keys.add(k)
    return exact, keys


def main(root, scan_path, out_path):
    root = root.rstrip("/") + "/"
    exact, keys = source_text(root)
    joined = "\x00".join(keys)
    rom = open(root + "pokeemerald.gba", "rb").read()
    scan = json.load(open(scan_path, encoding="utf-8"))["en"]

    slots, junk = {}, 0
    for e in scan:
        t = e["t"]
        k = key(t)
        # A run split at a colon (the game's ':' is 0xF0, which the scanner
        # will not carry through a run) is half a real line, so a key that
        # only appears inside a source line counts too.
        real = t in exact or (len(k) >= 3 and (k in keys or k in joined))
        if not real:
            junk += 1
            continue
        end = e["o"]
        while rom[end] != 0xFF:
            end += 1
        pad = 0
        while rom[end + 1 + pad] == 0x00:
            pad += 1
        slots[str(e["o"])] = end - e["o"] + pad

    print(f"مسح: {len(scan)}   نصّ حقيقي: {len(slots)}   نفاية مستبعَدة: {junk}")
    grew = sum(1 for e in scan if str(e["o"]) in slots and slots[str(e["o"])] > e["m"])
    print(f"خانات اتّسع حدّها بفضل الحشو: {grew}")
    json.dump({"romSha256": hashlib.sha256(rom).hexdigest(), "slots": slots},
              open(out_path, "w"), separators=(",", ":"))
    print("كُتب:", out_path)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
