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

const TEXT_OPCODE = 0x02;

/**
 * Try header-based parsing (standard DR1/DR2 PC format)
 */
function tryHeaderParse(buffer: ArrayBuffer, isDr2: boolean): LinFile | null {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 16) return null;

  const type = view.getUint32(0, true);
  if (type !== 1 && type !== 2) return null;
  if (type === 2) return { type, strings: [], isDr2 };

  const textBlockOffset = view.getUint32(8, true);
  const stringCount = view.getUint32(12, true);

  if (stringCount === 0 || textBlockOffset >= bytes.length) return null;
  // Sanity: string count shouldn't be absurdly large
  if (stringCount > 100000) return null;

  const offsetsStart = textBlockOffset;
  const stringsDataStart = offsetsStart + stringCount * 4;
  if (stringsDataStart > bytes.length) return null;

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

  // If we got valid strings, return them
  if (strings.some(s => s.trim().length > 0)) {
    return { type, strings, isDr2 };
  }
  return null;
}

/**
 * Fallback: opcode-based scanning for Switch/Unity LIN format.
 * Scans for TEXT_OPCODE (0x02) followed by null-terminated UTF-8 strings.
 */
function tryOpcodeParse(buffer: ArrayBuffer, isDr2: boolean): LinFile | null {
  const bytes = new Uint8Array(buffer);
  const strings: string[] = [];

  let pos = 0;
  while (pos < bytes.length) {
    if (bytes[pos] === TEXT_OPCODE) {
      const stringStart = pos + 1;
      let stringEnd = stringStart;

      while (stringEnd < bytes.length && bytes[stringEnd] !== 0x00) {
        stringEnd++;
      }

      if (stringEnd > stringStart && stringEnd < bytes.length) {
        const textBytes = bytes.slice(stringStart, stringEnd);
        try {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(textBytes);
          // Only accept if it looks like readable text (has printable chars)
          if (text.trim().length > 0 && /[\x20-\x7E\u0080-\uFFFF]/.test(text)) {
            strings.push(text);
          }
        } catch {
          // Not valid UTF-8, skip
        }
        pos = stringEnd + 1;
      } else {
        pos++;
      }
    } else {
      pos++;
    }
  }

  if (strings.length > 0) {
    return { type: 1, strings, isDr2 };
  }
  return null;
}

export function parseLin(buffer: ArrayBuffer, isDr2 = false): LinFile {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8) {
    throw new Error("ملف LIN قصير جداً");
  }

  // Try standard header-based parsing first
  const headerResult = tryHeaderParse(buffer, isDr2);
  if (headerResult && headerResult.strings.length > 0) {
    return headerResult;
  }

  // Fallback: opcode scanning (Switch/Unity format)
  const opcodeResult = tryOpcodeParse(buffer, isDr2);
  if (opcodeResult) {
    return opcodeResult;
  }

  // Return empty if nothing found
  const type = new DataView(buffer).getUint32(0, true);
  return { type: (type === 1 || type === 2) ? type : 1, strings: [], isDr2 };
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
