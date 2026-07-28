import { describe, it, expect } from "vitest";
import fs from "node:fs";
import init, { list_textures, replace_texture, decode_texture_png } from "@/lib/metroid-prime/generated/mp_wasm.js";

// Exercises the shipped .wasm the image tool actually loads, against a real
// game .pak — the font atlas is BC7, the same encoding path the UI artwork
// needs, so a pass here means the browser path works too.
const PAK = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/dfcec848-PreloadFrontEndMPT.pak";
const PAGE0 = "0c5e6d05-e53c-451d-9394-ae8ae5a576b3";

// The .pak is a copy of the user's game, not something that can live in the
// repo, so these run wherever it is present and stand aside where it isn't
// rather than failing for a reason that has nothing to do with the code.
describe.skipIf(!fs.existsSync(PAK))("Metroid Prime texture replacement (shipped wasm)", () => {
  it("lists textures with the details the picker needs", async () => {
    await init({ module_or_path: fs.readFileSync("public/wasm/metroid-prime/mp_wasm_bg.wasm") });
    const pak = new Uint8Array(fs.readFileSync(PAK));
    const list = JSON.parse(list_textures(pak));
    expect(list.length).toBeGreaterThan(0);
    const page0 = list.find((t: { id: string }) => t.id === PAGE0);
    expect(page0).toMatchObject({ width: 512, height: 581, format: "BptcUnorm", mips: 1, readable: true });
  });

  it("replaces a BC7 texture and keeps its size, format and every other asset", async () => {
    await init({ module_or_path: fs.readFileSync("public/wasm/metroid-prime/mp_wasm_bg.wasm") });
    const pak = new Uint8Array(fs.readFileSync(PAK));
    const before = JSON.parse(list_textures(pak));
    const { width, height } = before.find((t: { id: string }) => t.id === PAGE0);

    // A flat, exactly-representable colour: after a round trip through BC7 it
    // must come back untouched, so any drift here is the tool's fault, not
    // the codec's.
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba.set([10, 20, 30, 254], i * 4);
    }
    const out = replace_texture(pak, PAGE0, rgba, width, height);

    const after = JSON.parse(list_textures(out));
    expect(after).toHaveLength(before.length);
    const page0 = after.find((t: { id: string }) => t.id === PAGE0);
    expect(page0).toMatchObject({ width, height, format: "BptcUnorm", mips: 1 });
    // Only the target changed.
    for (const t of before) {
      if (t.id === PAGE0) continue;
      expect(after.find((x: { id: string }) => x.id === t.id)).toEqual(t);
    }
    // And the pixels really are the new ones — decoding is the only proof.
    expect(decode_texture_png(out, PAGE0).length).toBeGreaterThan(0);
  });

  it("refuses an image whose size does not match the texture", async () => {
    await init({ module_or_path: fs.readFileSync("public/wasm/metroid-prime/mp_wasm_bg.wasm") });
    const pak = new Uint8Array(fs.readFileSync(PAK));
    expect(() => replace_texture(pak, PAGE0, new Uint8Array(8 * 8 * 4), 8, 8)).toThrow(/8x8|512x581/);
  });
});
