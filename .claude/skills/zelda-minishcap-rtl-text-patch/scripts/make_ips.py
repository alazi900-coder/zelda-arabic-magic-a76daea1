#!/usr/bin/env python3
"""Create a simple IPS patch from two ROM files.

Usage:
    python scripts/make_ips.py clean.gba patched.gba out.ips
"""
from pathlib import Path
import argparse


def make_ips(old: bytes, new: bytes) -> bytes:
    out = bytearray(b"PATCH")
    max_len = max(len(old), len(new))
    i = 0
    while i < max_len:
        a = old[i] if i < len(old) else None
        b = new[i] if i < len(new) else None
        if a == b:
            i += 1
            continue
        start = i
        chunk = bytearray()
        while i < max_len and len(chunk) < 0xFFFF:
            a = old[i] if i < len(old) else None
            b = new[i] if i < len(new) else None
            if a == b:
                # Stop at a run of equality to keep records smaller.
                j = i
                while j < max_len:
                    aa = old[j] if j < len(old) else None
                    bb = new[j] if j < len(new) else None
                    if aa != bb:
                        break
                    j += 1
                if j - i >= 8:
                    break
            if i >= len(new):
                break
            chunk.append(new[i])
            i += 1
        if start > 0xFFFFFF:
            raise SystemExit("IPS supports only 24-bit offsets; use BPS/xdelta instead")
        out += start.to_bytes(3, "big")
        out += len(chunk).to_bytes(2, "big")
        out += chunk
    out += b"EOF"
    return bytes(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("clean")
    ap.add_argument("patched")
    ap.add_argument("out")
    args = ap.parse_args()
    old = Path(args.clean).read_bytes()
    new = Path(args.patched).read_bytes()
    Path(args.out).write_bytes(make_ips(old, new))
    print("Wrote", args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
