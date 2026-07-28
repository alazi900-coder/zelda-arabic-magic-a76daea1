#!/usr/bin/env python3
# The Legend of Zelda: The Minish Cap (USA) dialogue RTL patcher
# Applies TMC_USA_dialogue_RTL_v1.ips to a clean USA ROM.
from pathlib import Path
import argparse, hashlib, sys
EXPECTED_SHA1 = "b4bd50e4131b027c334547b4524e2dbbd4227130"

def apply_ips(data: bytearray, ips: bytes) -> bytearray:
    if not ips.startswith(b"PATCH") or not ips.endswith(b"EOF"):
        raise ValueError("Invalid IPS file")
    pos = 5
    eof = len(ips) - 3
    while pos < eof:
        off = int.from_bytes(ips[pos:pos+3], "big"); pos += 3
        size = int.from_bytes(ips[pos:pos+2], "big"); pos += 2
        if size == 0:
            rle_size = int.from_bytes(ips[pos:pos+2], "big"); pos += 2
            value = ips[pos]; pos += 1
            data[off:off+rle_size] = bytes([value]) * rle_size
        else:
            data[off:off+size] = ips[pos:pos+size]
            pos += size
    return data

def main():
    ap = argparse.ArgumentParser(description="Patch Minish Cap USA dialogue text flow to RTL.")
    ap.add_argument("rom", help="Clean The Minish Cap USA .gba")
    ap.add_argument("out", nargs="?", default="The Minish Cap USA - Dialogue RTL.gba")
    ap.add_argument("--ips", default="TMC_USA_dialogue_RTL_v1.ips")
    ap.add_argument("--force", action="store_true", help="Apply even if SHA1 does not match")
    args = ap.parse_args()
    data = bytearray(Path(args.rom).read_bytes())
    sha1 = hashlib.sha1(data).hexdigest()
    if sha1 != EXPECTED_SHA1 and not args.force:
        print(f"ERROR: ROM SHA1 mismatch: {sha1}\nExpected: {EXPECTED_SHA1}\nUse --force only if you know it is the same compatible USA build.", file=sys.stderr)
        return 2
    ips = Path(args.ips).read_bytes()
    out = apply_ips(data, ips)
    Path(args.out).write_bytes(out)
    print(f"Done: {args.out}")
    print("New SHA1:", hashlib.sha1(out).hexdigest())
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
