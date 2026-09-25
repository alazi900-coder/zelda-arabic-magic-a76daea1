// Builds a ROM whose ONLY difference from the stock cartridge is the three
// patched NFTR fonts -- no text is touched, so the bytes outside the fonts stay
// exactly as the stock ROM has them.
import { readFileSync, writeFileSync } from "node:fs";
import { buildInazumaRom } from "@/lib/inazuma/inazuma-editor-bridge";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const r = buildInazumaRom(rom, {});
console.log("translated lines:", r.translatedLines);
writeFileSync(process.argv[3], r.rom);
console.log("wrote", process.argv[3]);
