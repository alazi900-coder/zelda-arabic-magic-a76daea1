/**
 * Danganronpa file rebuilder
 * 
 * Stores the original archive tree structure during extraction,
 * then rebuilds files with translated text in the same format.
 */

import { buildPo } from "./danganronpa-po-parser";

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
      return node.originalBuffer;
  }
}

function rebuildPo(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  // Parse original PO entries, apply translations, rebuild
  const { parsePo } = require("./danganronpa-po-parser");
  const entries = parsePo(node.originalBuffer);
  
  // Map our keys back to PO entries
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
  const text = translation;
  const bom = new Uint8Array([0xFF, 0xFE]);
  const encoded = new Uint8Array(text.length * 2 + 2); // +2 for null terminator
  const view = new DataView(encoded.buffer);
  for (let i = 0; i < text.length; i++) {
    view.setUint16(i * 2, text.charCodeAt(i), true);
  }
  // null terminator is already 0
  
  const result = new Uint8Array(bom.length + encoded.length);
  result.set(bom, 0);
  result.set(encoded, bom.length);
  return result.buffer as ArrayBuffer;
}

function rebuildPak0(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  if (!node.children) return node.originalBuffer;
  
  // Read original header to get the original structure
  const origView = new DataView(node.originalBuffer);
  const fileCount = origView.getUint32(4, true);
  
  // Rebuild each child
  const childBuffers: ArrayBuffer[] = [];
  for (const child of node.children) {
    childBuffers.push(rebuildArchive(child, translations));
  }
  
  // We may have empty slots (size=0 entries that were skipped)
  // Rebuild: PAK0 magic + fileCount + table + data
  const tableStart = 8;
  const headerSize = tableStart + fileCount * 8;
  
  // Map children back to their original indices
  const slotBuffers: (ArrayBuffer | null)[] = new Array(fileCount).fill(null);
  for (let ci = 0; ci < node.children.length; ci++) {
    const child = node.children[ci];
    // Extract original index from the child's name or position
    const idx = child.name.match(/file_(\d+)/)?.[1];
    const slotIndex = idx !== undefined ? parseInt(idx) : ci;
    if (slotIndex < fileCount) {
      slotBuffers[slotIndex] = childBuffers[ci];
    }
  }
  
  // For slots without rebuilt children, use original data
  for (let i = 0; i < fileCount; i++) {
    if (!slotBuffers[i]) {
      const origOffset = origView.getUint32(tableStart + i * 8, true);
      const origSize = origView.getUint32(tableStart + i * 8 + 4, true);
      if (origSize > 0) {
        slotBuffers[i] = node.originalBuffer.slice(origOffset, origOffset + origSize);
      }
    }
  }
  
  // Calculate total size
  let dataSize = 0;
  for (let i = 0; i < fileCount; i++) {
    dataSize += slotBuffers[i]?.byteLength ?? 0;
  }
  
  const totalSize = headerSize + dataSize;
  const out = new Uint8Array(totalSize);
  const outView = new DataView(out.buffer);
  
  // Write header
  out[0] = 0x50; out[1] = 0x41; out[2] = 0x4B; out[3] = 0x30; // PAK0
  outView.setUint32(4, fileCount, true);
  
  // Write table and data
  let dataPos = headerSize;
  for (let i = 0; i < fileCount; i++) {
    const buf = slotBuffers[i];
    const size = buf?.byteLength ?? 0;
    outView.setUint32(tableStart + i * 8, size > 0 ? dataPos : 0, true);
    outView.setUint32(tableStart + i * 8 + 4, size, true);
    if (buf && size > 0) {
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
  
  const childBuffers = node.children.map(c => rebuildArchive(c, translations));
  
  const slotBuffers: (ArrayBuffer | null)[] = new Array(fileCount).fill(null);
  for (let ci = 0; ci < node.children.length; ci++) {
    const idx = node.children[ci].name.match(/file_(\d+)/)?.[1];
    const slotIndex = idx !== undefined ? parseInt(idx) : ci;
    if (slotIndex < fileCount) slotBuffers[slotIndex] = childBuffers[ci];
  }
  
  for (let i = 0; i < fileCount; i++) {
    if (!slotBuffers[i]) {
      const origOffset = origView.getUint32(4 + i * 8, true);
      const origSize = origView.getUint32(4 + i * 8 + 4, true);
      slotBuffers[i] = node.originalBuffer.slice(origOffset, origOffset + origSize);
    }
  }
  
  const headerSize = 4 + fileCount * 8;
  let dataSize = 0;
  for (const b of slotBuffers) dataSize += b?.byteLength ?? 0;
  
  const out = new Uint8Array(headerSize + dataSize);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, fileCount, true);
  
  let dataPos = headerSize;
  for (let i = 0; i < fileCount; i++) {
    const buf = slotBuffers[i];
    const size = buf?.byteLength ?? 0;
    outView.setUint32(4 + i * 8, dataPos, true);
    outView.setUint32(4 + i * 8 + 4, size, true);
    if (buf && size > 0) {
      out.set(new Uint8Array(buf), dataPos);
      dataPos += size;
    }
  }
  
  return out.buffer as ArrayBuffer;
}

function rebuildPakOffset(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  if (!node.children) return node.originalBuffer;
  
  const origView = new DataView(node.originalBuffer);
  const fileCount = origView.getUint32(0, true);
  
  const childBuffers = node.children.map(c => rebuildArchive(c, translations));
  
  const slotBuffers: (ArrayBuffer | null)[] = new Array(fileCount).fill(null);
  for (let ci = 0; ci < node.children.length; ci++) {
    const idx = node.children[ci].name.match(/file_(\d+)/)?.[1];
    const slotIndex = idx !== undefined ? parseInt(idx) : ci;
    if (slotIndex < fileCount) slotBuffers[slotIndex] = childBuffers[ci];
  }
  
  // Fill missing from original
  const origOffsets: number[] = [];
  for (let i = 0; i < fileCount; i++) {
    origOffsets.push(origView.getUint32(4 + i * 4, true));
  }
  for (let i = 0; i < fileCount; i++) {
    if (!slotBuffers[i]) {
      const start = origOffsets[i];
      const end = i + 1 < fileCount ? origOffsets[i + 1] : node.originalBuffer.byteLength;
      slotBuffers[i] = node.originalBuffer.slice(start, end);
    }
  }
  
  const headerSize = 4 + fileCount * 4;
  let dataSize = 0;
  for (const b of slotBuffers) dataSize += b?.byteLength ?? 0;
  
  const out = new Uint8Array(headerSize + dataSize);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, fileCount, true);
  
  let dataPos = headerSize;
  for (let i = 0; i < fileCount; i++) {
    outView.setUint32(4 + i * 4, dataPos, true);
    const buf = slotBuffers[i];
    if (buf) {
      out.set(new Uint8Array(buf), dataPos);
      dataPos += buf.byteLength;
    }
  }
  
  return out.buffer as ArrayBuffer;
}

function rebuildPakType2(node: ArchiveNode, translations: Map<string, string>): ArrayBuffer {
  if (!node.children) return node.originalBuffer;
  
  const origView = new DataView(node.originalBuffer);
  const fileCount = origView.getUint32(0, true);
  
  // For Type2, we need to re-read original names to preserve them
  // Re-parse original to get names
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
  
  // Replace children data
  const childMap = new Map<number, ArrayBuffer>();
  for (let ci = 0; ci < node.children.length; ci++) {
    const idx = node.children[ci].name.match(/file_(\d+)/)?.[1];
    const slotIndex = idx !== undefined ? parseInt(idx) : ci;
    childMap.set(slotIndex, rebuildArchive(node.children[ci], translations));
  }
  
  // Build output
  const parts: Uint8Array[] = [];
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, fileCount, true);
  parts.push(header);
  
  for (let i = 0; i < fileCount; i++) {
    const data = childMap.get(i) || origData[i];
    const name = origNames[i];
    
    // fileSize (u32)
    const sizeBytes = new Uint8Array(4);
    new DataView(sizeBytes.buffer).setUint32(0, data.byteLength, true);
    parts.push(sizeBytes);
    
    // padding (2 bytes)
    parts.push(new Uint8Array(2));
    
    // UTF-16LE name + null terminator
    const nameBytes = new Uint8Array((name.length + 1) * 2);
    const nameView = new DataView(nameBytes.buffer);
    for (let j = 0; j < name.length; j++) {
      nameView.setUint16(j * 2, name.charCodeAt(j), true);
    }
    parts.push(nameBytes);
    
    // data
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
  
  // Re-parse original LIN0 to get names
  const origView = new DataView(node.originalBuffer);
  const fileCount = origView.getUint32(4, true);
  const origBytes = new Uint8Array(node.originalBuffer);
  
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
  
  // Replace children data
  const childMap = new Map<string, ArrayBuffer>();
  for (const child of node.children) {
    childMap.set(child.name, rebuildArchive(child, translations));
  }
  
  // Build output
  const parts: Uint8Array[] = [];
  
  // Magic + fileCount
  const header = new Uint8Array(8);
  header[0] = 0x4C; header[1] = 0x49; header[2] = 0x4E; header[3] = 0x30; // LIN0
  new DataView(header.buffer).setUint32(4, fileCount, true);
  parts.push(header);
  
  for (let i = 0; i < fileCount; i++) {
    const name = origNames[i];
    const data = childMap.get(name) || origDatas[i];
    
    // nameLen (including null terminator)
    const nameEncoded = new TextEncoder().encode(name + "\0");
    const nameLenBytes = new Uint8Array(4);
    new DataView(nameLenBytes.buffer).setUint32(0, nameEncoded.length, true);
    parts.push(nameLenBytes);
    parts.push(nameEncoded);
    
    // dataLen
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
  
  // Collect translated strings in order
  const newStrings: string[] = [];
  for (const key of node.entryKeys) {
    const translation = translations.get(key);
    newStrings.push(translation || "");
  }
  
  // Use the existing buildLin
  const { buildLin } = require("./danganronpa-lin-parser");
  return buildLin(node.originalBuffer, newStrings);
}
