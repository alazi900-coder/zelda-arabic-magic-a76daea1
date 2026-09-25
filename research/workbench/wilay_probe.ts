import { replaceWilayTexture, type WilayTextureInfo } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/wilay-parser";

const W = 64, H = 64;
const rgba = new Uint8Array(W * H * 4).fill(180);
const names: Record<number, string> = {1:'R8',37:'RGBA8',41:'RGBA16F',57:'RGBA4',66:'BC1',67:'BC2',68:'BC3',73:'BC4',75:'BC5',77:'BC7',80:'BC6H',109:'BGRA8'};
const bpp: Record<number, number> = {66:8,73:8,67:16,68:16,75:16,77:16,80:16,1:1,37:4,109:4,41:8,57:2};

console.log("النوع        المتوقع   الناتج   الحالة");
for (const fmt of [66,68,73,77,37, 67,75,80,109,1,41,57]) {
  const blocks = Math.ceil(W/4)*Math.ceil(H/4);
  const expected = [66,67,68,73,75,77,80].includes(fmt) ? blocks*bpp[fmt] : W*H*bpp[fmt];
  const tex = { type:'mibl', dataOffset: 64, dataSize: 4096,
    width: W, height: H,
    footer: { imageFormat: fmt, depth:1, viewDimension:2, version:10001 } } as unknown as WilayTextureInfo;
  const file = new Uint8Array(64 + 4096 + 64).buffer;
  let out = "—", status = "";
  try {
    const r = replaceWilayTexture(file, tex, rgba, W, H);
    const produced = r ? r.byteLength - (64 + 64) : 0;
    out = String(produced);
    status = produced >= expected ? "✅" : `❌ ينقص ${expected - produced} بايت`;
  } catch (e) { out = "استثناء"; status = "❌ " + (e as Error).message.slice(0, 40); }
  console.log(`${(names[fmt]||fmt).padEnd(11)} ${String(expected).padEnd(9)} ${out.padEnd(8)} ${status}`);
}
