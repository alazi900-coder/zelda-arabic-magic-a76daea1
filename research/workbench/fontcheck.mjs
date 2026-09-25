// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/fontcheck.ts
import { readFileSync } from "fs";

// src/lib/nds/nds-rom.ts
var FNT_OFFSET = 64;
var FAT_OFFSET = 72;
var FAT_SIZE = 76;
function u16(rom2, at) {
  return rom2[at] | rom2[at + 1] << 8;
}
function u32(rom2, at) {
  return (rom2[at] | rom2[at + 1] << 8 | rom2[at + 2] << 16 | rom2[at + 3] << 24) >>> 0;
}
function ndsFiles(rom2) {
  const fatOff = u32(rom2, FAT_OFFSET);
  const fatSize = u32(rom2, FAT_SIZE);
  const files = [];
  for (let i = 0; i * 8 + 8 <= fatSize; i++) {
    const at = fatOff + i * 8;
    files.push({ id: i, start: u32(rom2, at), end: u32(rom2, at + 4) });
  }
  return files;
}
function ndsFileIdByPath(rom2) {
  const fnt = u32(rom2, FNT_OFFSET);
  const dirCount = u16(rom2, fnt + 6);
  const names = new Array(dirCount).fill("");
  const parents = new Array(dirCount).fill(0);
  const paths = /* @__PURE__ */ new Map();
  const pending = [];
  for (let dir = 0; dir < dirCount; dir++) {
    const entry = fnt + dir * 8;
    let at = fnt + u32(rom2, entry);
    let fileId = u16(rom2, entry + 4);
    for (; ; ) {
      const control = rom2[at++];
      if (control === 0 || control === 128) break;
      const len = control & 127;
      let name = "";
      for (let i = 0; i < len; i++) name += String.fromCharCode(rom2[at + i]);
      at += len;
      if (control & 128) {
        const sub = u16(rom2, at) & 4095;
        at += 2;
        if (sub < dirCount) {
          names[sub] = name;
          parents[sub] = dir;
        }
      } else {
        pending.push({ dir, name, id: fileId++ });
      }
    }
  }
  const pathOf = (dir) => {
    const parts = [];
    for (let d = dir, guard = 0; d > 0 && guard < dirCount; d = parents[d], guard++) {
      parts.unshift(names[d]);
    }
    return parts.join("/");
  };
  for (const { dir, name, id } of pending) {
    const prefix = pathOf(dir);
    paths.set(prefix ? `${prefix}/${name}` : name, id);
  }
  return paths;
}
function findNdsFile(rom2, path) {
  const id = ndsFileIdByPath(rom2).get(path);
  if (id === void 0) return null;
  const files = ndsFiles(rom2);
  return files[id] ?? null;
}

// src/lib/nds/narc.ts
function u162(b, at) {
  return b[at] | b[at + 1] << 8;
}
function u322(b, at) {
  return (b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24) >>> 0;
}
function ascii(b, at) {
  return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
}
function parseNarc(buf2) {
  if (ascii(buf2, 0) !== "NARC") throw new Error("\u0644\u064A\u0633 \u0623\u0631\u0634\u064A\u0641 NARC");
  const sections = /* @__PURE__ */ new Map();
  let at = u162(buf2, 12);
  for (let i = 0, n = u162(buf2, 14); i < n; i++) {
    const size2 = u322(buf2, at + 4);
    sections.set(ascii(buf2, at), { at, size: size2 });
    at += size2;
  }
  const btaf = sections.get("BTAF");
  const btnf = sections.get("BTNF");
  const gmif = sections.get("GMIF");
  if (!btaf || !btnf || !gmif) throw new Error("\u0623\u0631\u0634\u064A\u0641 NARC \u0646\u0627\u0642\u0635 \u0627\u0644\u0623\u0642\u0633\u0627\u0645");
  const count = u162(buf2, btaf.at + 8);
  const data = gmif.at + 8;
  const files = [];
  for (let i = 0; i < count; i++) {
    const e = btaf.at + 12 + i * 8;
    files.push(buf2.subarray(data + u322(buf2, e), data + u322(buf2, e + 4)));
  }
  return { files, btnf: buf2.subarray(btnf.at, btnf.at + btnf.size) };
}

// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/fontcheck.ts
var rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
var file = findNdsFile(rom, "graphic/pl_font.narc");
var narc = parseNarc(rom.subarray(file.start, file.end));
var buf = narc.files[1];
function u323(b, at) {
  return b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24;
}
var size = u323(buf, 0);
var widthTableOffset = u323(buf, 4);
var numGlyphs = u323(buf, 8);
console.log({ size, widthTableOffset, numGlyphs, maxW: buf[12], maxH: buf[13], tileW: buf[14], tileH: buf[15] });
console.log("total len", buf.length, "expected", widthTableOffset + numGlyphs);
var meta = JSON.parse(readFileSync("/home/user/decomps/pokeplatinum/res/fonts/font_message.json", "utf8"));
var mismatches = 0;
for (let slot = 0; slot < numGlyphs; slot++) {
  const got = buf[widthTableOffset + slot];
  const want = meta.glyphWidths[slot];
  if (got !== want) {
    if (mismatches < 5) console.log("mismatch at", slot, "got", got, "want", want);
    mismatches++;
  }
}
console.log("width-table mismatches:", mismatches, "of", numGlyphs);
