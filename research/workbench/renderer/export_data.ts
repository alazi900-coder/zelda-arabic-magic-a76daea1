import { readFileSync, writeFileSync } from "fs";
import { deflateSync } from "zlib";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";
import { decodeRgba4444Tiled } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/pica-texture.ts";

// minimal PNG encoder (reuse pattern from earlier scripts)
const CRC_TABLE = (() => { const t=new Uint32Array(256); for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;} return t; })();
function crc32(buf: Uint8Array){let c=0xffffffff;for(let i=0;i<buf.length;i++)c=CRC_TABLE[(c^buf[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type:string,data:Uint8Array){const out=new Uint8Array(8+data.length+4);const v=new DataView(out.buffer);v.setUint32(0,data.length,false);out.set(new TextEncoder().encode(type),4);out.set(data,8);v.setUint32(8+data.length,crc32(out.slice(4,8+data.length)),false);return out;}
function encodePng(w:number,h:number,rgba:Uint8Array|Uint8ClampedArray){const sig=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);const ihdrData=new Uint8Array(13);const iv=new DataView(ihdrData.buffer);iv.setUint32(0,w,false);iv.setUint32(4,h,false);ihdrData[8]=8;ihdrData[9]=6;const ihdr=chunk("IHDR",ihdrData);const stride=w*4;const raw=new Uint8Array((stride+1)*h);for(let y=0;y<h;y++){raw[y*(stride+1)]=0;raw.set(rgba.subarray(y*stride,y*stride+stride),y*(stride+1)+1);}const idat=chunk("IDAT",deflateSync(Buffer.from(raw)));const iend=chunk("IEND",new Uint8Array(0));const out=new Uint8Array(sig.length+ihdr.length+idat.length+iend.length);out.set(sig,0);out.set(ihdr,sig.length);out.set(idat,sig.length+ihdr.length);out.set(iend,sig.length+ihdr.length+idat.length);return out;}

const path = process.argv[2] || "/tmp/title_logo.cmb";
const buf = readFileSync(path);
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const cmb = parseCmb(data);

// export shape 4 (the patched quad): decode positions/uv0 for the 4 corner vertices.
const shape = cmb.sepds[4];
const posAttrib = shape.attribs.position;
const uv0Attrib = shape.attribs.uv0;
const posBuf = cmb.vatr.attribs.position;
const uv0Buf = cmb.vatr.attribs.uv0;
const posView = new DataView(posBuf.buffer, posBuf.byteOffset, posBuf.byteLength);
const uv0View = new DataView(uv0Buf.buffer, uv0Buf.byteOffset, uv0Buf.byteLength);

const positions: number[][] = [];
for (let i = 0; i < 4; i++) {
  const off = posAttrib.start + i * 12;
  positions.push([posView.getFloat32(off, true), posView.getFloat32(off + 4, true), posView.getFloat32(off + 8, true)]);
}
const uvs: number[][] = [];
for (let i = 0; i < 4; i++) {
  const off = uv0Attrib.start + i * 4;
  const u = uv0View.getInt16(off, true) / 32767;
  const v = uv0View.getInt16(off + 2, true) / 32767;
  uvs.push([u, v]);
}

console.log("positions:", positions);
console.log("uvs:", uvs);
console.log("uv0Attrib.scale:", uv0Attrib.scale, "dataType:", uv0Attrib.dataType);
console.log("posAttrib.scale:", posAttrib.scale, "dataType:", posAttrib.dataType);

// material 4's alpha test fields
const mat = cmb.materials[4];
const matView = new DataView(mat.buffer, mat.byteOffset, mat.byteLength);
console.log("material[4] alphaTestEnabled:", matView.getUint8(0x130), "ref:", matView.getUint8(0x131), "func: 0x" + matView.getUint16(0x132, true).toString(16));

const title00 = cmb.textures.find(t => t.name === "title_00")!;
const rgba = decodeRgba4444Tiled(title00.width, title00.height, title00.pixels);
const png = encodePng(title00.width, title00.height, rgba);
writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/renderer/title00.png", png);

const manifest = { positions, uvs, indices: [0,1,2,2,1,3], texWidth: title00.width, texHeight: title00.height };
writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/renderer/manifest.json", JSON.stringify(manifest, null, 2));
console.log("wrote manifest + texture");
console.log("uv0Attrib.mode:", uv0Attrib.mode, "(0=array,1=constant)");
console.log("posAttrib.mode:", posAttrib.mode);
