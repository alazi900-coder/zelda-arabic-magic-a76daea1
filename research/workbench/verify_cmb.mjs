import { readFileSync } from "fs";

const path = "/tmp/title_logo.cmb";
const buf = readFileSync(path);
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

function cstr(b, at) {
  let end = at;
  while (b[end] !== 0 && end < b.length) end++;
  return Buffer.from(b.subarray(at, end)).toString("ascii");
}

console.log("magic:", cstr(data, 0));
const version = view.getUint32(8, true);
console.log("version:", version);
const name = cstr(data, 16);
console.log("name:", name);
const faceIndicesCount = view.getUint32(32, true);
console.log("faceIndicesCount:", faceIndicesCount);
const sklmOffset = view.getUint32(52, true);
console.log("sklmOffset:", sklmOffset);
console.log("sklm magic:", cstr(data, sklmOffset));
const mshOffsetRel = view.getUint32(sklmOffset + 8, true);
const shpOffsetRel = view.getUint32(sklmOffset + 12, true);
const mshsAbs = sklmOffset + mshOffsetRel;
console.log("mshs magic:", cstr(data, mshsAbs));
const meshCount = view.getUint32(mshsAbs + 8, true);
const opaqueMeshCount = view.getUint16(mshsAbs + 12, true);
const idCount = view.getUint16(mshsAbs + 14, true);
console.log("meshCount:", meshCount, "opaqueMeshCount:", opaqueMeshCount, "idCount:", idCount);

const stride = 12;
for (let i = 0; i < meshCount; i++) {
  const off = mshsAbs + 16 + i * stride;
  const sepdIdx = view.getUint16(off, true);
  const matsIdx = view.getUint8(off + 2);
  const bytes = Array.from(data.slice(off, off + stride)).map(b => b.toString(16).padStart(2,"0"));
  console.log(`mesh[${i}] sepdIdx=${sepdIdx} matsIdx=${matsIdx} raw=${bytes.join(" ")}`);
}
