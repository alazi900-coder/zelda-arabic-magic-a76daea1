#!/usr/bin/env python3
"""Verify the Zelda Minish Cap USA dialogue RTL hook/cave is present.

This is a lightweight structural check. It does not emulate the game.
"""
from pathlib import Path
import argparse
import hashlib

CLEAN_SHA1 = "b4bd50e4131b027c334547b4524e2dbbd4227130"
HOOK_OFF = 0x0569BA
CAVE_OFF = 0x10D514
ORIGINAL_HOOK = bytes.fromhex("51f797fe")  # original BL bytes used by the clean ROM at the hook site


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("rom")
    args = ap.parse_args()

    data = Path(args.rom).read_bytes()
    sha1 = hashlib.sha1(data).hexdigest()
    print("SHA1:", sha1)
    print("Size:", hex(len(data)))

    if sha1 == CLEAN_SHA1:
        print("FAIL: this is still the clean unpatched USA ROM.")
        return 2
    if len(data) <= CAVE_OFF + 0x80:
        print("FAIL: ROM is too small to contain the expected code cave.")
        return 2

    hook = data[HOOK_OFF:HOOK_OFF + 4]
    cave = data[CAVE_OFF:CAVE_OFF + 16]
    print(f"Hook @ 0x{HOOK_OFF:06X}:", hook.hex())
    print(f"Cave @ 0x{CAVE_OFF:06X}:", cave.hex())

    ok = True
    if hook == ORIGINAL_HOOK:
        print("FAIL: hook still contains original draw call bytes.")
        ok = False
    if cave.count(0) == len(cave) or cave.count(0xFF) == len(cave):
        print("FAIL: code cave appears empty.")
        ok = False

    if ok:
        print("OK: RTL hook/cave structure is present.")
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
