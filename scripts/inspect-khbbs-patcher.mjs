import fs from "node:fs";
import { inflateRawSync } from "node:zlib";

const zipPath = "/home/ubuntu/upload/BBSFMEnglishPatch1.0.12.zip";
const targetName = "BBS FM English Patch 1.0.12/BBS Patcher.exe";
const zip = fs.readFileSync(zipPath);

function findEndOfCentralDirectory(bytes) {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("لم تُعثر نهاية فهرس ZIP.");
}

function readZipEntry(bytes, name) {
  const eocd = findEndOfCentralDirectory(bytes);
  const count = bytes.readUInt16LE(eocd + 10);
  let cursor = bytes.readUInt32LE(eocd + 16);
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("فهرس ZIP غير صالح.");
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const fileNameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const entryName = bytes.subarray(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");
    if (entryName === name) {
      if (bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("مدخل ZIP محلي غير صالح.");
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`أسلوب ضغط ZIP غير مدعوم: ${method}`);
    }
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  throw new Error("ملف BBS Patcher.exe غير موجود داخل الأرشيف.");
}

function asHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(" ");
}

const exe = readZipEntry(zip, targetName);
const peOffset = exe.readUInt32LE(0x3c);
if (exe.subarray(peOffset, peOffset + 4).toString("ascii") !== "PE\0\0") throw new Error("ليس ملف PE صالحاً.");
const sectionCount = exe.readUInt16LE(peOffset + 6);
const optionalOffset = peOffset + 24;
const optionalMagic = exe.readUInt16LE(optionalOffset);
const imageBase = optionalMagic === 0x20b ? Number(exe.readBigUInt64LE(optionalOffset + 24)) : exe.readUInt32LE(optionalOffset + 28);
const optionalSize = exe.readUInt16LE(peOffset + 20);
const sectionOffset = optionalOffset + optionalSize;
const sections = [];
for (let index = 0; index < sectionCount; index += 1) {
  const offset = sectionOffset + index * 40;
  sections.push({
    name: exe.subarray(offset, offset + 8).toString("ascii").replace(/\0+$/, ""),
    virtualAddress: exe.readUInt32LE(offset + 12),
    rawSize: exe.readUInt32LE(offset + 16),
    rawOffset: exe.readUInt32LE(offset + 20),
  });
}

function rvaFromOffset(offset) {
  const section = sections.find((candidate) => offset >= candidate.rawOffset && offset < candidate.rawOffset + candidate.rawSize);
  return section ? section.virtualAddress + offset - section.rawOffset : null;
}

function allOffsets(haystack, needle) {
  const offsets = [];
  for (let start = 0; start < haystack.length;) {
    const found = haystack.indexOf(needle, start);
    if (found < 0) break;
    offsets.push(found);
    start = found + 1;
  }
  return offsets;
}

function pointerReferences(address) {
  const needle = Buffer.alloc(4);
  needle.writeUInt32LE(address >>> 0);
  return allOffsets(exe, needle).filter((offset) => sections.some((section) => section.name === ".text" && offset >= section.rawOffset && offset < section.rawOffset + section.rawSize));
}

console.log(`PE image base: 0x${imageBase.toString(16).toUpperCase()}`);
console.log("Sections:", sections.map((section) => `${section.name}@0x${section.rawOffset.toString(16)}+0x${section.rawSize.toString(16)}`).join(" | "));
for (const text of ["Inserting font...", "FIX/Font.arc", "Adding fixes...", "Inserting CTD...", "Gathering LBA information..."]) {
  const occurrences = allOffsets(exe, Buffer.from(text, "ascii"));
  console.log(`\n${JSON.stringify(text)} offsets:`, occurrences.map((offset) => `0x${offset.toString(16)}`).join(", ") || "none");
  for (const offset of occurrences) {
    const rva = rvaFromOffset(offset);
    const virtualAddress = rva === null ? null : imageBase + rva;
    console.log(`  RVA: ${rva === null ? "outside sections" : `0x${rva.toString(16)}`}, VA: ${virtualAddress === null ? "n/a" : `0x${virtualAddress.toString(16)}`}`);
    if (virtualAddress !== null) {
      const references = pointerReferences(virtualAddress);
      console.log("  .text raw references:", references.map((reference) => `0x${reference.toString(16)} [${asHex(exe.subarray(Math.max(0, reference - 12), reference + 16))}]`).join(" | ") || "none");
    }
  }
}
