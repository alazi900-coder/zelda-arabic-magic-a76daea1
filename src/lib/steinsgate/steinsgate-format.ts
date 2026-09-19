import type { ExtractedEntry } from "@/components/editor/types";
import { processArabicText } from "@/lib/arabic-processing";
import { validateSteinsGateTags, STEINSGATE_TAG_RE, isSteinsGateTranslatable } from "./steinsgate-tags";

const SECTOR = 2048;
const DATA0_PATH = "/PSP_GAME/USRDIR/DATA0.AFS";
const SCENE_ARCHIVE_INDEX = 5;
const FONT_ARCHIVE_INDEX = 2;
const SCRIPT_PREFIX = "steinsgate/";
const SHIFT_JIS_DECODER = new TextDecoder("shift-jis");

const readU16 = (view: DataView, offset: number) => view.getUint16(offset, true);
const readU32 = (view: DataView, offset: number) => view.getUint32(offset, true);
const writeU32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value, true);
const align = (value: number, boundary = SECTOR) => Math.ceil(value / boundary) * boundary;

export interface AfsEntry {
  name: string;
  offset: number;
  size: number;
  reserved: number;
}

export interface ParsedAfs {
  entries: AfsEntry[];
  nameTableOffset: number;
  nameTableSize: number;
}

export interface SteinsGateStringRecord {
  file: string;
  index: number;
  offset: number;
  pointerOffsets: number[];
  pointerBits: 16 | 32;
  raw: number[];
}

export interface SteinsGateWorkspace {
  version: 1;
  sourceName: string;
  sourceSize: number;
  data0Offset: number;
  data0Size: number;
  data0Prefix: ArrayBuffer;
  sceneOffset: number;
  sceneSize: number;
  sceneArchive: ArrayBuffer;
  fontOffset: number;
  fontSize: number;
  fontArchive: ArrayBuffer;
  records: SteinsGateStringRecord[];
  glyphMap: Record<string, number[]>;
}

export interface SteinsGateImportResult {
  entries: ExtractedEntry[];
  workspace: SteinsGateWorkspace;
  scriptFiles: number;
}

export const STEINSGATE_WORKSPACE_KEY = "steinsgate:workspace";
export const STEINSGATE_SOURCE_GAME = "steinsgate";

function readIsoDirectoryRecord(bytes: Uint8Array, offset: number) {
  const length = bytes[offset] ?? 0;
  if (length < 34 || offset + length > bytes.length) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLength = bytes[offset + 32] ?? 0;
  const rawName = new TextDecoder("ascii").decode(bytes.subarray(offset + 33, offset + 33 + nameLength));
  return {
    length,
    extent: readU32(view, offset + 2),
    size: readU32(view, offset + 10),
    directory: Boolean((bytes[offset + 25] ?? 0) & 2),
    name: rawName.replace(/;\d+$/, ""),
  };
}

async function findIsoFile(file: File, wantedPath: string): Promise<{ offset: number; size: number }> {
  const descriptor = new Uint8Array(await file.slice(16 * SECTOR, 17 * SECTOR).arrayBuffer());
  if (new TextDecoder("ascii").decode(descriptor.subarray(1, 6)) !== "CD001") {
    const magic = new TextDecoder("ascii").decode(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
    if (magic.startsWith("MComprHD")) throw new Error("الملف CHD مضغوط. حوّله إلى ISO أولاً ثم ارفعه؛ البناء يحتاج ISO غير مضغوط.");
    throw new Error("الملف ليس ISO 9660 صالحاً للعبة PSP.");
  }
  const root = readIsoDirectoryRecord(descriptor, 156);
  if (!root) throw new Error("تعذر قراءة مجلد ISO الجذري.");
  let current = { extent: root.extent, size: root.size };
  for (const part of wantedPath.split("/").filter(Boolean)) {
    const dir = new Uint8Array(await file.slice(current.extent * SECTOR, current.extent * SECTOR + current.size).arrayBuffer());
    let cursor = 0;
    let found: ReturnType<typeof readIsoDirectoryRecord> = null;
    while (cursor < dir.length) {
      const length = dir[cursor] ?? 0;
      if (length === 0) { cursor = align(cursor + 1); continue; }
      const record = readIsoDirectoryRecord(dir, cursor);
      if (!record) break;
      if (record.name.toUpperCase() === part.toUpperCase()) { found = record; break; }
      cursor += record.length;
    }
    if (!found) throw new Error(`لم يُعثر على ${wantedPath} داخل ISO. تأكد أن النسخة Steins;Gate PSP (ULJM05887).`);
    current = { extent: found.extent, size: found.size };
  }
  return { offset: current.extent * SECTOR, size: current.size };
}

export function parseAfs(buffer: ArrayBuffer | Uint8Array): ParsedAfs {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "AFS\0") throw new Error("أرشيف AFS غير صالح.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = readU32(view, 4);
  if (count < 1 || count > 20_000 || 8 + count * 8 + 8 > bytes.length) throw new Error("جدول AFS تالف.");
  const nameTableOffset = readU32(view, 8 + count * 8);
  const nameTableSize = readU32(view, 12 + count * 8);
  const entries: AfsEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = readU32(view, 8 + index * 8);
    const size = readU32(view, 12 + index * 8);
    const nextOffset = index + 1 < count ? readU32(view, 16 + index * 8) : nameTableOffset;
    const nameStart = nameTableOffset + index * 48;
    const nameEnd = Math.min(nameStart + 32, bytes.length);
    const nul = bytes.subarray(nameStart, nameEnd).indexOf(0);
    const name = nameStart < bytes.length
      ? new TextDecoder("ascii").decode(bytes.subarray(nameStart, nul >= 0 ? nameStart + nul : nameEnd))
      : `${index}`;
    entries.push({ name, offset, size, reserved: Math.max(size, nextOffset - offset) });
  }
  return { entries, nameTableOffset, nameTableSize };
}

function findSplitAddress(bytes: Uint8Array): number {
  let split = -1;
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    if (bytes[index] === 0x0d && bytes[index + 1] === 0x02) split = index + 2;
  }
  return split;
}

function findPointers(bytes: Uint8Array, end: number, address: number, bits: 16 | 32): number[] {
  const result: number[] = [];
  const width = bits / 8;
  for (let offset = 0; offset + width <= end; offset += 2) {
    let value = bytes[offset] | ((bytes[offset + 1] ?? 0) << 8);
    if (bits === 32) value = (value | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) << 24)) >>> 0;
    if (value === address) result.push(offset);
  }
  return result;
}

export function parseSteinsGateScript(file: string, buffer: Uint8Array): SteinsGateStringRecord[] {
  const split = findSplitAddress(buffer);
  if (split < 0) return [];
  const records: SteinsGateStringRecord[] = [];
  let offset = split;
  let index = 0;
  while (offset < buffer.length) {
    const nul = buffer.indexOf(0, offset);
    if (nul < 0) break;
    const raw = buffer.slice(offset, nul);
    const pointerBits: 16 | 32 = offset < 0x10000 ? 16 : 32;
    const pointerOffsets = findPointers(buffer, split, offset, pointerBits);
    if (pointerOffsets.length > 0) records.push({ file, index, offset, pointerOffsets, pointerBits, raw: Array.from(raw) });
    offset = nul + 1;
    index += 1;
  }
  return records;
}

function decodeSource(raw: readonly number[]): string {
  return SHIFT_JIS_DECODER.decode(Uint8Array.from(raw));
}

function sjisToJisIndex(lead: number, trail: number): number | null {
  if (!(((lead >= 0x81 && lead <= 0x9f) || (lead >= 0xe0 && lead <= 0xef)) &&
    ((trail >= 0x40 && trail <= 0x7e) || (trail >= 0x80 && trail <= 0xfc)))) return null;
  let row = (lead < 0xa0 ? lead - 0x81 : lead - 0xc1) * 2 + 0x21;
  let cell: number;
  if (trail >= 0x9f) { row += 1; cell = trail - 0x7e; }
  else cell = trail - (trail > 0x7f ? 0x20 : 0x1f);
  return (row - 0x21) * 94 + cell - 0x21;
}

function buildGlyphMap(scriptBytes: Uint8Array[], fontArchive: Uint8Array): Record<string, number[]> {
  const parsedFonts = parseAfs(fontArchive);
  const mainFont = parsedFonts.entries.find((entry) => entry.name === "DFKKG5W16.FNT");
  if (!mainFont) throw new Error("لم يُعثر على خط الحوارات داخل FONTS.AFS.");
  const font = fontArchive.subarray(mainFont.offset, mainFont.offset + mainFont.size);
  const fontView = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const mapOffset = readU32(fontView, 16);
  const usedPairs = new Set<string>();
  for (const script of scriptBytes) for (let i = 0; i + 1 < script.length; i += 1) usedPairs.add(`${script[i]}:${script[i + 1]}`);
  const forms: string[] = [];
  for (let cp = 0xfe70; cp <= 0xfefc; cp += 1) if (/\p{Letter}/u.test(String.fromCodePoint(cp))) forms.push(String.fromCodePoint(cp));
  forms.push("،", "؛", "؟");
  const slots: number[][] = [];
  const glyphIds = new Set<number>();
  outer: for (const lead of [...Array.from({ length: 0x1f }, (_, i) => 0x81 + i), ...Array.from({ length: 0x10 }, (_, i) => 0xe0 + i)]) {
    for (let trail = 0x40; trail <= 0xfc; trail += 1) {
      if (trail === 0x7f || usedPairs.has(`${lead}:${trail}`)) continue;
      const jisIndex = sjisToJisIndex(lead, trail);
      if (jisIndex == null || mapOffset + jisIndex * 2 + 2 > font.length) continue;
      const glyphId = readU16(fontView, mapOffset + jisIndex * 2);
      if (glyphId === 0xffff || glyphIds.has(glyphId)) continue;
      glyphIds.add(glyphId); slots.push([lead, trail]);
      if (slots.length === forms.length) break outer;
    }
  }
  if (slots.length !== forms.length) throw new Error("لا توجد خانات خط كافية وآمنة لإضافة العربية.");
  return Object.fromEntries(forms.map((form, index) => [form, slots[index]]));
}

export async function importSteinsGateIso(file: File): Promise<SteinsGateImportResult> {
  const data0 = await findIsoFile(file, DATA0_PATH);
  const prefixSize = Math.min(data0.size, 12 * 1024 * 1024);
  const data0Prefix = await file.slice(data0.offset, data0.offset + prefixSize).arrayBuffer();
  const rootBytes = new Uint8Array(data0Prefix);
  const root = parseAfs(rootBytes);
  const sceneEntry = root.entries[SCENE_ARCHIVE_INDEX];
  const fontEntry = root.entries[FONT_ARCHIVE_INDEX];
  // DATA0.AFS identifies its children through DATA0.ALS instead of the usual
  // 48-byte AFS filename table. Their stable order is CONFIG, FONTS, ICON,
  // OBJSY, SCENE00…; nested archives do carry normal names.
  if (!sceneEntry || !fontEntry) {
    throw new Error("بنية DATA0.AFS لا تطابق Steins;Gate PSP الإنجليزية المدعومة.");
  }
  const sceneArchive = rootBytes.slice(sceneEntry.offset, sceneEntry.offset + sceneEntry.size);
  const fontArchive = rootBytes.slice(fontEntry.offset, fontEntry.offset + fontEntry.size);
  const scene = parseAfs(sceneArchive);
  const records: SteinsGateStringRecord[] = [];
  const scriptBytes: Uint8Array[] = [];
  for (const entry of scene.entries) {
    if (!/\.BIN$/i.test(entry.name)) continue;
    const bytes = sceneArchive.slice(entry.offset, entry.offset + entry.size);
    scriptBytes.push(bytes);
    records.push(...parseSteinsGateScript(entry.name, bytes));
  }
  const glyphMap = buildGlyphMap(scriptBytes, fontArchive);
  const entries: ExtractedEntry[] = records.filter(record => isSteinsGateTranslatable(record.file, decodeSource(record.raw))).map((record) => {
    const original = decodeSource(record.raw);
    return {
      msbtFile: `${SCRIPT_PREFIX}${record.file}`,
      index: record.index,
      label: `${record.file} · 0x${record.offset.toString(16).padStart(6, "0")}`,
      original,
      maxBytes: 0,
    };
  });
  return {
    entries,
    scriptFiles: scriptBytes.length,
    workspace: {
      version: 1,
      sourceName: file.name,
      sourceSize: file.size,
      data0Offset: data0.offset,
      data0Size: data0.size,
      data0Prefix,
      sceneOffset: sceneEntry.offset,
      sceneSize: sceneEntry.size,
      sceneArchive: sceneArchive.buffer.slice(sceneArchive.byteOffset, sceneArchive.byteOffset + sceneArchive.byteLength),
      fontOffset: fontEntry.offset,
      fontSize: fontEntry.size,
      fontArchive: fontArchive.buffer.slice(fontArchive.byteOffset, fontArchive.byteOffset + fontArchive.byteLength),
      records,
      glyphMap,
    },
  };
}

function encodeTranslatedText(original: string, translation: string, glyphMap: Record<string, number[]>): Uint8Array {
  const validation = validateSteinsGateTags(original, translation);
  if (!validation.valid) throw new Error(validation.reason ?? "وسوم Steins;Gate غير محفوظة.");
  const pieces = translation.split(STEINSGATE_TAG_RE);
  const tags = translation.match(STEINSGATE_TAG_RE) ?? [];
  let visual = "";
  for (let index = 0; index < pieces.length; index += 1) {
    visual += processArabicText(pieces[index], { mirrorPunct: true });
    if (tags[index]) visual += tags[index];
  }
  const out: number[] = [];
  for (const char of visual) {
    const mapped = glyphMap[char];
    if (mapped) { out.push(...mapped); continue; }
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x20 && code <= 0x7e) { out.push(code); continue; }
    if (char === "【") { out.push(0x81, 0x79); continue; }
    if (char === "】") { out.push(0x81, 0x7a); continue; }
    if (char === "…") { out.push(0x81, 0x63); continue; }
    if (char === "—" || char === "–") { out.push(0x81, 0x5c); continue; }
    if (char === "’" || char === "‘") { out.push(0x27); continue; }
    if (char === "“" || char === "”") { out.push(0x22); continue; }
    throw new Error(`الحرف «${char}» غير مدعوم في خط Steins;Gate PSP.`);
  }
  return Uint8Array.from(out);
}

function rebuildScript(original: Uint8Array, records: SteinsGateStringRecord[], translations: Readonly<Record<string, string>>, glyphMap: Record<string, number[]>): Uint8Array {
  const split = findSplitAddress(original);
  if (split < 0 || records.length === 0) return original.slice();
  const recordByOffset = new Map(records.map((record) => [record.offset, record]));
  const allStrings: { oldOffset: number; raw: Uint8Array; record?: SteinsGateStringRecord }[] = [];
  let cursor = split;
  while (cursor < original.length) {
    const nul = original.indexOf(0, cursor);
    if (nul < 0) break;
    allStrings.push({ oldOffset: cursor, raw: original.slice(cursor, nul), record: recordByOffset.get(cursor) });
    cursor = nul + 1;
  }
  const encoded = allStrings.map(({ raw, record }) => {
    if (!record) return raw;
    const key = `${SCRIPT_PREFIX}${record.file}:${record.index}`;
    const translation = translations[key]?.trim();
    const sourceText = decodeSource(record.raw);
    return translation && translation !== sourceText && isSteinsGateTranslatable(record.file, sourceText)
      ? encodeTranslatedText(sourceText, translation, glyphMap) : raw;
  });
  const size = split + encoded.reduce((sum, value) => sum + value.length + 1, 0);
  const output = new Uint8Array(size);
  output.set(original.subarray(0, split));
  const outputView = new DataView(output.buffer);
  cursor = split;
  for (let index = 0; index < allStrings.length; index += 1) {
    const item = allStrings[index];
    if (item.record) {
      for (const pointerOffset of item.record.pointerOffsets) {
        if (item.record.pointerBits === 16) {
          if (cursor >= 0x10000) throw new Error(`${item.record.file}: تجاوز النص حد مؤشرات 16-bit؛ اختصر بعض الترجمات.`);
          outputView.setUint16(pointerOffset, cursor, true);
        } else outputView.setUint32(pointerOffset, cursor, true);
      }
    }
    output.set(encoded[index], cursor);
    cursor += encoded[index].length + 1;
  }
  return output;
}

export function rebuildAfs(original: ArrayBuffer | Uint8Array, replacements: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const source = original instanceof Uint8Array ? original : new Uint8Array(original);
  const parsed = parseAfs(source);
  const files = parsed.entries.map((entry) => replacements.get(entry.name) ?? source.slice(entry.offset, entry.offset + entry.size));
  const firstDataOffset = Math.min(...parsed.entries.map((entry) => entry.offset));
  const offsets: number[] = [];
  let cursor = firstDataOffset;
  for (const file of files) { offsets.push(cursor); cursor = align(cursor + file.length); }
  const nameTableOffset = align(cursor);
  const nameBytes = source.slice(parsed.nameTableOffset, parsed.nameTableOffset + parsed.nameTableSize);
  const required = nameTableOffset + nameBytes.length;
  if (required > source.length) throw new Error(`أرشيف AFS يحتاج ${(required - source.length).toLocaleString("ar")} بايت إضافي؛ اختصر الترجمات.`);
  const output = new Uint8Array(source.length);
  output.set(source.subarray(0, Math.min(firstDataOffset, source.length)));
  const view = new DataView(output.buffer);
  for (let index = 0; index < files.length; index += 1) {
    writeU32(view, 8 + index * 8, offsets[index]);
    writeU32(view, 12 + index * 8, files[index].length);
    output.set(files[index], offsets[index]);
  }
  writeU32(view, 8 + files.length * 8, nameTableOffset);
  writeU32(view, 12 + files.length * 8, nameBytes.length);
  output.set(nameBytes, nameTableOffset);
  return output;
}

async function injectArabicFont(fontArchiveBuffer: ArrayBuffer, glyphMap: Record<string, number[]>): Promise<Uint8Array> {
  const archive = new Uint8Array(fontArchiveBuffer.slice(0));
  const parsed = parseAfs(archive);
  for (const fontName of ["DFKKG5W16.FNT", "DFKKG3W12.FNT"]) {
    const fntEntry = parsed.entries.find((entry) => entry.name === fontName);
    const fniEntry = parsed.entries.find((entry) => entry.name === fontName.replace(".FNT", ".FNI"));
    if (!fntEntry || !fniEntry) continue;
    const fnt = archive.subarray(fntEntry.offset, fntEntry.offset + fntEntry.size);
    const fni = archive.subarray(fniEntry.offset, fniEntry.offset + fniEntry.size);
    const view = new DataView(fnt.buffer, fnt.byteOffset, fnt.byteLength);
    const mapOffset = readU32(view, 16);
    const dataOffset = readU32(view, 24);
    const cell = readU16(view, 32);
    const canvas = document.createElement("canvas");
    canvas.width = cell; canvas.height = cell;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("المتصفح لا يدعم Canvas اللازم لبناء الخط العربي.");
    context.textBaseline = "alphabetic";
    context.fillStyle = "white";
    context.font = `${Math.max(10, cell - 4)}px Arial, Tahoma, sans-serif`;
    for (const [char, pair] of Object.entries(glyphMap)) {
      const jisIndex = sjisToJisIndex(pair[0], pair[1]);
      if (jisIndex == null) continue;
      const glyphId = readU16(view, mapOffset + jisIndex * 2);
      if (glyphId === 0xffff) continue;
      context.clearRect(0, 0, cell, cell);
      context.fillText(char, 0, cell - 3);
      const pixels = context.getImageData(0, 0, cell, cell).data;
      const glyphOffset = dataOffset + glyphId * cell * cell / 2;
      for (let pixel = 0; pixel < cell * cell; pixel += 2) {
        const high = Math.round(pixels[pixel * 4 + 3] / 17) & 0xf;
        const low = Math.round(pixels[(pixel + 1) * 4 + 3] / 17) & 0xf;
        fnt[glyphOffset + pixel / 2] = (high << 4) | low;
      }
      const width = Math.max(1, Math.min(cell, Math.ceil(context.measureText(char).width)));
      fni[jisIndex * 4] = 0; fni[jisIndex * 4 + 1] = width; fni[jisIndex * 4 + 2] = 0; fni[jisIndex * 4 + 3] = 0;
    }
  }
  return archive;
}

export async function buildSteinsGateIso(
  source: File,
  workspace: SteinsGateWorkspace,
  entries: readonly ExtractedEntry[],
  translations: Readonly<Record<string, string>>,
): Promise<{ blob: Blob; filename: string; translatedLines: number }> {
  if (source.size !== workspace.sourceSize) throw new Error("حجم ISO لا يطابق الملف الذي استُخرجت منه النصوص.");
  const data0 = await findIsoFile(source, DATA0_PATH);
  if (data0.offset !== workspace.data0Offset || data0.size !== workspace.data0Size) throw new Error("بنية ISO لا تطابق جلسة الترجمة الحالية.");
  const sceneSource = new Uint8Array(workspace.sceneArchive);
  const parsedScene = parseAfs(sceneSource);
  const recordsByFile = new Map<string, SteinsGateStringRecord[]>();
  for (const record of workspace.records) recordsByFile.set(record.file, [...(recordsByFile.get(record.file) ?? []), record]);
  const replacements = new Map<string, Uint8Array>();
  for (const afsEntry of parsedScene.entries) {
    const records = recordsByFile.get(afsEntry.name);
    if (!records) continue;
    const original = sceneSource.slice(afsEntry.offset, afsEntry.offset + afsEntry.size);
    replacements.set(afsEntry.name, rebuildScript(original, records, translations, workspace.glyphMap));
  }
  const rebuiltScene = rebuildAfs(sceneSource, replacements);
  const rebuiltFonts = await injectArabicFont(workspace.fontArchive, workspace.glyphMap);
  const patches = [
    { offset: workspace.data0Offset + workspace.fontOffset, bytes: rebuiltFonts },
    { offset: workspace.data0Offset + workspace.sceneOffset, bytes: rebuiltScene },
  ].sort((a, b) => a.offset - b.offset);
  const parts: BlobPart[] = [];
  let cursor = 0;
  for (const patch of patches) {
    parts.push(source.slice(cursor, patch.offset));
    parts.push(patch.bytes as unknown as BlobPart);
    cursor = patch.offset + patch.bytes.length;
  }
  parts.push(source.slice(cursor));
  const translatedLines = entries.filter((entry) => {
    const value = translations[`${entry.msbtFile}:${entry.index}`];
    return Boolean(value?.trim() && value !== entry.original);
  }).length;
  return { blob: new Blob(parts, { type: "application/x-iso9660-image" }), filename: "SteinsGate-Arabic.iso", translatedLines };
}
