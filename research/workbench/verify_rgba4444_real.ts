import { readFileSync, writeFileSync } from "fs";
import { deflateSync } from "zlib";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";
import { decodeRgba4444Tiled } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/pica-texture.ts";

const buf = readFileSync("/tmp/title_logo.cmb"); // original, untouched
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const cmb = parseCmb(data);
const titleSub = cmb.textures.find(t => t.name === "title_sub_00")!;
console.log("title_sub_00:", titleSub.width, titleSub.height, "fmt=0x" + titleSub.glFormat.toString(16));
const rgba = decodeRgba4444Tiled(titleSub.width, titleSub.height, titleSub.pixels);

const CRC_TABLE = (() => { const t=new Uint32Array(256); for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;} return t; })();
function crc32(buf: Uint8Array){let c=0xffffffff;for(let i=0;i<buf.length;i++)c=CRC_TABLE[(c^buf[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type:string,data:Uint8Array){const out=new Uint8Array(8+data.length+4);const v=new DataView(out.buffer);v.setUint32(0,data.length,false);out.set(new TextEncoder().encode(type),4);out.set(data,8);v.setUint32(8+data.length,crc32(out.slice(4,8+data.length)),false);return out;}
function encodePng(w:number,h:number,rgba:Uint8Array|Uint8ClampedArray){const sig=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);const ihdrData=new Uint8Array(13);const iv=new DataView(ihdrData.buffer);iv.setUint32(0,w,false);iv.setUint32(4,h,false);ihdrData[8]=8;ihdrData[9]=6;const ihdr=chunk("IHDR",ihdrData);const stride=w*4;const raw=new Uint8Array((stride+1)*h);for(let y=0;y<h;y++){raw[y*(stride+1)]=0;raw.set(rgba.subarray(y*stride,y*stride+stride),y*(stride+1)+1);}const idat=chunk("IDAT",deflateSync(Buffer.from(raw)));const iend=chunk("IEND",new Uint8Array(0));const out=new Uint8Array(sig.length+ihdr.length+idat.length+iend.length);out.set(sig,0);out.set(ihdr,sig.length);out.set(idat,sig.length+ihdr.length);out.set(iend,sig.length+ihdr.length+idat.length);return out;}

const png = encodePng(titleSub.width, titleSub.height, rgba);
writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/title_sub_00_decoded.png", png);
console.log("wrote preview");
