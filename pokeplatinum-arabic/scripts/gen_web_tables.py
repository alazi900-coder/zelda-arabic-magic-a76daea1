"""Tables the web editor needs to read and write Platinum's text, taken from
the game's own build inputs rather than restated by hand.

`charmap.txt` is the file msgenc itself encodes with, and it is the *patched*
one -- Arabic in, displaced kana commented out -- so what the editor writes is
by construction what this ROM draws. `text_banks.order` names the 724 message
archives in the order the NARC stores them, which is what turns "archive 389"
into "rowan_intro" in the file list.

Run after any change to the charmap, and commit the JSON.
"""
import json, os, re, sys

PLAT = "/home/user/decomps/pokeplatinum/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public")

ESCAPES = {"\\n": "\n", "\\r": "\r", "\\f": "\f", "\\\\": "\\"}


def value_of(raw):
    """One charmap right-hand side, with msgenc's escapes resolved."""
    if raw.startswith("\\x"):
        return chr(int(raw[2:], 16))
    return ESCAPES.get(raw, raw)


def main():
    chars, commands = {}, {}
    for line in open(PLAT + "tools/msgenc/charmap.txt", encoding="utf-8"):
        line = line.split("//")[0].rstrip("\n").lstrip(" \t")
        m = re.match(r"^([0-9A-Fa-f]{4})=(.+)$", line)
        if not m:
            continue
        code, raw = int(m.group(1), 16), m.group(2)
        if raw.startswith("{") and raw.endswith("}"):
            commands[code] = raw[1:-1]
        else:
            chars[code] = value_of(raw)

    # MessagesDecoder tests `code & 0xFF00` against these before consulting the
    # command table, so the mask -- not the exact code -- is what identifies a
    # string variable.
    strvars = sorted({c & 0xFF00 for c, name in commands.items() if name.startswith("STRVAR_")})

    archives = [l.strip() for l in open(PLAT + "build/res/text/text_banks.order") if l.strip()]

    charmap = {
        "chars": {str(c): v for c, v in sorted(chars.items())},
        "commands": {str(c): v for c, v in sorted(commands.items())},
        "strvarCodes": strvars,
    }
    for name, data in (("pokeplatinum-charmap.json", charmap),
                       ("pokeplatinum-archives.json", archives)):
        path = os.path.join(OUT, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        print(f"{name}: {os.path.getsize(path)} بايت")
    print(f"{len(chars)} حرفاً، {len(commands)} أمراً، {len(archives)} أرشيفاً")


if __name__ == "__main__":
    main()
