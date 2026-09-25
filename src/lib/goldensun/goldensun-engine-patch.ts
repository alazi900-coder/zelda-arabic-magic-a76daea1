/**
 * The engine-level ROM edits Arabic text needs, beyond the text table
 * itself. Every one below is a single byte, at a fixed vanilla-ROM address,
 * verified against a matching (non-Arabic, `make compare-rom`-clean) build
 * of https://github.com/Coaltergeist/goldensun-decomp -- see
 * goldensun-arabic/engine.patch for the decomp source diff these come from.
 *
 * `Func_80155d0` (the renderer's per-character sanity check) rejected any
 * code past 0x8F; Golden Sun's font holds Arabic up to 0xFF, so the limit
 * moves to 0xDF (0xDE/0xDF stay the two Japanese voicing marks, never sent
 * through the renderer directly -- see goldensun-arabic-font.ts).
 * `AdvanceMsgText` and `Func_8017aa4` each have one width-vs-limit
 * comparison (`cmp r3, r1; bhi ...`) that also assumed the old, narrower
 * range; both become an unconditional branch so nothing gets truncated.
 *
 * Only for the untouched ROM. Right-to-left display comes from
 * GoldenSun-AR-RTL-FONT.ups (the decomp rebuilt with engine.patch), which
 * already holds all of this plus the mirroring in `BufferString`/`DrawText`;
 * a ROM with that patch skips this file entirely (see buildGoldenSunRom). A
 * ROM built from the untouched one with only what is here has the Arabic
 * font but reads left-to-right.
 */
import { buildGoldenSunFont, GOLDENSUN_FONT_OFFSET } from "./goldensun-arabic-font";

export interface GoldenSunBytePatch {
  addr: number; // ROM address (0x08xxxxxx)
  expected: number;
  value: number;
  why: string;
}

export const GOLDENSUN_ENGINE_BYTE_PATCHES: GoldenSunBytePatch[] = [
  { addr: 0x080155f0, expected: 0x6f, value: 0xdf, why: "Func_80155d0: raise the accepted character limit from 0x8F to 0xFF" },
  { addr: 0x08016e2f, expected: 0xd8, value: 0xe0, why: "AdvanceMsgText: cmp/bhi -> unconditional branch (same width check)" },
  { addr: 0x08017bcd, expected: 0xd8, value: 0xe0, why: "Func_8017aa4: cmp/bhi -> unconditional branch (same width check)" },
];

/** Applies the byte patches and the font overlay to a copy of `rom`. Throws if any patch site doesn't match the expected vanilla byte (wrong ROM version). */
export function applyGoldenSunEnginePatch(rom: Uint8Array): Uint8Array {
  const out = rom.slice();
  for (const p of GOLDENSUN_ENGINE_BYTE_PATCHES) {
    const off = p.addr & 0xffffff;
    if (out[off] !== p.expected) {
      throw new Error(`goldensun-engine-patch: byte at 0x${p.addr.toString(16)} is 0x${out[off].toString(16)}, expected 0x${p.expected.toString(16)} (${p.why})`);
    }
    out[off] = p.value;
  }
  const font = buildGoldenSunFont(rom);
  out.set(font, GOLDENSUN_FONT_OFFSET);
  return out;
}
