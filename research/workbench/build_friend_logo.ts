import { readFileSync, writeFileSync } from "fs";
import { patchTitleLogoArchive, LOGO_WIDTH, LOGO_HEIGHT } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/pipeline.ts";

const rawPath = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/friend_logo_256x128.raw";
const raw = readFileSync(rawPath);
const rgba = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength);
console.log("raw bytes:", rgba.length, "expected:", LOGO_WIDTH * LOGO_HEIGHT * 4);

const archivePath = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/0761e26f-zelda2_mag.gar.lzs";
const archive = new Uint8Array(readFileSync(archivePath).buffer);

const patched = patchTitleLogoArchive(archive, rgba);
console.log("patched size:", patched.length);

const outPath = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/zelda2_mag-arabic-logo-v3.gar.lzs";
writeFileSync(outPath, patched);
console.log("wrote", outPath);
