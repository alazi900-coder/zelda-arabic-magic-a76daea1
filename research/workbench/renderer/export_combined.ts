import { readFileSync, writeFileSync } from "fs";
import { deflateSync } from "zlib";
import { parseCmb } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/cmb.ts";
import { decodeRgba4444Tiled } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/mm3d/pica-texture.ts";

const CRC_TABLE = (() => { const t=new Uint32Array(256); for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;} return t; })();
function crc32(buf: Uint8Array){let c=0xffffffff;for(let i=0;i<buf.length;i++)c=CRC_TABLE[(c^buf[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type:string,data:Uint8Array){const out=new Uint8Array(8+data.length+4);const v=new DataView(out.buffer);v.setUint32(0,data.length,false);out.set(new TextEncoder().encode(type),4);out.set(data,8);v.setUint32(8+data.length,crc32(out.slice(4,8+data.length)),false);return out;}
function encodePng(w:number,h:number,rgba:Uint8Array|Uint8ClampedArray){const sig=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);const ihdrData=new Uint8Array(13);const iv=new DataView(ihdrData.buffer);iv.setUint32(0,w,false);iv.setUint32(4,h,false);ihdrData[8]=8;ihdrData[9]=6;const ihdr=chunk("IHDR",ihdrData);const stride=w*4;const raw=new Uint8Array((stride+1)*h);for(let y=0;y<h;y++){raw[y*(stride+1)]=0;raw.set(rgba.subarray(y*stride,y*stride+stride),y*(stride+1)+1);}const idat=chunk("IDAT",deflateSync(Buffer.from(raw)));const iend=chunk("IEND",new Uint8Array(0));const out=new Uint8Array(sig.length+ihdr.length+idat.length+iend.length);out.set(sig,0);out.set(ihdr,sig.length);out.set(idat,sig.length+ihdr.length);out.set(iend,sig.length+ihdr.length+idat.length);return out;}
function morton7(n:number){return ((n>>>2)&0x04)|((n>>>1)&0x02)|(n&0x01);}
function expand5to8(n:number){return (n<<3)|(n>>>2);}
function expand6to8(n:number){return (n<<2)|(n>>>4);}
function decodeRgb565Tiled(width:number,height:number,data:Uint8Array){const out=new Uint8Array(width*height*4);const view=new DataView(data.buffer,data.byteOffset,data.byteLength);let srcOffs=0;for(let yy=0;yy<height;yy+=8){for(let xx=0;xx<width;xx+=8){for(let i=0;i<0x40;i++){const x=morton7(i);const y=morton7(i>>>1);const dstOffs=((yy+y)*width+(xx+x))*4;const p=view.getUint16(srcOffs,true);out[dstOffs+0]=expand5to8((p>>>11)&0x1f);out[dstOffs+1]=expand6to8((p>>>5)&0x3f);out[dstOffs+2]=expand5to8(p&0x1f);out[dstOffs+3]=0xff;srcOffs+=2;}}}return out;}

const path = process.argv[2];
const buf = readFileSync(path);
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const cmb = parseCmb(data);

function decodeIndices(sepd: any): number[] {
  const view = new DataView(sepd.prmsBytes.buffer, sepd.prmsBytes.byteOffset, sepd.prmsBytes.byteLength);
  const boneTableCount = view.getUint16(14, true);
  let prmAbs = 24 + boneTableCount * 2;
  prmAbs = (prmAbs + 3) & ~3;
  const indexType = view.getInt16(prmAbs + 0x10, true);
  const count = view.getUint16(prmAbs + 0x14, true);
  const offset = view.getUint16(prmAbs + 0x16, true) * 2;
  const bytesPerIdx = indexType === 0x1401 ? 1 : 2;
  const vals: number[] = [];
  for (let i = 0; i < count; i++) {
    vals.push(bytesPerIdx === 1 ? cmb.faceIndices[offset + i] : (cmb.faceIndices[offset + i*2] | (cmb.faceIndices[offset+i*2+1] << 8)));
  }
  return vals;
}

function exportShape(shapeIdx: number) {
  const shape = cmb.sepds[shapeIdx];
  const posAttrib = shape.attribs.position;
  const uv0Attrib = shape.attribs.uv0;
  const posBuf = cmb.vatr.attribs.position;
  const uv0Buf = cmb.vatr.attribs.uv0;
  const posView = new DataView(posBuf.buffer, posBuf.byteOffset, posBuf.byteLength);
  const uv0View = new DataView(uv0Buf.buffer, uv0Buf.byteOffset, uv0Buf.byteLength);
  const rawIndices = decodeIndices(shape);
  const uniqueIdx = Array.from(new Set(rawIndices));
  const remap = new Map(uniqueIdx.map((v, i) => [v, i]));
  const positions = uniqueIdx.map((vi) => {
    const off = posAttrib.start + vi * 12;
    return [posView.getFloat32(off, true), posView.getFloat32(off + 4, true), posView.getFloat32(off + 8, true)];
  });
  const uvs = uniqueIdx.map((vi) => {
    const off = uv0Attrib.start + vi * 4;
    const uraw = uv0View.getInt16(off, true);
    const vraw = uv0View.getInt16(off + 2, true);
    return [uraw * uv0Attrib.scale, vraw * uv0Attrib.scale];
  });
  const indices = rawIndices.map((vi) => remap.get(vi)!);
  return { positions, uvs, indices };
}

const shape4 = exportShape(4); // the arabic logo quad
const shape6 = exportShape(6); // majoramask icon

const title00 = cmb.textures.find(t => t.name === "title_00")!;
const maskTex = cmb.textures.find(t => t.name === "majoramask_00")!;
console.log("title00 fmt", title00.glFormat.toString(16), "mask fmt", maskTex.glFormat.toString(16));

const title00Rgba = decodeRgba4444Tiled(title00.width, title00.height, title00.pixels);
writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/renderer/combined_title00.png", encodePng(title00.width, title00.height, title00Rgba));

const maskRgba = decodeRgb565Tiled(maskTex.width, maskTex.height, maskTex.pixels);
writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/renderer/combined_mask.png", encodePng(maskTex.width, maskTex.height, maskRgba));

const manifest = {
  shapes: [
    { name: "logo", ...shape4, texWidth: title00.width, texHeight: title00.height, texFile: "combined_title00.png", alphaTest: true },
    { name: "mask", ...shape6, texWidth: maskTex.width, texHeight: maskTex.height, texFile: "combined_mask.png", alphaTest: false },
  ],
};
writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/renderer/combined_manifest.json", JSON.stringify(manifest));
console.log("shape4 verts:", shape4.positions.length, "shape6 verts:", shape6.positions.length);
console.log("wrote combined manifest");
