/**
 * CMB — Grezzo's 3DS model format (Majora's Mask 3D's `title_logo.cmb`).
 * Every offset here was cross-checked against two independent, working
 * implementations this session: MeltyTool's C# schema (Grezzo/src/schema/cmb)
 * and noclip.website's TypeScript parser (src/OcarinaOfTime3D/cmb.ts, MIT),
 * plus verified live against the real extracted file — so this isn't a
 * blind port, every field width was checked against real bytes.
 *
 * This module doesn't try to be a general CMB editor. It does one thing:
 * replace a set of shapes (Majora's Mask 3D's title logo is 5 separate
 * lettering meshes, each with real carved-outline geometry — confirmed
 * this session by counting their triangles, 32 to 100 each, ruling out a
 * "flat quad with a cutout texture" reading) with a single flat quad
 * carrying a new texture, cloning an existing flat-quad shape already in
 * the same file (the "© Nintendo" plane, shape 0) as the structural
 * template — same vertex-attribute layout, same 6-index (0,1,2,2,1,3)
 * face winding, just new position/UV data and a new texture/material.
 */
import { encodeRgba8Tiled, encodeRgba4444Tiled, GL_FORMAT_RGBA8, GL_FORMAT_RGB565, GL_FORMAT_RGBA4444 } from "./pica-texture";

function cstr(b: Uint8Array, at: number): string {
  let end = at;
  while (b[end] !== 0 && end < b.length) end++;
  return new TextDecoder("ascii").decode(b.subarray(at, end));
}

/** Reads exactly 4 bytes as a chunk magic (e.g. "cmb ", "sklm"). Chunk
 * magics are immediately followed by binary fields (size, counts, …), not
 * a null terminator, so `cstr` — which reads until the first zero byte —
 * would keep consuming into that binary data instead of stopping at 4
 * chars. Every fixed-width magic check in this file must use this, not
 * `cstr`, which is reserved for genuinely null-terminated name fields. */
function magic4(b: Uint8Array, at: number): string {
  return new TextDecoder("ascii").decode(b.subarray(at, at + 4));
}

interface VertexAttrib {
  start: number;
  scale: number;
  dataType: number;
  mode: number; // 0 = array, 1 = constant
  constant: [number, number, number, number];
}

const VATTR_SIZE = 28;
const VATTR_NAMES = ["position", "normal", "tangent", "color", "uv0", "uv1", "uv2", "boneIdx", "boneWeights"] as const;

function readVertexAttrib(view: DataView, off: number): VertexAttrib {
  return {
    start: view.getUint32(off, true),
    scale: view.getFloat32(off + 4, true),
    dataType: view.getUint16(off + 8, true),
    mode: view.getUint16(off + 10, true),
    constant: [
      view.getFloat32(off + 12, true),
      view.getFloat32(off + 16, true),
      view.getFloat32(off + 20, true),
      view.getFloat32(off + 24, true),
    ],
  };
}

function writeVertexAttrib(out: Uint8Array, off: number, a: VertexAttrib): void {
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint32(off, a.start, true);
  view.setFloat32(off + 4, a.scale, true);
  view.setUint16(off + 8, a.dataType, true);
  view.setUint16(off + 10, a.mode, true);
  for (let i = 0; i < 4; i++) view.setFloat32(off + 12 + i * 4, a.constant[i], true);
}

interface Sepd {
  flags: number;
  center: [number, number, number];
  posOffset: [number, number, number];
  attribs: Record<(typeof VATTR_NAMES)[number], VertexAttrib>;
  boneDim: number;
  constantFlags: number;
  /** raw bytes of this shape's prms+prm sub-chunk, verbatim (index data it
   * references lives in the shared face-index buffer, untouched) */
  prmsBytes: Uint8Array;
}

function parseSepd(data: Uint8Array, sepdAbs: number): Sepd {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (magic4(data, sepdAbs) !== "sepd") throw new Error(`sepd غير موجود عند ${sepdAbs}`);
  const primSetCount = view.getUint16(sepdAbs + 8, true);
  const flags = view.getUint16(sepdAbs + 10, true);
  const center: [number, number, number] = [
    view.getFloat32(sepdAbs + 12, true),
    view.getFloat32(sepdAbs + 16, true),
    view.getFloat32(sepdAbs + 20, true),
  ];
  const posOffset: [number, number, number] = [
    view.getFloat32(sepdAbs + 24, true),
    view.getFloat32(sepdAbs + 28, true),
    view.getFloat32(sepdAbs + 32, true),
  ];
  const vattrStart = sepdAbs + 36;
  const attribs = {} as Sepd["attribs"];
  VATTR_NAMES.forEach((name, i) => {
    attribs[name] = readVertexAttrib(view, vattrStart + i * VATTR_SIZE);
  });
  const afterVattr = vattrStart + VATTR_NAMES.length * VATTR_SIZE;
  const boneDim = view.getUint16(afterVattr, true);
  const constantFlags = view.getUint16(afterVattr + 2, true);
  if (primSetCount !== 1) throw new Error(`شكل بأكثر من primitive set (${primSetCount}) غير مدعوم هنا`);
  const primOffsetAbs = afterVattr + 4;
  const primOff = view.getInt16(primOffsetAbs, true);
  const prmsAbs = sepdAbs + primOff;
  // prms: magic(4)+chunkSize(4)+primCount(4)+skinningMode(2)+boneTableCount(2)+boneTableOffset(4)+primitiveOffset(4)
  //       + boneTable[boneTableCount](2 each) + align4 + prm(24 bytes header we care about)
  const boneTableCount = view.getUint16(prmsAbs + 14, true);
  let prmAbs = prmsAbs + 24 + boneTableCount * 2;
  prmAbs = (prmAbs + 3) & ~3;
  if (magic4(data, prmAbs) !== "prm ") throw new Error(`prm غير موجود عند ${prmAbs}`);
  const prmEnd = prmAbs + 24; // fixed-size header this module reads/writes (matches every real prm chunk seen)
  const prmsBytes = data.slice(prmsAbs, prmEnd);
  return { flags, center, posOffset, attribs, boneDim, constantFlags, prmsBytes };
}

/** Serializes a Sepd back to bytes, in the exact same shape `parseSepd`
 * reads (so shape 0's structure, cloned and edited, round-trips). */
function buildSepd(s: Sepd): Uint8Array {
  const HEADER = 36;
  const vattrBytes = VATTR_NAMES.length * VATTR_SIZE;
  const tail = 4 + 2; // boneDim+constantFlags(4) + one prims-offset entry(2)
  const beforeAlign = HEADER + vattrBytes + tail;
  const prmsRelOffset = (beforeAlign + 3) & ~3; // [AlignStart(4)] before the prms sub-chunk
  const total = prmsRelOffset + s.prmsBytes.length;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("sepd"), 0);
  view.setUint32(4, total, true); // chunkSize
  view.setUint16(8, 1, true); // primSetCount
  view.setUint16(10, s.flags, true);
  for (let i = 0; i < 3; i++) view.setFloat32(12 + i * 4, s.center[i], true);
  for (let i = 0; i < 3; i++) view.setFloat32(24 + i * 4, s.posOffset[i], true);
  VATTR_NAMES.forEach((name, i) => writeVertexAttrib(out, HEADER + i * VATTR_SIZE, s.attribs[name]));
  const afterVattr = HEADER + vattrBytes;
  view.setUint16(afterVattr, s.boneDim, true);
  view.setUint16(afterVattr + 2, s.constantFlags, true);
  view.setInt16(afterVattr + 4, prmsRelOffset, true);
  out.set(s.prmsBytes, prmsRelOffset);
  return out;
}

export interface CmbTexture {
  name: string;
  width: number;
  height: number;
  glFormat: number;
  pixels: Uint8Array; // encoded (tiled/swizzled) bytes, ready to embed
}

export interface CmbMesh {
  sepdIdx: number;
  matsIdx: number;
  /** raw bytes for every field after sepdIdx(u16)+matsIdx(u8) that this
   * module doesn't interpret — for MM3D that's 9 bytes (byte 0 of which is
   * a meaningful per-mesh id, confirmed against the real file: it's not
   * just padding, e.g. two meshes sharing one logical id both carry the
   * same value there) — copied verbatim from an existing mesh so nothing
   * meaningful is lost. */
  tailBytes: Uint8Array;
}

export interface CmbModel {
  raw: Uint8Array;
  version: number;
  name: string;
  header: {
    sklOffset: number;
    qtrsOffset: number;
    matsOffset: number;
    texOffset: number;
    sklmOffset: number;
    lutsOffset: number;
    vatrOffset: number;
    faceIndicesOffset: number;
    textureDataOffset: number;
  };
  faceIndicesCount: number;
  textures: CmbTexture[];
  /** each material kept as an opaque 364-byte (MM3D) block, since this
   * module only ever needs to clone one and patch its texture ids */
  materialBlockSize: number;
  materials: Uint8Array[];
  combinersBytes: Uint8Array;
  meshes: CmbMesh[];
  meshesHeaderExtra: { opaqueMeshCount: number; idCount: number };
  meshEntryStride: number;
  sepds: Sepd[];
  vatr: {
    maxIndex: number;
    attribs: Record<(typeof VATTR_NAMES)[number], Uint8Array>; // raw bytes per attribute, already sliced
  };
  faceIndices: Uint8Array;
  textureDataBytes: Uint8Array;
}

function readChunkMagicSize(data: Uint8Array, at: number): { magic: string; size: number } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { magic: magic4(data, at), size: view.getUint32(at + 4, true) };
}

export function parseCmb(data: Uint8Array): CmbModel {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (magic4(data, 0) !== "cmb ") throw new Error('ليس ملف CMB (لا يبدأ بـ "cmb ")');
  const version = view.getUint32(8, true);
  if (version !== 10) throw new Error(`إصدار CMB غير مدعوم هنا: ${version} (المدعوم: 10 = Majora's Mask 3D فقط)`);
  const name = cstr(data, 16);
  // This header field is a COUNT IN 2-BYTE UNITS, not a byte length -- confirmed
  // against noclip.website's own reader (`idxDataCount * 2` when slicing the
  // index buffer), and against the real file: without the *2, the sliced
  // faceIndices buffer comes up short by exactly half for this file (1468
  // vs the real 2936 bytes), silently truncating away every shape whose
  // face-index range starts past that point (majoramask_00 and beyond).
  // This was the actual root cause of a real 3DS crashing on an earlier,
  // full-reserialization version of this patch: the rebuilt file's
  // faceIndices chunk was missing its back half entirely.
  const faceIndicesCount = view.getUint32(32, true) * 2;
  const sklOffset = view.getUint32(36, true);
  const qtrsOffset = view.getUint32(40, true);
  const matsOffset = view.getUint32(44, true);
  const texOffset = view.getUint32(48, true);
  const sklmOffset = view.getUint32(52, true);
  const lutsOffset = view.getUint32(56, true);
  const vatrOffset = view.getUint32(60, true);
  const faceIndicesOffset = view.getUint32(64, true);
  const textureDataOffset = view.getUint32(68, true);

  // ---- tex ----
  if (magic4(data, texOffset) !== "tex ") throw new Error("قسم tex غير صحيح");
  const texCount = view.getUint32(texOffset + 8, true);
  const textures: CmbTexture[] = [];
  let dataEndForTex = textureDataOffset; // will grow below to find total texture-data size
  for (let i = 0; i < texCount; i++) {
    const off = texOffset + 12 + i * 36;
    const size = view.getUint32(off, true);
    const width = view.getUint16(off + 8, true);
    const height = view.getUint16(off + 10, true);
    const glFormat = view.getUint32(off + 12, true);
    const dataOff = view.getUint32(off + 16, true);
    const texName = cstr(data, off + 20);
    textures.push({ name: texName, width, height, glFormat, pixels: data.slice(textureDataOffset + dataOff, textureDataOffset + dataOff + size) });
    dataEndForTex = Math.max(dataEndForTex, textureDataOffset + dataOff + size);
  }

  // ---- mats ----
  if (magic4(data, matsOffset) !== "mats") throw new Error("قسم mats غير صحيح");
  const matCount = view.getUint32(matsOffset + 8, true);
  const materialBlockSize = 364; // confirmed: 0x15C + 0x10 for version > Ocarina (MM3D)
  const matsStart = matsOffset + 12;
  const materials: Uint8Array[] = [];
  for (let i = 0; i < matCount; i++) {
    materials.push(data.slice(matsStart + i * materialBlockSize, matsStart + (i + 1) * materialBlockSize));
  }
  // combiners fill the rest of the mats chunk (size given by the chunk's own chunkSize)
  const matsChunkSize = view.getUint32(matsOffset + 4, true);
  const combinersStart = matsStart + matCount * materialBlockSize;
  const combinersBytes = data.slice(combinersStart, matsOffset + matsChunkSize);

  // ---- sklm: mshs + shp ----
  if (magic4(data, sklmOffset) !== "sklm") throw new Error("قسم sklm غير صحيح");
  const mshOffsetRel = view.getUint32(sklmOffset + 8, true);
  const shpOffsetRel = view.getUint32(sklmOffset + 12, true);
  const mshsAbs = sklmOffset + mshOffsetRel;
  if (magic4(data, mshsAbs) !== "mshs") throw new Error("قسم mshs غير صحيح");
  const meshCount = view.getUint32(mshsAbs + 8, true);
  const opaqueMeshCount = view.getUint16(mshsAbs + 12, true);
  const idCount = view.getUint16(mshsAbs + 14, true);
  const meshEntryStride = 12; // MM3D: 2(sepdIdx)+1(matsIdx)+1(id)+8(unknown)
  const meshes: CmbMesh[] = [];
  for (let i = 0; i < meshCount; i++) {
    const off = mshsAbs + 16 + i * meshEntryStride;
    const sepdIdx = view.getUint16(off, true);
    const matsIdx = view.getUint8(off + 2);
    const tailBytes = data.slice(off + 3, off + meshEntryStride);
    meshes.push({ sepdIdx, matsIdx, tailBytes });
  }

  const shpAbs = sklmOffset + shpOffsetRel;
  if (magic4(data, shpAbs) !== "shp ") throw new Error("قسم shp غير صحيح");
  const shapeCount = view.getUint32(shpAbs + 8, true);
  const shapeOffsets: number[] = [];
  for (let i = 0; i < shapeCount; i++) shapeOffsets.push(view.getUint16(shpAbs + 16 + i * 2, true));
  const sepds = shapeOffsets.map((rel) => parseSepd(data, shpAbs + rel));

  // ---- vatr ----
  if (magic4(data, vatrOffset) !== "vatr") throw new Error("قسم vatr غير صحيح");
  const maxIndex = view.getUint32(vatrOffset + 8, true);
  const attribs = {} as CmbModel["vatr"]["attribs"];
  let idx = vatrOffset + 12;
  for (const name of VATTR_NAMES) {
    const size = view.getUint32(idx, true);
    const offs = view.getUint32(idx + 4, true);
    attribs[name] = data.slice(vatrOffset + offs, vatrOffset + offs + size);
    idx += 8;
  }

  const faceIndices = data.slice(faceIndicesOffset, faceIndicesOffset + faceIndicesCount);
  const textureDataBytes = data.slice(textureDataOffset, dataEndForTex);

  return {
    raw: data,
    version,
    name,
    header: { sklOffset, qtrsOffset, matsOffset, texOffset, sklmOffset, lutsOffset, vatrOffset, faceIndicesOffset, textureDataOffset },
    faceIndicesCount,
    textures,
    materialBlockSize,
    materials,
    combinersBytes,
    meshes,
    meshesHeaderExtra: { opaqueMeshCount, idCount },
    meshEntryStride,
    sepds,
    vatr: { maxIndex, attribs },
    faceIndices,
    textureDataBytes,
  };
}

const align4 = (n: number) => (n + 3) & ~3;

/** Appends 4 bytes of padding accounting done by the caller; this just
 * pads a byte array up to a 4-byte boundary with zeros. */
function pad4(bytes: Uint8Array): Uint8Array {
  const padded = new Uint8Array(align4(bytes.length));
  padded.set(bytes);
  return padded;
}

export interface QuadBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  z: number;
}

/**
 * The core transformation: removes every mesh whose material is
 * `lettersMaterialIndex` (Majora's Mask 3D: material 4, used by title_00,
 * shared across the 5 real-geometry letter shapes), and every mesh using
 * `effectMaterialIndex` if given (the flat shine-overlay quad, material 5
 * — dropped too since it animates a sweep across the now-gone letters and
 * would otherwise flash across empty space), then adds one new flat quad
 * (cloned from `templateShapeIndex`, Majora's Mask 3D: shape 0, the
 * already-flat "© Nintendo" plane) covering `bounds`, textured with
 * `logoRgba` (RGBA8, `logoWidth`×`logoHeight`, multiples of 8).
 */
export function replaceLogoWithFlatQuad(
  data: Uint8Array,
  opts: {
    lettersMaterialIndex: number;
    effectMaterialIndex?: number;
    templateShapeIndex: number;
    bounds: QuadBounds;
    logoRgba: Uint8ClampedArray | Uint8Array;
    logoWidth: number;
    logoHeight: number;
    newTextureName: string;
  }
): Uint8Array {
  const cmb = parseCmb(data);
  const dropMaterials = new Set([opts.lettersMaterialIndex, ...(opts.effectMaterialIndex !== undefined ? [opts.effectMaterialIndex] : [])]);
  const keptMeshes = cmb.meshes.filter((m) => !dropMaterials.has(m.matsIdx));
  const droppedShapeIndices = new Set(cmb.meshes.filter((m) => dropMaterials.has(m.matsIdx)).map((m) => m.sepdIdx));

  // ---- new texture ----
  const encodedPixels = encodeRgba8Tiled(opts.logoWidth, opts.logoHeight, opts.logoRgba);
  const newTexIndex = cmb.textures.length;
  const newTexture: CmbTexture = {
    name: opts.newTextureName,
    width: opts.logoWidth,
    height: opts.logoHeight,
    glFormat: GL_FORMAT_RGBA8,
    pixels: encodedPixels,
  };
  const textures = [...cmb.textures, newTexture];

  // ---- new material: clone the template shape's material, retarget texMapper[0] ----
  const templateMesh = cmb.meshes.find((m) => m.sepdIdx === opts.templateShapeIndex);
  if (!templateMesh) throw new Error(`لا يوجد Mesh يستخدم الشكل النموذج رقم ${opts.templateShapeIndex}`);
  const newMaterial = cmb.materials[templateMesh.matsIdx].slice();
  new DataView(newMaterial.buffer).setInt16(16, newTexIndex, true); // texMapper[0].textureId @ material+16
  const newMaterialIndex = cmb.materials.length;
  const materials = [...cmb.materials, newMaterial];

  // ---- new shape: clone the template Sepd, append new position/uv0 data ----
  const template = cmb.sepds[opts.templateShapeIndex];
  const { minX, maxX, minY, maxY, z } = opts.bounds;
  // Same winding as the template (0,1,2,2,1,3): 0=(max,min) 1=(max,max) 2=(min,min) 3=(min,max)
  const newPositions: [number, number, number][] = [
    [maxX, minY, z],
    [maxX, maxY, z],
    [minX, minY, z],
    [minX, maxY, z],
  ];
  const posAttrib = template.attribs.position;
  const posBytesPerVert = 12; // float32 x3
  const posBuf = cmb.vatr.attribs.position;
  const newPosStart = posBuf.length;
  const appendedPos = new Uint8Array(newPositions.length * posBytesPerVert);
  {
    const v = new DataView(appendedPos.buffer);
    newPositions.forEach(([x, y, zz], i) => {
      v.setFloat32(i * 12 + 0, x, true);
      v.setFloat32(i * 12 + 4, y, true);
      v.setFloat32(i * 12 + 8, zz, true);
    });
  }
  const newPositionBuf = new Uint8Array(posBuf.length + appendedPos.length);
  newPositionBuf.set(posBuf);
  newPositionBuf.set(appendedPos, posBuf.length);

  // UV0: reuse the template's exact scale (it's already tuned for
  // DataType.Short normalization) and corner layout, just fresh bytes.
  const uv0Attrib = template.attribs.uv0;
  const uv0Buf = cmb.vatr.attribs.uv0;
  const newUv0Start = uv0Buf.length;
  const SHORT_MAX = 32767;
  const cornersUv: [number, number][] = [
    [1, 0],
    [1, 1],
    [0, 0],
    [0, 1],
  ];
  const appendedUv0 = new Uint8Array(cornersUv.length * 4);
  {
    const v = new DataView(appendedUv0.buffer);
    cornersUv.forEach(([u, vv], i) => {
      v.setInt16(i * 4 + 0, Math.round(u * SHORT_MAX), true);
      v.setInt16(i * 4 + 2, Math.round(vv * SHORT_MAX), true);
    });
  }
  const newUv0Buf = new Uint8Array(uv0Buf.length + appendedUv0.length);
  newUv0Buf.set(uv0Buf);
  newUv0Buf.set(appendedUv0, uv0Buf.length);

  const newSepd: Sepd = {
    flags: template.flags,
    center: [(minX + maxX) / 2, (minY + maxY) / 2, z],
    posOffset: template.posOffset,
    attribs: {
      ...template.attribs,
      position: { ...posAttrib, start: newPosStart },
      uv0: { ...uv0Attrib, start: newUv0Start },
    },
    boneDim: template.boneDim,
    constantFlags: template.constantFlags,
    prmsBytes: template.prmsBytes.slice(),
  };

  const keptShapeIndices = cmb.sepds.map((_, i) => i).filter((i) => !droppedShapeIndices.has(i) || i === opts.templateShapeIndex);
  // template shape itself is kept (its own mesh, if not in a dropped
  // material, stays referencing it unchanged) plus every shape not dropped;
  // the new shape is appended after all of them.
  const shapeRemap = new Map<number, number>();
  keptShapeIndices.forEach((oldIdx, newIdx) => shapeRemap.set(oldIdx, newIdx));
  const newShapeIndex = keptShapeIndices.length;
  shapeRemap.set(-1, newShapeIndex); // sentinel for "the new shape"

  const sepds = [...keptShapeIndices.map((i) => cmb.sepds[i]), newSepd];

  const meshes: CmbMesh[] = [
    ...keptMeshes.map((m) => ({ ...m, sepdIdx: shapeRemap.get(m.sepdIdx)! })),
    { sepdIdx: newShapeIndex, matsIdx: newMaterialIndex, tailBytes: templateMesh.tailBytes.slice() },
  ];

  return buildCmb(cmb, {
    textures,
    materials,
    meshes,
    sepds,
    vatrOverrides: { position: newPositionBuf, uv0: newUv0Buf },
  });
}

function buildCmb(
  cmb: CmbModel,
  edits: {
    textures: CmbTexture[];
    materials: Uint8Array[];
    meshes: CmbMesh[];
    sepds: Sepd[];
    vatrOverrides: Partial<Record<(typeof VATTR_NAMES)[number], Uint8Array>>;
  }
): Uint8Array {
  const data = cmb.raw;

  // ---- skl + qtrs: copied verbatim (this module never touches them) ----
  const sklBytes = (() => {
    const { size } = readChunkMagicSize(data, cmb.header.sklOffset);
    return data.slice(cmb.header.sklOffset, cmb.header.sklOffset + size);
  })();
  const qtrsBytes = (() => {
    const { size } = readChunkMagicSize(data, cmb.header.qtrsOffset);
    return data.slice(cmb.header.qtrsOffset, cmb.header.qtrsOffset + size);
  })();
  const lutsBytes = (() => {
    const { size } = readChunkMagicSize(data, cmb.header.lutsOffset);
    return data.slice(cmb.header.lutsOffset, cmb.header.lutsOffset + size);
  })();

  // ---- tex ----
  const texEntryBytes: Uint8Array[] = [];
  let texDataCursor = 0;
  const texDataChunks: Uint8Array[] = [];
  for (const t of edits.textures) {
    const entry = new Uint8Array(36);
    const v = new DataView(entry.buffer);
    v.setUint32(0, t.pixels.length, true);
    v.setUint16(4, 1, true); // maxLevel (no mipmaps generated by this module)
    v.setUint8(6, 0); // isEtc1
    v.setUint8(7, 0); // isCubemap
    v.setUint16(8, t.width, true);
    v.setUint16(10, t.height, true);
    v.setUint32(12, t.glFormat, true);
    v.setUint32(16, texDataCursor, true);
    entry.set(new TextEncoder().encode(t.name.slice(0, 15)), 20);
    texEntryBytes.push(entry);
    texDataChunks.push(t.pixels);
    texDataCursor += t.pixels.length; // no alignment gap: matches how dataOffs are read back-to-back for this file
  }
  const texBody = new Uint8Array(4 + texEntryBytes.reduce((s, e) => s + e.length, 0));
  new DataView(texBody.buffer).setUint32(0, edits.textures.length, true);
  { let o = 4; for (const e of texEntryBytes) { texBody.set(e, o); o += e.length; } }
  const texChunk = new Uint8Array(8 + texBody.length);
  texChunk.set(new TextEncoder().encode("tex "), 0);
  new DataView(texChunk.buffer).setUint32(4, texChunk.length, true);
  texChunk.set(texBody, 8);

  const textureDataBytes = new Uint8Array(texDataChunks.reduce((s, c) => s + c.length, 0));
  { let o = 0; for (const c of texDataChunks) { textureDataBytes.set(c, o); o += c.length; } }

  // ---- mats ----
  const matsBody = new Uint8Array(4 + edits.materials.reduce((s, m) => s + m.length, 0) + cmb.combinersBytes.length);
  new DataView(matsBody.buffer).setUint32(0, edits.materials.length, true);
  { let o = 4; for (const m of edits.materials) { matsBody.set(m, o); o += m.length; } matsBody.set(cmb.combinersBytes, o); }
  const matsChunk = new Uint8Array(8 + matsBody.length);
  matsChunk.set(new TextEncoder().encode("mats"), 0);
  new DataView(matsChunk.buffer).setUint32(4, matsChunk.length, true);
  matsChunk.set(matsBody, 8);

  // ---- shp (sepds) ----
  const sepdBytesList = edits.sepds.map(buildSepd);
  const shpHeaderSize = 16 + edits.sepds.length * 2;
  const shapesArrayStart = align4(shpHeaderSize);
  let shpTotal = shapesArrayStart;
  const sepdRelOffsets: number[] = [];
  for (const sb of sepdBytesList) {
    sepdRelOffsets.push(shpTotal);
    shpTotal += sb.length; // sepd chunks are tightly packed (matches source file: no gaps between shapeOffsets)
  }
  const shpChunk = new Uint8Array(shpTotal);
  shpChunk.set(new TextEncoder().encode("shp "), 0);
  new DataView(shpChunk.buffer).setUint32(4, shpTotal, true);
  new DataView(shpChunk.buffer).setUint32(8, edits.sepds.length, true);
  new DataView(shpChunk.buffer).setUint32(12, 0, true); // flags (unused by every shape seen this session)
  sepdRelOffsets.forEach((rel, i) => new DataView(shpChunk.buffer).setUint16(16 + i * 2, rel, true));
  sepdRelOffsets.forEach((rel, i) => shpChunk.set(sepdBytesList[i], rel));

  // ---- mshs ----
  const mshsHeaderSize = 16;
  const mshsTotal = mshsHeaderSize + edits.meshes.length * cmb.meshEntryStride;
  const mshsChunk = new Uint8Array(mshsTotal);
  mshsChunk.set(new TextEncoder().encode("mshs"), 0);
  const mv = new DataView(mshsChunk.buffer);
  mv.setUint32(4, mshsTotal, true);
  mv.setUint32(8, edits.meshes.length, true);
  mv.setUint16(12, cmb.meshesHeaderExtra.opaqueMeshCount, true);
  mv.setUint16(14, cmb.meshesHeaderExtra.idCount, true);
  edits.meshes.forEach((m, i) => {
    const off = 16 + i * cmb.meshEntryStride;
    mv.setUint16(off, m.sepdIdx, true);
    mv.setUint8(off + 2, m.matsIdx);
    mshsChunk.set(m.tailBytes, off + 3);
  });

  // ---- sklm wraps mshs + shp ----
  const sklmHeaderSize = 16;
  const mshsRel = sklmHeaderSize;
  const shpRel = align4(mshsRel + mshsChunk.length);
  const sklmTotal = shpRel + shpChunk.length;
  const sklmChunk = new Uint8Array(sklmTotal);
  sklmChunk.set(new TextEncoder().encode("sklm"), 0);
  const sv = new DataView(sklmChunk.buffer);
  sv.setUint32(4, sklmTotal, true);
  sv.setUint32(8, mshsRel, true);
  sv.setUint32(12, shpRel, true);
  sklmChunk.set(mshsChunk, mshsRel);
  sklmChunk.set(shpChunk, shpRel);

  // ---- vatr ----
  const attribBytes = VATTR_NAMES.map((name) => edits.vatrOverrides[name] ?? cmb.vatr.attribs[name]);
  const vatrHeaderSize = 12 + VATTR_NAMES.length * 8;
  let cursor = align4(vatrHeaderSize);
  const attribStarts: number[] = [];
  for (const b of attribBytes) {
    attribStarts.push(cursor);
    cursor += b.length;
  }
  const vatrTotal = cursor;
  const vatrChunk = new Uint8Array(vatrTotal);
  vatrChunk.set(new TextEncoder().encode("vatr"), 0);
  const vv = new DataView(vatrChunk.buffer);
  vv.setUint32(4, vatrTotal, true);
  vv.setUint32(8, cmb.vatr.maxIndex, true);
  VATTR_NAMES.forEach((_, i) => {
    vv.setUint32(12 + i * 8, attribBytes[i].length, true);
    vv.setUint32(12 + i * 8 + 4, attribStarts[i], true);
  });
  attribBytes.forEach((b, i) => vatrChunk.set(b, attribStarts[i]));

  // ---- assemble whole file ----
  const chunks = [
    { bytes: pad4(sklBytes) },
    { bytes: pad4(qtrsBytes) },
    { bytes: pad4(matsChunk) },
    { bytes: pad4(texChunk) },
    { bytes: pad4(sklmChunk) },
    { bytes: pad4(lutsBytes) },
    { bytes: pad4(vatrChunk) },
    { bytes: pad4(cmb.faceIndices) },
    { bytes: pad4(textureDataBytes) },
  ];
  const HEADER = 76;
  let cursor2 = HEADER;
  const offsets: number[] = [];
  for (const c of chunks) {
    offsets.push(cursor2);
    cursor2 += c.bytes.length;
  }
  const total = cursor2;

  const out = new Uint8Array(total);
  const ov = new DataView(out.buffer);
  out.set(new TextEncoder().encode("cmb "), 0);
  ov.setUint32(4, total, true);
  ov.setUint32(8, cmb.version, true);
  ov.setUint32(12, 0, true);
  out.set(new TextEncoder().encode(cmb.name.slice(0, 16)), 16);
  ov.setUint32(32, cmb.faceIndices.length / 2, true); // this header field is a count in 2-byte units, not a byte length
  ov.setUint32(36, offsets[0], true); // skl
  ov.setUint32(40, offsets[1], true); // qtrs
  ov.setUint32(44, offsets[2], true); // mats
  ov.setUint32(48, offsets[3], true); // tex
  ov.setUint32(52, offsets[4], true); // sklm
  ov.setUint32(56, offsets[5], true); // luts
  ov.setUint32(60, offsets[6], true); // vatr
  ov.setUint32(64, offsets[7], true); // faceIndices
  ov.setUint32(68, offsets[8], true); // textureData
  ov.setUint32(72, 0, true); // unk0
  chunks.forEach((c, i) => out.set(c.bytes, offsets[i]));

  return out;
}

/**
 * A real 3DS console crashed on a file produced by `replaceLogoWithFlatQuad`
 * (data abort / translation-section fault, i.e. a read from completely
 * unmapped memory — the signature of a wrong offset/count somewhere in the
 * newly-added texture/material/mesh/shape and their freshly recalculated
 * chunk sizes). This function takes the opposite strategy: it never adds,
 * removes, or resizes ANYTHING — every chunk offset, count, and byte length
 * in the file stays byte-identical to the original. It only overwrites
 * values that already live inside existing, already-valid allocations:
 *
 *  - the 4 unused letter shapes + the effect shape: every index in their
 *    already-allocated slice of the shared face-index buffer is overwritten
 *    with 0, making every one of their triangles degenerate (2+ vertices
 *    coincide) so nothing renders — no vertex data touched at all;
 *  - one surviving letter shape (chosen small: 32 triangles / 96 indices,
 *    which divides evenly by 6): its own index slice is overwritten to
 *    repeat the flat-quad pattern (0,1,2,2,1,3), and only its first 4
 *    (already-allocated) vertices get new position/UV values — the rest of
 *    its original vertex budget is simply left unreferenced;
 *  - one existing texture (by default `title_00`): its pixel bytes are
 *    overwritten in place with the new logo, re-encoded to RGBA4444 —
 *    same 2-bytes-per-pixel width as the original RGB565, so its declared
 *    size doesn't change either; only the 4-byte glFormat field in its
 *    (fixed-size) tex-chunk entry is patched, still no chunk resize.
 *    RGBA4444 was picked over keeping RGB565 specifically to get a real
 *    (if coarse, 4-bit) alpha channel: an earlier RGB565 version of this
 *    patch rendered as an opaque rectangle, occluding a separate 3D mask
 *    icon mesh that used to show through the gaps between the original
 *    carved letters. Confirmed against a real texture already in this
 *    same file (`title_sub_00`, which the game's own pipeline stores as
 *    RGBA4444) that this format is valid for this file/GPU.
 *
 * Every count/offset in the file stays byte-identical to the input except
 * the specific bytes this function targets — eliminating the whole class
 * of offset/count bugs a full reserialization would need to get exactly
 * right on a device that has zero tolerance for a wrong one (this is why
 * this function exists: an earlier version of this patch that added a new
 * texture/material/mesh/shape crashed a real 3DS with a data abort).
 */
export interface InPlaceLogoPatchOptions {
  /** shape index to keep and reshape into the new flat quad (must have an
   * index count divisible by 6, and must use `textureIndex`'s material) */
  survivingShapeIndex: number;
  /** shape indices to blank out entirely (the other letters + effect) */
  removedShapeIndices: number[];
  bounds: QuadBounds;
  /** straight top-to-bottom RGBA (e.g. straight out of a canvas), alpha
   * preserved end to end into the RGBA4444 texture this produces */
  logoRgba: Uint8ClampedArray | Uint8Array;
  /** index into the tex chunk of the existing 2-bytes-per-pixel (RGB565 or
   * RGBA4444) texture to overwrite in place, converting it to RGBA4444
   * (must exactly match logoRgba's dimensions) */
  textureIndex: number;
  /** other texture indices to blank out entirely (every pixel byte -> 0),
   * e.g. a separate subtitle texture that would otherwise show redundant
   * or now-stale text. Zero bytes means fully-transparent-black regardless
   * of the texture's format (alpha lives in the low bits of every format
   * this file uses), so this is safe without knowing the exact format. */
  blankTextureIndices?: number[];
  /** material indices whose alpha test should be switched on (GL_GREATER,
   * reference 0 -> discard only fully-transparent pixels). Every material
   * in this file ships with alpha testing *disabled* — confirmed byte for
   * byte — because the original design relied on real 3D geometry gaps for
   * "letters visible, background see-through", never texture alpha. With
   * alpha testing off, the GPU draws every pixel's raw RGB regardless of
   * its alpha, so a transparent texture background still renders as a
   * solid (here: black) rectangle instead of a hole — confirmed both by a
   * from-scratch WebGL re-render of this exact data and by a real 3DS
   * photo showing a mask-icon mesh that should peek through fully hidden
   * behind an opaque rectangle. Pass every material index this patch's
   * texture changes rely on showing real transparency for. */
  alphaTestMaterialIndices?: number[];
}

export function patchLogoInPlace(data: Uint8Array, opts: InPlaceLogoPatchOptions): Uint8Array {
  const out = data.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  if (magic4(out, 0) !== "cmb ") throw new Error('ليس ملف CMB (لا يبدأ بـ "cmb ")');
  const version = view.getUint32(8, true);
  if (version !== 10) throw new Error(`إصدار CMB غير مدعوم هنا: ${version} (المدعوم: 10 = Majora's Mask 3D فقط)`);
  const matsOffset = view.getUint32(44, true);
  const texOffset = view.getUint32(48, true);
  const sklmOffset = view.getUint32(52, true);
  const vatrOffset = view.getUint32(60, true);
  const faceIndicesOffset = view.getUint32(64, true);
  const textureDataOffset = view.getUint32(68, true);

  const shpOffsetRel = view.getUint32(sklmOffset + 12, true);
  const shpAbs = sklmOffset + shpOffsetRel;

  function sepdAbsOf(shapeIdx: number): number {
    const rel = view.getUint16(shpAbs + 16 + shapeIdx * 2, true);
    return shpAbs + rel;
  }

  function prmLocation(shapeIdx: number): { indexType: number; count: number; absOffset: number } {
    const sepdAbs = sepdAbsOf(shapeIdx);
    const vattrStart = sepdAbs + 36;
    const afterVattr = vattrStart + VATTR_NAMES.length * VATTR_SIZE;
    const primOffsetAbs = afterVattr + 4;
    const primOff = view.getInt16(primOffsetAbs, true);
    const prmsAbs = sepdAbs + primOff;
    const boneTableCount = view.getUint16(prmsAbs + 14, true);
    let prmAbs = prmsAbs + 24 + boneTableCount * 2;
    prmAbs = (prmAbs + 3) & ~3;
    const indexType = view.getInt16(prmAbs + 0x10, true);
    const count = view.getUint16(prmAbs + 0x14, true);
    const relOffset = view.getUint16(prmAbs + 0x16, true) * 2;
    return { indexType, count, absOffset: faceIndicesOffset + relOffset };
  }

  function vatrAttribBase(attrIndex: number): number {
    const entryOff = vatrOffset + 12 + attrIndex * 8;
    const offs = view.getUint32(entryOff + 4, true);
    return vatrOffset + offs;
  }

  function vertexDataAbsOffsets(shapeIdx: number): { posAbs: number; uv0Abs: number; uv0ScaleAbs: number } {
    const sepdAbs = sepdAbsOf(shapeIdx);
    const vattrStart = sepdAbs + 36;
    const posLocalStart = view.getUint32(vattrStart + 0 * VATTR_SIZE, true);
    const uv0LocalStart = view.getUint32(vattrStart + 4 * VATTR_SIZE, true);
    return {
      posAbs: vatrAttribBase(0) + posLocalStart,
      uv0Abs: vatrAttribBase(4) + uv0LocalStart,
      uv0ScaleAbs: vattrStart + 4 * VATTR_SIZE + 4, // VertexAttrib.scale is 4 bytes into its 28-byte struct
    };
  }

  // ---- 1) blank out the removed shapes: every index -> 0 (degenerate triangles) ----
  for (const shapeIdx of opts.removedShapeIndices) {
    const { indexType, count, absOffset } = prmLocation(shapeIdx);
    const bytesPerIdx = indexType === 0x1401 ? 1 : 2;
    out.fill(0, absOffset, absOffset + count * bytesPerIdx);
  }

  // ---- 2) reshape the surviving shape into a flat quad ----
  const { indexType, count, absOffset } = prmLocation(opts.survivingShapeIndex);
  if (count % 6 !== 0) {
    throw new Error(`عدد فهارس الشكل رقم ${opts.survivingShapeIndex} (${count}) ليس من مضاعفات ٦`);
  }
  const bytesPerIdx = indexType === 0x1401 ? 1 : 2;
  const pattern = [0, 1, 2, 2, 1, 3];
  for (let i = 0; i < count; i++) {
    const v = pattern[i % 6];
    if (bytesPerIdx === 1) out[absOffset + i] = v;
    else view.setUint16(absOffset + i * 2, v, true);
  }

  const { posAbs, uv0Abs, uv0ScaleAbs } = vertexDataAbsOffsets(opts.survivingShapeIndex);
  const { minX, maxX, minY, maxY, z } = opts.bounds;
  const corners: [number, number, number][] = [
    [maxX, minY, z],
    [maxX, maxY, z],
    [minX, minY, z],
    [minX, maxY, z],
  ];
  corners.forEach(([x, y, zz], i) => {
    view.setFloat32(posAbs + i * 12 + 0, x, true);
    view.setFloat32(posAbs + i * 12 + 4, y, true);
    view.setFloat32(posAbs + i * 12 + 8, zz, true);
  });
  const cornersUv: [number, number][] = [
    [1, 0],
    [1, 1],
    [0, 0],
    [0, 1],
  ];
  const SHORT_MAX = 32767;
  // The GPU decodes a Short UV as raw*scale, NOT raw/32767 -- the surviving
  // shape's own inherited scale (calibrated for its original letter's UV
  // range) can be any value, so it must be overwritten to match the raw
  // values written below, or the texture samples from the wrong sub-range
  // (caught by cross-checking against a from-scratch renderer this session:
  // the inherited scale was ~0.0000269, capping u/v at ~0.88 instead of 1.0).
  view.setFloat32(uv0ScaleAbs, 1 / SHORT_MAX, true);
  cornersUv.forEach(([u, v], i) => {
    view.setInt16(uv0Abs + i * 4 + 0, Math.round(u * SHORT_MAX), true);
    view.setInt16(uv0Abs + i * 4 + 2, Math.round(v * SHORT_MAX), true);
  });

  // ---- 3) overwrite the existing texture's pixels in place, converting to RGBA4444 ----
  const texEntryOff = texOffset + 12 + opts.textureIndex * 36;
  const texSize = view.getUint32(texEntryOff + 0, true);
  const texWidth = view.getUint16(texEntryOff + 8, true);
  const texHeight = view.getUint16(texEntryOff + 10, true);
  const texGlFormat = view.getUint32(texEntryOff + 12, true);
  const texDataOff = view.getUint32(texEntryOff + 16, true);
  if (texGlFormat !== GL_FORMAT_RGB565 && texGlFormat !== GL_FORMAT_RGBA4444) {
    throw new Error(`النسيج رقم ${opts.textureIndex} ليس بصيغة RGB565 أو RGBA4444 — هذه الدالة تحتاج صيغة أصلية بعرض بايتين لكل بكسل`);
  }
  const encoded = encodeRgba4444Tiled(texWidth, texHeight, opts.logoRgba);
  if (encoded.length !== texSize) {
    throw new Error(`حجم النسيج بعد الترميز (${encoded.length}) لا يطابق حجم النسيج الأصلي (${texSize}) — الأبعاد يجب أن تطابق ${texWidth}×${texHeight} تماماً`);
  }
  view.setUint32(texEntryOff + 12, GL_FORMAT_RGBA4444, true);
  out.set(encoded, textureDataOffset + texDataOff);

  // ---- 4) blank out any other requested textures (e.g. a redundant subtitle) ----
  for (const blankIdx of opts.blankTextureIndices ?? []) {
    const entryOff = texOffset + 12 + blankIdx * 36;
    const size = view.getUint32(entryOff + 0, true);
    const dataOff = view.getUint32(entryOff + 16, true);
    out.fill(0, textureDataOffset + dataOff, textureDataOffset + dataOff + size);
  }

  // ---- 5) enable real alpha-test cutout for the materials that need it ----
  const MATERIAL_BLOCK_SIZE = 364; // confirmed for MM3D (version > Ocarina): 0x15C + 0x10
  const ALPHA_TEST_GREATER = 0x0204; // GL_GREATER
  for (const matIdx of opts.alphaTestMaterialIndices ?? []) {
    const matAbs = matsOffset + 12 + matIdx * MATERIAL_BLOCK_SIZE;
    view.setUint8(matAbs + 0x130, 1); // alphaTestEnabled
    view.setUint8(matAbs + 0x131, 0); // alphaTestReference (already 0 in every material; kept explicit)
    view.setUint16(matAbs + 0x132, ALPHA_TEST_GREATER, true); // alphaTestFunction
  }

  return out;
}
