/**
 * Danganronpa file rebuilder
 * 
 * Stores the original archive tree structure during extraction,
 * then rebuilds files with translated text in the same format.
 */

import { parsePo, buildPo } from "./danganronpa-po-parser";
import { buildLin } from "./danganronpa-lin-parser";

/**
 * A node in the archive tree. Leaf nodes have `textEntries`.
 * Container nodes have `children`.
 */
export interface ArchiveNode {
  name: string;
  /** The format this node was parsed as */
  format: "pak0" | "pak-offset-size" | "pak-offset" | "pak-type2" | "lin0" | "po" | "utf16le" | "classic-lin" | "raw";
  /** Original raw buffer for this node (needed for rebuild) */
  originalBuffer: ArrayBuffer;
  /** Children if this is a container */
  children?: ArchiveNode[];
  /** Text entry keys if this is a leaf with translatable text */
  entryKeys?: string[];
}

/**
 * Check if a node (or its descendants) has any translations.
 */
export function nodeHasTranslations(
  node: ArchiveNode,
  translations: Map<string, string>,
): boolean {
  if (node.entryKeys) {
    return node.entryKeys.some(k => translations.has(k));
  }
  if (node.children) {
    return node.children.some(c => nodeHasTranslations(c, translations));
  }
  return false;
}

/**
 * Rebuild a complete archive tree with translations applied.
 * Returns the rebuilt binary buffer.
 */
export function rebuildArchive(
  node: ArchiveNode,
  translations: Map<string, string>,
): ArrayBuffer {
  switch (node.format) {
    case "po":
      return rebuildPo(node, translations);
    case "utf16le":
      return rebuildUtf16le(node, translations);
    case "pak0":
      return rebuildPak0(node, translations);
    case "pak-offset-size":
      return rebuildPakOffsetSize(node, translations);
    case "pak-offset":
      return rebuildPakOffset(node, translations);
    case "pak-type2":
      return rebuildPakType2(node, translations);
    case "lin0":
      return rebuildLin0(node, translations);
    case "classic-lin":
      return rebuildClassicLin(node, translations);
    case "raw":
    default:
      // If raw node has children (from brute-force scan), rebuild them
      if (node.children) {
        return rebuildRawWithChildren(node, translations);
      }
      return node.originalBuffer;
  }
}

function rebuildPo(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  const entries = parsePo(node.originalBuffer);
  
  if (node.entryKeys) {
    for (let i = 0; i < entries.length && i < node.entryKeys.length; i++) {
      const key = node.entryKeys[i];
      const translation = translations.get(key);
      if (translation) {
        entries[i].translation = translation;
      }
    }
  }
  
  return buildPo(entries, node.originalBuffer);
}

function rebuildUtf16le(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  if (!node.entryKeys?.length) return node.originalBuffer;
  
  const key = node.entryKeys[0];
  const translation = translations.get(key);
  if (!translation) return node.originalBuffer;
  
  // Rebuild as UTF-16LE with BOM
  const bom = new Uint8Array([0xFF, 0xFE]);
  const encoded = new Uint8Array(translation.length * 2 + 2); // +2 for null terminator
  const view = new DataView(encoded.buffer);
  for (let i = 0; i < translation.length; i++) {
    view.setUint16(i * 2, translation.charCodeAt(i), true);
  }
  
  const result = new Uint8Array(bom.length + encoded.length);
  result.set(bom, 0);
  result.set(encoded, bom.length);
  return result.buffer as ArrayBuffer;
}

/**
 * PAK0 format: magic(4) + fileCount(4) + table(fileCount * 8) + data
 * Children are stored in order matching the original file table.
 */
function rebuildPak0(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  if (!node.children) return node.originalBuffer;
  
  const origView = new DataView(node.originalBuffer);
  const fileCount = origView.getUint32(4, true);
  const tableStart = 8;
  const headerSize = tableStart + fileCount * 8;
  
  // Build child buffers in order — children[i] corresponds to original slot i
  const slotBuffers: ArrayBuffer[] = [];
  for (let i = 0; i < fileCount; i++) {
    if (i < node.children.length) {
      slotBuffers.push(rebuildArchive(node.children[i], translations));
    } else {
      // Fallback: use original data for slots beyond children count
      const origOffset = origView.getUint32(tableStart + i * 8, true);
      const origSize = origView.getUint32(tableStart + i * 8 + 4, true);
      slotBuffers.push(origSize > 0 ? node.originalBuffer.slice(origOffset, origOffset + origSize) : new ArrayBuffer(0));
    }
  }
  
  let dataSize = 0;
  for (const b of slotBuffers) dataSize += b.byteLength;
  
  const totalSize = headerSize + dataSize;
  const out = new Uint8Array(totalSize);
  const outView = new DataView(out.buffer);
  
  // Write magic PAK0
  out[0] = 0x50; out[1] = 0x41; out[2] = 0x4B; out[3] = 0x30;
  outView.setUint32(4, fileCount, true);
  
  let dataPos = headerSize;
  for (let i = 0; i < fileCount; i++) {
    const buf = slotBuffers[i];
    const size = buf.byteLength;
    outView.setUint32(tableStart + i * 8, size > 0 ? dataPos : 0, true);
    outView.setUint32(tableStart + i * 8 + 4, size, true);
    if (size > 0) {
      out.set(new Uint8Array(buf), dataPos);
      dataPos += size;
    }
  }
  
  return out.buffer as ArrayBuffer;
}

function rebuildPakOffsetSize(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  if (!node.children) return node.originalBuffer;
  
  const origView = new DataView(node.originalBuffer);
  const fileCount = origView.getUint32(0, true);
  
  const slotBuffers: ArrayBuffer[] = [];
  for (let i = 0; i < fileCount; i++) {
    if (i < node.children.length) {
      slotBuffers.push(rebuildArchive(node.children[i], translations));
    } else {
      const origOffset = origView.getUint32(4 + i * 8, true);
      const origSize = origView.getUint32(4 + i * 8 + 4, true);
      slotBuffers.push(node.originalBuffer.slice(origOffset, origOffset + origSize));
    }
  }
  
  const headerSize = 4 + fileCount * 8;
  let dataSize = 0;
  for (const b of slotBuffers) dataSize += b.byteLength;
  
  const out = new Uint8Array(headerSize + dataSize);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, fileCount, true);
  
  let dataPos = headerSize;
  for (let i = 0; i < fileCount; i++) {
    const buf = slotBuffers[i];
    outView.setUint32(4 + i * 8, dataPos, true);
    outView.setUint32(4 + i * 8 + 4, buf.byteLength, true);
    out.set(new Uint8Array(buf), dataPos);
    dataPos += buf.byteLength;
  }
  
  return out.buffer as ArrayBuffer;
}

function rebuildPakOffset(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  if (!node.children) return node.originalBuffer;
  
  const origView = new DataView(node.originalBuffer);
  const fileCount = origView.getUint32(0, true);
  
  const origOffsets: number[] = [];
  for (let i = 0; i < fileCount; i++) {
    origOffsets.push(origView.getUint32(4 + i * 4, true));
  }
  
  const slotBuffers: ArrayBuffer[] = [];
  for (let i = 0; i < fileCount; i++) {
    if (i < node.children.length) {
      slotBuffers.push(rebuildArchive(node.children[i], translations));
    } else {
      const start = origOffsets[i];
      const end = i + 1 < fileCount ? origOffsets[i + 1] : node.originalBuffer.byteLength;
      slotBuffers.push(node.originalBuffer.slice(start, end));
    }
  }
  
  const headerSize = 4 + fileCount * 4;
  let dataSize = 0;
  for (const b of slotBuffers) dataSize += b.byteLength;
  
  const out = new Uint8Array(headerSize + dataSize);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, fileCount, true);
  
  let dataPos = headerSize;
  for (let i = 0; i < fileCount; i++) {
    outView.setUint32(4 + i * 4, dataPos, true);
    const buf = slotBuffers[i];
    out.set(new Uint8Array(buf), dataPos);
    dataPos += buf.byteLength;
  }
  
  return out.buffer as ArrayBuffer;
}

function rebuildPakType2(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  if (!node.children) return node.originalBuffer;
  
  const origView = new DataView(node.originalBuffer);
  const fileCount = origView.getUint32(0, true);
  
  // Re-parse original to get names and data
  const origBytes = new Uint8Array(node.originalBuffer);
  const origNames: string[] = [];
  const origData: ArrayBuffer[] = [];
  let pos = 4;
  for (let i = 0; i < fileCount; i++) {
    const fileSize = origView.getUint32(pos, true);
    pos += 4;
    pos += 2; // padding
    let name = "";
    while (pos + 1 < origBytes.length) {
      const ch = origView.getUint16(pos, true);
      pos += 2;
      if (ch === 0) break;
      name += String.fromCharCode(ch);
    }
    origNames.push(name);
    origData.push(node.originalBuffer.slice(pos, pos + fileSize));
    pos += fileSize;
  }
  
  // Rebuild children by sequential index
  const parts: Uint8Array[] = [];
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, fileCount, true);
  parts.push(header);
  
  for (let i = 0; i < fileCount; i++) {
    const data = i < node.children.length
      ? rebuildArchive(node.children[i], translations)
      : origData[i];
    const name = origNames[i];
    
    const sizeBytes = new Uint8Array(4);
    new DataView(sizeBytes.buffer).setUint32(0, data.byteLength, true);
    parts.push(sizeBytes);
    
    parts.push(new Uint8Array(2)); // padding
    
    const nameBytes = new Uint8Array((name.length + 1) * 2);
    const nameView = new DataView(nameBytes.buffer);
    for (let j = 0; j < name.length; j++) {
      nameView.setUint16(j * 2, name.charCodeAt(j), true);
    }
    parts.push(nameBytes);
    parts.push(new Uint8Array(data));
  }
  
  const totalSize = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(totalSize);
  let writePos = 0;
  for (const p of parts) {
    out.set(p, writePos);
    writePos += p.length;
  }
  
  return out.buffer as ArrayBuffer;
}

function rebuildLin0(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  if (!node.children) return node.originalBuffer;
  
  const origView = new DataView(node.originalBuffer);
  const fileCount = origView.getUint32(4, true);
  const origBytes = new Uint8Array(node.originalBuffer);
  
  // Re-parse to get names and original data
  const origNames: string[] = [];
  const origDatas: ArrayBuffer[] = [];
  let pos = 8;
  for (let i = 0; i < fileCount; i++) {
    const nameLen = origView.getUint32(pos, true);
    pos += 4;
    const nameBytes = origBytes.slice(pos, pos + nameLen);
    const name = new TextDecoder("utf-8", { fatal: false }).decode(nameBytes).replace(/\0+$/, "");
    pos += nameLen;
    const dataLen = origView.getUint32(pos, true);
    pos += 4;
    origDatas.push(node.originalBuffer.slice(pos, pos + dataLen));
    pos += dataLen;
    origNames.push(name);
  }
  
  // Rebuild children — match by name first, then by index
  const childByName = new Map<string, ArchiveNode>();
  if (node.children) {
    for (const child of node.children) {
      childByName.set(child.name, child);
    }
  }
  
  const parts: Uint8Array[] = [];
  const header = new Uint8Array(8);
  header[0] = 0x4C; header[1] = 0x49; header[2] = 0x4E; header[3] = 0x30;
  new DataView(header.buffer).setUint32(4, fileCount, true);
  parts.push(header);
  
  for (let i = 0; i < fileCount; i++) {
    const name = origNames[i];
    // Try to find the child by name, fallback to index
    const child = childByName.get(name) || (node.children && i < node.children.length ? node.children[i] : null);
    const data = child ? rebuildArchive(child, translations) : origDatas[i];
    
    const nameEncoded = new TextEncoder().encode(name + "\0");
    const nameLenBytes = new Uint8Array(4);
    new DataView(nameLenBytes.buffer).setUint32(0, nameEncoded.length, true);
    parts.push(nameLenBytes);
    parts.push(nameEncoded);
    
    const dataLenBytes = new Uint8Array(4);
    new DataView(dataLenBytes.buffer).setUint32(0, data.byteLength, true);
    parts.push(dataLenBytes);
    parts.push(new Uint8Array(data));
  }
  
  const totalSize = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(totalSize);
  let writePos = 0;
  for (const p of parts) {
    out.set(p, writePos);
    writePos += p.length;
  }
  
  return out.buffer as ArrayBuffer;
}

function rebuildClassicLin(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  if (!node.entryKeys?.length) return node.originalBuffer;
  
  const newStrings: string[] = [];
  for (const key of node.entryKeys) {
    const translation = translations.get(key);
    newStrings.push(translation || "");
  }
  
  return buildLin(node.originalBuffer, newStrings);
}

/**
 * For "raw" nodes that have children found via brute-force scanning,
 * we rebuild by replacing the child regions in the original buffer.
 */
function rebuildRawWithChildren(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  if (!node.children?.length) return node.originalBuffer;
  
  // The children were found at specific offsets (encoded in name as `name@offset`)
  // We need to splice rebuilt children back into the original buffer
  const origBytes = new Uint8Array(node.originalBuffer);
  const patches: { offset: number; original: ArrayBuffer; rebuilt: ArrayBuffer }[] = [];
  
  for (const child of node.children) {
    const offsetMatch = child.name.match(/@(\d+)$/);
    if (offsetMatch) {
      const offset = parseInt(offsetMatch[1]);
      const originalSize = child.originalBuffer.byteLength;
      const rebuilt = rebuildArchive(child, translations);
      patches.push({ offset, original: child.originalBuffer, rebuilt });
    }
  }
  
  if (patches.length === 0) return node.originalBuffer;
  
  // Sort patches by offset
  patches.sort((a, b) => a.offset - b.offset);
  
  // Build output by splicing
  const parts: Uint8Array[] = [];
  let lastEnd = 0;
  for (const patch of patches) {
    if (patch.offset > lastEnd) {
      parts.push(origBytes.slice(lastEnd, patch.offset));
    }
    parts.push(new Uint8Array(patch.rebuilt));
    lastEnd = patch.offset + patch.original.byteLength;
  }
  if (lastEnd < origBytes.length) {
    parts.push(origBytes.slice(lastEnd));
  }
  
  const totalSize = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  
  return out.buffer as ArrayBuffer;
}
