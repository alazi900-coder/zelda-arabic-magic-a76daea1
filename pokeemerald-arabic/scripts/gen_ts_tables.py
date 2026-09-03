"""Rewrite the tool's Arabic byte table from the build's charmap.txt.

The two have to agree exactly. They are the same fact written twice -- which
byte draws which letter -- and when they drifted apart the tool wrote bytes the
game drew as something else entirely, which only shows once the ROM is running.
So the charmap is the original and this regenerates the copy.
"""
import re, sys

SRC = "/home/user/decomps/pokeemerald/charmap.txt"
TS = "/home/user/zelda-arabic-magic-a76daea1/src/lib/gba/emerald-source-arabic.ts"
ARABIC = lambda cp: 0x0600 <= cp <= 0x06FF or 0xFB50 <= cp <= 0xFEFF


def main():
    codes = {}
    for line in open(SRC, encoding="utf-8"):
        m = re.match(r"^'(.)'\s*=\s*([0-9A-F]{2})\s*$", line.split("@")[0].strip())
        if m and ARABIC(ord(m.group(1))):
            codes[ord(m.group(1))] = int(m.group(2), 16)
    assert len(codes) == 129, len(codes)

    pairs = [f"[0x{cp:04x}, 0x{b:02x}]" for cp, b in sorted(codes.items())]
    rows = [", ".join(pairs[i:i + 5]) + "," for i in range(0, len(pairs), 5)]
    body = "\n".join("  " + r for r in rows)

    ts = open(TS, encoding="utf-8").read()
    new = re.sub(r"(const ARABIC_TO_CODE = new Map<number, number>\(\[\n).*?(\n\]\);)",
                 lambda m: m.group(1) + body + m.group(2), ts, flags=re.S)
    assert new != ts
    open(TS, "w", encoding="utf-8").write(new)
    print(f"جدول الأداة: {len(codes)} رمزاً من charmap.txt")


if __name__ == "__main__":
    main()
