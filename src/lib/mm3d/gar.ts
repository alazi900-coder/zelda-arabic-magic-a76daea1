/**
 * GAR — Grezzo's file-type archive, the container the .gar.lzs holding
 * Majora's Mask 3D's title logo decompresses into. Version 2 confirmed
 * against a real extracted archive this session (5 files: title_logo.cmb
 * plus 4 .cmab animation clips, grouped under "cmb" and "cmab" file types).
 *
 * Layout (all little-endian): a 24-byte header naming three tables —
 * BTAF-like "file types" (each type groups its files, e.g. all .cmb files),
 * per-file metadata (size + name + path strings), and a data-offset table —
 * then the raw file bytes themselves. See
 * https://github.com/MeltyPlayer/MeltyTool/tree/master/FinModelUtility/UniversalAssetTool/UniversalAssetTool/src/platforms/threeDs/tools/gar
 * for the reference this was ported from (only version 2 is implemented;
 * version 5 uses a different, undocumented-here subfile layout).
 */

export interface GarFile {
  typeName: string;
  fileName: string;
  fullPath: string;
  data: Uint8Array;
}

function u16(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8);
}
function i32(view: DataView, at: number): number {
  return view.getInt32(at, true);
}
function cstr(b: Uint8Array, at: number): string {
  let end = at;
  while (b[end] !== 0) end++;
  return new TextDecoder("shift-jis").decode(b.subarray(at, end));
}

export function parseGar(data: Uint8Array): GarFile[] {
  if (data[0] !== 0x47 || data[1] !== 0x41 || data[2] !== 0x52) {
    throw new Error('ليس أرشيف GAR (لا يبدأ بـ "GAR")');
  }
  const version = data[3];
  if (version !== 2) {
    throw new Error(`إصدار GAR غير مدعوم: ${version} (المدعوم حالياً: 2 فقط)`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const fileTypeCount = u16(data, 8);
  const fileTypesOffset = i32(view, 12);
  const fileMetadataOffset = i32(view, 16);
  const dataOffset = i32(view, 20);

  const files: GarFile[] = [];
  for (let t = 0; t < fileTypeCount; t++) {
    const typeOff = fileTypesOffset + 16 * t;
    const fileCount = i32(view, typeOff);
    const fileListOffset = i32(view, typeOff + 4);
    const typeNameOffset = i32(view, typeOff + 8);
    const typeName = cstr(data, typeNameOffset);
    for (let j = 0; j < fileCount; j++) {
      const fileIndex = i32(view, fileListOffset + 4 * j);
      const metaOff = fileMetadataOffset + 12 * fileIndex;
      const fileSize = i32(view, metaOff);
      const fileNameOffset = i32(view, metaOff + 4);
      const fullPathOffset = i32(view, metaOff + 8);
      const fileOffset = i32(view, dataOffset + 4 * fileIndex);
      files.push({
        typeName,
        fileName: cstr(data, fileNameOffset),
        fullPath: cstr(data, fullPathOffset),
        data: data.subarray(fileOffset, fileOffset + Math.max(0, fileSize)),
      });
    }
  }
  return files;
}

/** Rebuilds a version-2 GAR archive from scratch. Files are grouped back
 * into their original type buckets (preserving each bucket's first-seen
 * order), matching the shape `parseGar` reads — a round-trip of an
 * untouched file list reproduces the same grouping, just with fresh
 * offsets (this format has no field that depends on byte-for-byte
 * reproduction, unlike NARC's nitroarc padding convention elsewhere in
 * this project). */
export function buildGar(files: GarFile[]): Uint8Array {
  const typeOrder: string[] = [];
  const byType = new Map<string, GarFile[]>();
  for (const f of files) {
    if (!byType.has(f.typeName)) {
      byType.set(f.typeName, []);
      typeOrder.push(f.typeName);
    }
    byType.get(f.typeName)!.push(f);
  }

  const HEADER = 24;
  const fileTypeCount = typeOrder.length;
  const fileCount = files.length;

  const fileTypesOffset = HEADER;
  const fileTypesSize = 16 * fileTypeCount;

  // one file-list entry (u32 file index) per file, grouped by type, in the
  // same order the type buckets are written
  const fileListOffset = fileTypesOffset + fileTypesSize;
  const fileListSize = 4 * fileCount;

  const fileMetadataOffset = fileListOffset + fileListSize;
  const fileMetadataSize = 12 * fileCount;

  const dataOffsetTableOffset = fileMetadataOffset + fileMetadataSize;
  const dataOffsetTableSize = 4 * fileCount;

  // Strings (type names + file names + full paths) follow, then raw file
  // data, 4-byte aligned throughout.
  const align4 = (n: number) => (n + 3) & ~3;
  const encoder = new TextEncoder();
  let stringsOffset = align4(dataOffsetTableOffset + dataOffsetTableSize);

  const typeNameOffsets = new Map<string, number>();
  const stringChunks: { offset: number; bytes: Uint8Array }[] = [];
  let cursor = stringsOffset;
  function placeString(s: string): number {
    const bytes = encoder.encode(s + "\0");
    const off = cursor;
    stringChunks.push({ offset: off, bytes });
    cursor += bytes.length;
    return off;
  }
  for (const t of typeOrder) typeNameOffsets.set(t, placeString(t));
  const fileNameOffsets: number[] = [];
  const fullPathOffsets: number[] = [];
  for (const f of files) {
    fileNameOffsets.push(placeString(f.fileName));
    fullPathOffsets.push(placeString(f.fullPath));
  }

  const dataStart = align4(cursor);
  const fileDataOffsets: number[] = [];
  let dcursor = dataStart;
  for (const f of files) {
    fileDataOffsets.push(dcursor);
    dcursor = align4(dcursor + f.data.length);
  }
  const total = dcursor;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set([0x47, 0x41, 0x52, 0x02]); // "GAR", version 2
  view.setInt32(4, total, true);
  view.setUint16(8, fileTypeCount, true);
  view.setUint16(10, fileCount, true);
  view.setInt32(12, fileTypesOffset, true);
  view.setInt32(16, fileMetadataOffset, true);
  view.setInt32(20, dataOffsetTableOffset, true);

  // Assign each file a stable global index (0..fileCount-1) matching the
  // order `files` was given, so fileMetadata/dataOffset tables line up
  // directly with that index regardless of type grouping.
  const globalIndexOf = new Map<GarFile, number>();
  files.forEach((f, i) => globalIndexOf.set(f, i));

  let listCursor = fileListOffset;
  let typeCursor = fileTypesOffset;
  for (const t of typeOrder) {
    const bucket = byType.get(t)!;
    view.setInt32(typeCursor, bucket.length, true);
    view.setInt32(typeCursor + 4, listCursor, true);
    view.setInt32(typeCursor + 8, typeNameOffsets.get(t)!, true);
    view.setInt32(typeCursor + 12, 0, true);
    typeCursor += 16;
    for (const f of bucket) {
      view.setUint32(listCursor, globalIndexOf.get(f)!, true);
      listCursor += 4;
    }
  }

  files.forEach((f, i) => {
    const metaOff = fileMetadataOffset + 12 * i;
    view.setInt32(metaOff, f.data.length, true);
    view.setInt32(metaOff + 4, fileNameOffsets[i], true);
    view.setInt32(metaOff + 8, fullPathOffsets[i], true);
    view.setInt32(dataOffsetTableOffset + 4 * i, fileDataOffsets[i], true);
  });

  for (const chunk of stringChunks) out.set(chunk.bytes, chunk.offset);
  files.forEach((f, i) => out.set(f.data, fileDataOffsets[i]));

  return out;
}
