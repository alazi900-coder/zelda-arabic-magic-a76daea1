import { readFileSync, writeFileSync } from "fs";
import { deflateSync } from "zlib";
import { decompressGrezzoLzs } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/grezzo-lz.ts";
import { parseGar } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/gar.ts";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";

const CRC_TABLE = (() => { const t=new Uint32Array(256); for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;} return t; })();
function crc32(buf: Uint8Array){let c=0xffffffff;for(let i=0;i<buf.length;i++)c=CRC_TABLE[(c^buf[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type:string,data:Uint8Array){const out=new Uint8Array(8+data.length+4);const v=new DataView(out.buffer);v.setUint32(0,data.length,false);out.set(new TextEncoder().encode(type),4);out.set(data,8);v.setUint32(8+data.length,crc32(out.slice(4,8+data.length)),false);return out;}
function encodePng(w:number,h:number,rgba:Uint8Array|Uint8ClampedArray){const sig=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);const ihdrData=new Uint8Array(13);const iv=new DataView(ihdrData.buffer);iv.setUint32(0,w,false);iv.setUint32(4,h,false);ihdrData[8]=8;ihdrData[9]=6;const ihdr=chunk("IHDR",ihdrData);const stride=w*4;const raw=new Uint8Array((stride+1)*h);for(let y=0;y<h;y++){raw[y*(stride+1)]=0;raw.set(rgba.subarray(y*stride,y*stride+stride),y*(stride+1)+1);}const idat=chunk("IDAT",deflateSync(Buffer.from(raw)));const iend=chunk("IEND",new Uint8Array(0));const out=new Uint8Array(sig.length+ihdr.length+idat.length+iend.length);out.set(sig,0);out.set(ihdr,sig.length);out.set(idat,sig.length+ihdr.length);out.set(iend,sig.length+ihdr.length+idat.length);return out;}
function morton7(n:number){return ((n>>>2)&0x04)|((n>>>1)&0x02)|(n&0x01);}
function expand5to8(n:number){return (n<<3)|(n>>>2);}
function expand6to8(n:number){return (n<<2)|(n>>>4);}
function decodeRgb565Tiled(width:number,height:number,data:Uint8Array){const out=new Uint8Array(width*height*4);const view=new DataView(data.buffer,data.byteOffset,data.byteLength);let srcOffs=0;for(let yy=0;yy<height;yy+=8){for(let xx=0;xx<width;xx+=8){for(let i=0;i<0x40;i++){const x=morton7(i);const y=morton7(i>>>1);const dstOffs=((yy+y)*width+(xx+x))*4;const p=view.getUint16(srcOffs,true);out[dstOffs+0]=expand5to8((p>>>11)&0x1f);out[dstOffs+1]=expand6to8((p>>>5)&0x3f);out[dstOffs+2]=expand5to8(p&0x1f);out[dstOffs+3]=0xff;srcOffs+=2;}}}return out;}

const patched = readFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/zelda2_mag-arabic-logo-v3.gar.lzs");
const data = new Uint8Array(patched.buffer, patched.byteOffset, patched.byteLength);
const gar = decompressGrezzoLzs(data);
const files = parseGar(gar);
const cmbFile = files.find(f=>f.typeName==="cmb")!;
const cmb = parseCmb(cmbFile.data);
console.log("CMB size:", cmbFile.data.length, "(orig should be 182912)");
console.log("textures:", cmb.textures.length, "materials:", cmb.materials.length, "meshes:", cmb.meshes.length, "sepds:", cmb.sepds.length);

const title00 = cmb.textures.find(t=>t.name==="title_00")!;
const rgba = decodeRgb565Tiled(title00.width, title00.height, title00.pixels);
const png = encodePng(title00.width, title00.height, rgba);
writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/preview_v3_title00.png", png);
console.log("wrote preview");
