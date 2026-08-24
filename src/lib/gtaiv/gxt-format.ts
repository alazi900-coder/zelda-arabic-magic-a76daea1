/** GTA IV GXT/OXT reader — structural inspection only until an Arabic glyph map is verified. */
export interface GtaIvGxtTableSummary {
  name: string;
  offset: number;
  entries: number;
  textBytes: number;
}

export interface GtaIvGxtSummary {
  version: number;
  charSize: number;
  tables: GtaIvGxtTableSummary[];
  entries: number;
  bytes: number;
}

export interface GtaIvOxtSummary {
  version: number;
  charSize: number;
  needDecode: boolean;
  singleFileTable: boolean;
  tables: number;
  entries: number;
}

const ascii = new TextDecoder("ascii");

function fail(message: string): never {
  throw new Error(`ملف GTA IV غير صالح: ${message}`);
}

function u16(view: DataView, offset: number): number {
  if (offset + 2 > view.byteLength) fail("قراءة خارج حدود الملف.");
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  if (offset + 4 > view.byteLength) fail("قراءة خارج حدود الملف.");
  return view.getUint32(offset, true);
}

function marker(bytes: Uint8Array, offset: number, size = 4): string {
  if (offset + size > bytes.length) fail("ترويسة كتلة ناقصة.");
  return ascii.decode(bytes.subarray(offset, offset + size));
}

function tableName(bytes: Uint8Array, offset: number): string {
  return ascii.decode(bytes.subarray(offset, offset + 8)).replace(/\0+$/, "").trim();
}

/**
 * Validates the GXT layout found in GTA IV Version 4 / CharSize 16 files.
 * It intentionally does not decode text units or write bytes: Arabic encoding
 * requires a verified font-specific character map, which is not available yet.
 */
export function inspectGtaIvGxt(buffer: ArrayBuffer): GtaIvGxtSummary {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 12) fail("أقصر من ترويسة GXT.");

  const version = u16(view, 0);
  const charSize = u16(view, 2);
  if (version !== 4) fail(`Version ${version} غير مدعوم؛ المتوقع Version 4.`);
  if (charSize !== 16) fail(`CharSize ${charSize} غير مدعوم؛ المتوقع CharSize 16.`);
  if (marker(bytes, 4) !== "TABL") fail("لا يحمل كتلة TABL في الترويسة.");

  const tablSize = u32(view, 8);
  if (tablSize === 0 || tablSize % 12 !== 0 || 12 + tablSize > bytes.length) {
    fail("حجم جدول TABL غير صحيح.");
  }

  const tables: GtaIvGxtTableSummary[] = [];
  const names = new Set<string>();
  for (let at = 12; at < 12 + tablSize; at += 12) {
    const name = tableName(bytes, at);
    const offset = u32(view, at + 8);
    if (!name) fail("اسم جدول فارغ في TABL.");
    if (names.has(name)) fail(`اسم جدول مكرر: ${name}.`);
    names.add(name);
    if (offset + 8 > bytes.length) fail(`إزاحة جدول ${name} خارج الملف.`);

    const prefix = marker(bytes, offset);
    const tkeyOffset = prefix === "TKEY" ? offset : offset + 8;
    if (marker(bytes, tkeyOffset) !== "TKEY") fail(`كتلة TKEY مفقودة من الجدول ${name}.`);
    const keyBytes = u32(view, tkeyOffset + 4);
    if (keyBytes % 8 !== 0 || tkeyOffset + 8 + keyBytes + 8 > bytes.length) {
      fail(`حجم TKEY غير صحيح في الجدول ${name}.`);
    }
    const tdatOffset = tkeyOffset + 8 + keyBytes;
    if (marker(bytes, tdatOffset) !== "TDAT") fail(`كتلة TDAT مفقودة من الجدول ${name}.`);
    const textBytes = u32(view, tdatOffset + 4);
    if (tdatOffset + 8 + textBytes > bytes.length) fail(`حجم TDAT خارج حدود الملف في ${name}.`);

    for (let keyAt = tkeyOffset + 8; keyAt < tkeyOffset + 8 + keyBytes; keyAt += 8) {
      const textOffset = u32(view, keyAt);
      if (textOffset >= textBytes) fail(`إزاحة نص خارج TDAT في الجدول ${name}.`);
    }
    tables.push({ name, offset, entries: keyBytes / 8, textBytes });
  }

  return {
    version,
    charSize,
    tables,
    entries: tables.reduce((total, table) => total + table.entries, 0),
    bytes: bytes.length,
  };
}

/** Parses the OXT export header and counts tables/entries without changing text values. */
export function inspectGtaIvOxt(text: string): GtaIvOxtSummary {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const version = /^Version\s+(\d+)$/i.exec(lines[0]?.trim() || "");
  const charSize = /^CharSize\s+(\d+)$/i.exec(lines[1]?.trim() || "");
  const needDecode = /^NeedDecode\s+(True|False)$/i.exec(lines[2]?.trim() || "");
  const singleFileTable = /^SingleFileTable\s+(True|False)$/i.exec(lines[3]?.trim() || "");
  if (!version || !charSize || !needDecode || !singleFileTable) {
    fail("ترويسة OXT لا تطابق Version / CharSize / NeedDecode / SingleFileTable.");
  }
  if (Number(version[1]) !== 4 || Number(charSize[1]) !== 16) {
    fail("OXT ليس Version 4 / CharSize 16 الخاص بملف GTA IV المدعوم.");
  }

  let tables = 0;
  let entries = 0;
  let insideTable = false;
  for (const line of lines.slice(4)) {
    if (line === "{") {
      insideTable = true;
      continue;
    }
    if (line === "}") {
      insideTable = false;
      continue;
    }
    if (!line.startsWith("\t") && line.trim() && !line.includes("=")) {
      tables += 1;
      continue;
    }
    if (insideTable && line.startsWith("\t") && line.indexOf("=") > 1) entries += 1;
  }

  return {
    version: Number(version[1]),
    charSize: Number(charSize[1]),
    needDecode: needDecode[1].toLowerCase() === "true",
    singleFileTable: singleFileTable[1].toLowerCase() === "true",
    tables,
    entries,
  };
}
