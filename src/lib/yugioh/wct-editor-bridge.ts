/** WCT 2004: English ASCII catalogue for the shared editor. Local browser-only scanning. */
import type { ExtractedEntry } from "@/components/editor/types";

export const WCT_BUFFER_KEY = "yugiohWctSourceBuffer";
export const WCT_SOURCE_GAME = "yugioh-wct2004";
export const WCT_ENTRY_FILE = "ygo_wct_catalog";
const GBA_ROM_START = 0x08000000;

const printable = (v: number) => v >= 0x20 && v <= 0x7e;
const letter = (v: number) => (v >= 0x41 && v <= 0x5a) || (v >= 0x61 && v <= 0x7a);

function pointerCounts(rom: Uint8Array) {
  const counts = new Map<number, number>();
  const view = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  for (let offset = 0; offset + 4 <= rom.length; offset += 4) {
    const value = view.getUint32(offset, true);
    if (value >= GBA_ROM_START && value < GBA_ROM_START + rom.length) {
      const target = value - GBA_ROM_START;
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
  }
  return counts;
}

export function looksLikeWctRom(rom: Uint8Array) { return rom.length >= 0x6f8200 && rom.length <= 0x2000000; }

export function extractWctEntries(rom: Uint8Array): ExtractedEntry[] {
  const pointers = pointerCounts(rom);
  const entries: ExtractedEntry[] = [];
  for (let cursor = 0; cursor < rom.length;) {
    if (!printable(rom[cursor])) { cursor++; continue; }
    const start = cursor; let letters = 0;
    while (cursor < rom.length && printable(rom[cursor]) && cursor - start < 768) { if (letter(rom[cursor])) letters++; cursor++; }
    const length = cursor - start; const pointed = pointers.get(start) ?? 0;
    const valid = cursor < rom.length && rom[cursor] === 0 && length >= 2 && ((letters >= 2 && letters * 2 >= length) || (pointed > 0 && letters >= 1));
    if (!valid) { cursor = start + 1; continue; }
    const original = String.fromCharCode(...Array.from(rom.subarray(start, cursor)));
    entries.push({ msbtFile: WCT_ENTRY_FILE, index: start, label: original.replace(/\s+/g, " ").trim().slice(0, 60), original, maxBytes: length });
    cursor++;
  }
  return entries;
}
