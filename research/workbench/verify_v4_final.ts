import { readFileSync, writeFileSync } from "fs";
import { deflateSync } from "zlib";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";
import { decodeRgba4444Tiled, GL_FORMAT_RGBA4444 } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/pica-texture.ts";

const original = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/0761e26f-zelda2_mag.gar.lzs");
const origData = new Uint8Array(original.buffer, original.byteOffset, original.byteLength);
const origFiles = parseGar(decompressGrezzoLzs(origData));
const origCmb = parseCmb(origFiles.find(f=>f.typeName==="cmb")!.data);

const patched = readFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/zelda2_mag-arabic-logo-v4.gar.lzs");
const patchedData = new Uint8Array(patched.buffer, patched.byteOffset, patched.byteLength);
const files = parseGar(decompressGrezzoLzs(patchedData));
const cmbFile = files.find(f=>f.typeName==="cmb")!;
console.log("CMB size:", cmbFile.data.length, "(orig:", origFiles.find(f=>f.typeName==="cmb")!.data.length, ")");
const cmb = parseCmb(cmbFile.data);

console.log("header identical:", JSON.stringify(cmb.header) === JSON.stringify(origCmb.header));
console.log("counts:", cmb.textures.length, cmb.materials.length, cmb.meshes.length, cmb.sepds.length,
  "vs orig:", origCmb.textures.length, origCmb.materials.length, origCmb.meshes.length, origCmb.sepds.length);
console.log("mesh list unchanged:", JSON.stringify(cmb.meshes) === JSON.stringify(origCmb.meshes));

console.log("\ntextures:");
cmb.textures.forEach((t,i) => {
  const o = origCmb.textures[i];
  const pixelsSame = Buffer.from(t.pixels).equals(Buffer.from(o.pixels));
  const fmtSame = t.glFormat === o.glFormat;
  console.log(`  [${i}] ${t.name}: fmt 0x${o.glFormat.toString(16)}->0x${t.glFormat.toString(16)} (${fmtSame?"unchanged":"CHANGED"}), pixels ${pixelsSame?"unchanged":"changed"}, size ${t.pixels.length} (orig ${o.pixels.length})`);
});

const title00 = cmb.textures.find(t=>t.name==="title_00")!;
console.log("\ntitle_00 is now RGBA4444:", title00.glFormat === GL_FORMAT_RGBA4444);

// decode title_00 with the SAME decoder used for the real title_sub_00 test (already validated against real data)
const rgba = decodeRgba4444Tiled(title00.width, title00.height, title00.pixels);
// check corner pixel is transparent (background), and check alpha values are varied (not stuck at 255)
console.log("corner (0,0) RGBA:", rgba[0], rgba[1], rgba[2], rgba[3]);
let alphaHistogram: Record<number, number> = {};
for (let i = 3; i < rgba.length; i += 4) alphaHistogram[rgba[i]] = (alphaHistogram[rgba[i]]||0)+1;
console.log("alpha value histogram:", alphaHistogram);

const CRC_TABLE = (() => { const t=new Uint32Array(256); for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;} return t; })();
function crc32(buf: Uint8Array){let c=0xffffffff;for(let i=0;i<buf.length;i++)c=CRC_TABLE[(c^buf[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type:string,data:Uint8Array){const out=new Uint8Array(8+data.length+4);const v=new DataView(out.buffer);v.setUint32(0,data.length,false);out.set(new TextEncoder().encode(type),4);out.set(data,8);v.setUint32(8+data.length,crc32(out.slice(4,8+data.length)),false);return out;}
function encodePng(w:number,h:number,rgba:Uint8Array|Uint8ClampedArray){const sig=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);const ihdrData=new Uint8Array(13);const iv=new DataView(ihdrData.buffer);iv.setUint32(0,w,false);iv.setUint32(4,h,false);ihdrData[8]=8;ihdrData[9]=6;const ihdr=chunk("IHDR",ihdrData);const stride=w*4;const raw=new Uint8Array((stride+1)*h);for(let y=0;y<h;y++){raw[y*(stride+1)]=0;raw.set(rgba.subarray(y*stride,y*stride+stride),y*(stride+1)+1);}const idat=chunk("IDAT",deflateSync(Buffer.from(raw)));const iend=chunk("IEND",new Uint8Array(0));const out=new Uint8Array(sig.length+ihdr.length+idat.length+iend.length);out.set(sig,0);out.set(ihdr,sig.length);out.set(idat,sig.length+ihdr.length);out.set(iend,sig.length+ihdr.length+idat.length);return out;}
const png = encodePng(title00.width, title00.height, rgba);
writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/v4_title00_preview.png", png);
console.log("\nwrote preview");
