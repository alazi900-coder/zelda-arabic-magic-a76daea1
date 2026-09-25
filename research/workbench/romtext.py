"""Read the English string the retail ROM holds at a given offset.

The tool's JSON keys are offsets into this ROM and nothing else, so this is
the only way to learn which line each Arabic translation belongs to.  Decoding
uses the *vanilla* charmap -- the project's own charmap has since handed many
of those bytes to Arabic letters.
"""
import re

VANILLA = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/charmap_vanilla.txt"

def load():
    single = {}
    for line in open(VANILLA, encoding="utf-8"):
        line = line.split("@")[0].strip()
        m = re.match(r"^'(\\?.)'\s*=\s*([0-9A-F]{2})\s*$", line)
        if m:
            ch = m.group(1)
            if len(ch) == 2 and ch[0] == "\\":
                ch = {"n": "\n", "l": "\n", "p": "\n"}.get(ch[1], ch[1])
            single.setdefault(int(m.group(2), 16), ch)
        else:  # named constants like CHAR_NEWLINE = FE
            m = re.match(r"^([A-Z_0-9]+)\s*=\s*([0-9A-F]{2})\s*$", line)
            if m:
                single.setdefault(int(m.group(2), 16), None)
    return single

CMAP = load()
# how many bytes follow each control code, so decoding can step over them
FC_ARGS = {0x01:1, 0x02:1, 0x03:1, 0x04:3, 0x05:1, 0x06:1, 0x07:0, 0x08:1,
           0x09:0, 0x0A:0, 0x0B:2, 0x0C:1, 0x0D:1, 0x0E:1, 0x0F:0, 0x10:0,
           0x11:1, 0x12:1, 0x13:1, 0x14:1, 0x15:0, 0x16:0, 0x17:0, 0x18:0}


def read(rom, off, limit=1000):
    """-> (plain letters only, full text with newlines as \\n)"""
    out = []
    i = off
    while i < off + limit and i < len(rom):
        b = rom[i]
        if b == 0xFF:            # EOS
            break
        if b == 0xFC:            # extended control code
            n = FC_ARGS.get(rom[i + 1], 1)
            i += 2 + n
            continue
        if b == 0xFD:            # placeholder (PLAYER, STR_VAR_1, ...)
            out.append("\0")
            i += 2
            continue
        if b in (0xFA, 0xFB, 0xFE):   # line / paragraph / newline
            out.append("\n")
            i += 1
            continue
        ch = CMAP.get(b)
        out.append(ch if ch else "\0")
        i += 1
    return "".join(out)


if __name__ == "__main__":
    import json, sys
    rom = open("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/e2c19936-Pokemon__Emerald_Version_USA_Europe.gba", "rb").read()
    d = json.load(open("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/80672cb9-translations_20260811.json", encoding="utf-8"))
    ks = [k for k in d if k.startswith("pkm_rom:")][:12]
    for k in ks:
        off = int(k.split(":")[1])
        print(f"{off:#x}\n  EN: {read(rom, off)!r}\n  AR: {d[k]!r}")
