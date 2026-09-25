/**
 * Every picture in the cartridge's 2D containers, however it is stored.
 *
 * Most live inside an SFP container, but 121 of the pic2d files are a single
 * bare image: the same eight-u32 header an SFP entry has, at offset zero, with
 * no container around it. Those were silently skipped by the first sweep,
 * which is part of why whole menus never reached the OCR pass.
 */
import { readdirSync, readFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";

export function containerEntries(file) {
  const raw = lz77Decompress(new Uint8Array(readFileSync(`spf/${file}`)));
  try {
    const list = parseSfp(raw);
    if (list.length) return { raw, entries: list };
  } catch { /* falls through to the bare form */ }
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.length);
  if (dv.getUint32(0, true) !== 3 || dv.getUint32(4, true) !== 32) return null;
  return { raw, entries: [{ name: file.replace(/\.(SPF_|pac_)$/i, ""), dataOffset: 0, size: raw.length }] };
}

export function allContainers() {
  return readdirSync("spf").filter((f) => f.startsWith("pic2d"));
}
