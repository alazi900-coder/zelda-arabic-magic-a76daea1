// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/findfont.ts
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
  const files2 = [];
  for (let i = 0; i * 8 + 8 <= fatSize; i++) {
    const at = fatOff + i * 8;
    files2.push({ id: i, start: u32(rom2, at), end: u32(rom2, at + 4) });
  }
  return files2;
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

// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/findfont.ts
var rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
var map = ndsFileIdByPath(rom);
var files = ndsFiles(rom);
for (const [p, id] of map) if (/font/i.test(p)) console.log(p, "id", id, "size", files[id].end - files[id].start);
