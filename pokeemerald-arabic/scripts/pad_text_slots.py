"""Room to grow after every message in the assembled text files.

Arabic says the same thing in more letters than English does often enough to
matter: 155 lines came out one to eight bytes too long for the slot the English
word left behind, and a line the game reaches by index rather than by pointer
cannot be moved somewhere roomier.

There is nothing scarce here to trade for it -- the build uses 14.9 MB of the
cartridge's 32 -- so every message simply gets eight bytes of zero after its
terminator. Zero is what a C array's padding already is, so gen_slots.py counts
this room the same way it counts a name field's, and nothing else in the game
reads past a terminator.
"""
import glob, re, sys

PAD = 8
LINE = re.compile(r'^([ \t]*)\.string[ \t]+"((?:[^"\\]|\\.)*)"[ \t]*$')


def pad_file(path):
    out, changed = [], 0
    for line in open(path, encoding="utf-8").read().split("\n"):
        out.append(line)
        m = LINE.match(line)
        if m and "$" in m.group(2):
            out.append(f"{m.group(1)}.space {PAD}")
            changed += 1
    if changed:
        open(path, "w", encoding="utf-8").write("\n".join(out))
    return changed


def main(root):
    root = root.rstrip("/") + "/"
    total = files = 0
    for pat in ("data/**/*.inc", "data/**/*.s"):
        for path in glob.glob(root + pat, recursive=True):
            n = pad_file(path)
            if n:
                files += 1
                total += n
    print(f"{total} رسالة في {files} ملفاً، لكلٍّ {PAD} بايتات إضافية")


if __name__ == "__main__":
    main(sys.argv[1])
