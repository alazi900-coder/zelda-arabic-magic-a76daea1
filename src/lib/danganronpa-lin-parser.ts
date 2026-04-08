/**
 * Danganronpa 1/2 LIN script file parser
 * 
 * LIN files contain scripted dialogue and commands.
 * Format:
 *   u32 type (1 = has text block, 2 = no text)
 *   u32 header_size
 *   If type == 1:
 *     u32 text_block_offset
 *     u32 string_count
 *   Script opcodes from header_size to text_block_offset
 *   Text block: u32[] string_offsets (relative to after offsets table)
 *               followed by null-terminated UTF-16LE strings
 */

export interface LinFile {
  type: number;
  strings: string[];
  isDr2: boolean;
}

export function parseLin(buffer: ArrayBuffer, isDr2 = false): LinFile {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 8) {
    throw new Error("ملف LIN قصير جداً");
  }

  const type = view.getUint32(0, true);
  const headerSize = view.getUint32(4, true);

  if (type !== 1 && type !== 2) {
    throw new Error(`نوع LIN غير معروف: ${type}`);
  }

  // Type 2 = no text block
  if (type === 2 || bytes.length < 16) {
    return { type, strings: [], isDr2 };
  }

  const textBlockOffset = view.getUint32(8, true);
  const stringCount = view.getUint32(12, true);

  if (stringCount === 0 || textBlockOffset >= bytes.length) {
    return { type, strings: [], isDr2 };
  }

  // Read string offsets table
  const offsetsStart = textBlockOffset;
  const stringsDataStart = offsetsStart + stringCount * 4;
  const strings: string[] = [];

  for (let i = 0; i < stringCount; i++) {
    const offsetPos = offsetsStart + i * 4;
    if (offsetPos + 4 > bytes.length) break;

    const stringRelOffset = view.getUint32(offsetPos, true);
    const stringAbsPos = stringsDataStart + stringRelOffset;

    if (stringAbsPos >= bytes.length) {
      strings.push("");
      continue;
    }

    // Read null-terminated UTF-16LE string
    let str = "";
    let pos = stringAbsPos;
    while (pos + 1 < bytes.length) {
      const charCode = view.getUint16(pos, true);
      if (charCode === 0) break;
      str += String.fromCharCode(charCode);
      pos += 2;
    }
    strings.push(str);
  }

  return { type, strings, isDr2 };
}

export function buildLin(
  originalBuffer: ArrayBuffer,
  newStrings: string[],
  isDr2 = false,
): ArrayBuffer {
  const origView = new DataView(originalBuffer);
  const origBytes = new Uint8Array(originalBuffer);

  const type = origView.getUint32(0, true);
  if (type !== 1) return originalBuffer;

  const textBlockOffset = origView.getUint32(8, true);
  const stringCount = origView.getUint32(12, true);

  // Keep all script data before text block unchanged
  const scriptData = origBytes.slice(0, textBlockOffset);

  // Build new string table
  const stringOffsets: number[] = [];
  const stringDataParts: Uint8Array[] = [];
  let currentOffset = 0;

  const count = Math.min(stringCount, newStrings.length);
  for (let i = 0; i < count; i++) {
    stringOffsets.push(currentOffset);
    const str = newStrings[i] || "";
    // Encode as UTF-16LE + null terminator
    const encoded = new Uint8Array((str.length + 1) * 2);
    const encView = new DataView(encoded.buffer);
    for (let j = 0; j < str.length; j++) {
      encView.setUint16(j * 2, str.charCodeAt(j), true);
    }
    // null terminator already 0
    stringDataParts.push(encoded);
    currentOffset += encoded.length;
  }

  // If original had more strings than we're replacing, keep the rest
  if (count < stringCount) {
    const origOffsetsStart = textBlockOffset;
    const origStringsDataStart = origOffsetsStart + stringCount * 4;
    for (let i = count; i < stringCount; i++) {
      const relOff = origView.getUint32(origOffsetsStart + i * 4, true);
      const absPos = origStringsDataStart + relOff;
      // Find end of string
      let end = absPos;
      while (end + 1 < origBytes.length) {
        const c = origView.getUint16(end, true);
        if (c === 0) { end += 2; break; }
        end += 2;
      }
      stringOffsets.push(currentOffset);
      const strBytes = origBytes.slice(absPos, end);
      stringDataParts.push(strBytes);
      currentOffset += strBytes.length;
    }
  }

  // Assemble output
  const offsetsTableSize = stringCount * 4;
  const totalStringData = stringDataParts.reduce((s, p) => s + p.length, 0);
  const totalSize = scriptData.length + offsetsTableSize + totalStringData;

  const out = new Uint8Array(totalSize);
  const outView = new DataView(out.buffer);

  // Copy script data
  out.set(scriptData, 0);

  // Update string count in header
  outView.setUint32(12, stringCount, true);

  // Write string offsets
  for (let i = 0; i < stringCount; i++) {
    outView.setUint32(textBlockOffset + i * 4, stringOffsets[i], true);
  }

  // Write string data
  let writePos = textBlockOffset + offsetsTableSize;
  for (const part of stringDataParts) {
    out.set(part, writePos);
    writePos += part.length;
  }

  return out.buffer as ArrayBuffer;
}
