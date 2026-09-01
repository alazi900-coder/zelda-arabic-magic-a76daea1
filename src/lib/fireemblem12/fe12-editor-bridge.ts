/** Fire Emblem 12 integration with the shared translation editor.
 *
 * Design (verified this session with a real emulator): translatable text
 * lives in NitroFS files under `m/`, LZ11-compressed, in the record format
 * `fe12-textfile.ts` reads. Building re-encodes each edited file's text
 * with the shaping/reversal already used for every other game in this
 * project (`reshapeArabic`/`reverseBidi`), maps it through the 124-glyph
 * charmap drawn into unused kanji slots of `fonts/talk`, recompresses with
 * a real LZ11 encoder, and writes each changed file into a ROM copy via
 * `nds-rom-builder.ts` (in place if it still fits, otherwise into the
 * cartridge's unused padding — never past the ROM's own end).
 *
 * A handful of records (gender selection, `NO_FONT_DATA_KEY_SUFFIXES`) are
 * excluded rather than translated — see that constant's comment for why.
 */
import type { ExtractedEntry } from "@/components/editor/types";
import { reshapeArabic, reverseBidi } from "@/lib/arabic-processing";
import { applyArabicFontPatch, ARABIC_GLYPH_RASTERS } from "./fe12-arabic-charmap";
import { buildFe12TextFile, parseFe12TextFile, type Fe12TextFile } from "./fe12-textfile";
import { compressLz11, decompressLz11 } from "./nds-lz";
import { indexNitroFs, readNitroFsFile, type NdsFileEntry, type NdsRomIndex } from "./nds-rom";
import { buildFe12Rom, type Fe12RomEdit } from "./nds-rom-builder";

export const FE12_SOURCE_GAME = "fe12";
export const FE12_BUFFER_KEY = "fe12:rom-buffer";
export const FE12_SOURCE_NAME_KEY = "fe12:rom-name";

const OPEN_CODE = 0x10;
const CLOSE_SEQUENCE = [0x01, 0x40, 0x01, 0x68];

interface Fe12Wrapper {
  prefix: string;
  middle: string;
  suffix: string;
}

/**
 * Splits a raw record's text into the part safe to translate and the parts
 * that must survive untouched. Verified this session against real records:
 * plain strings ("Mercenary", "Start a new game.") have no wrapper at all
 * (prefix/suffix empty); real dialogue lines are prefixed with scene-setup
 * commands and a single 0x10 "open text" byte, and close with
 * 0x01 0x40 0x01 0x68. Returns null — excluding the record from translation
 * — for anything this doesn't confidently understand: more than one 0x10,
 * a 0x10 with no matching close sequence after it, or any other control
 * byte (code < 0x20, other than \n) outside a recognized wrapper. That is
 * deliberately conservative: corrupting a format we haven't reverse
 * engineered is worse than leaving a line untranslated for now.
 */
function splitFe12Wrapper(text: string): Fe12Wrapper | null {
  const firstOpen = text.indexOf(String.fromCharCode(OPEN_CODE));
  const lastOpen = text.lastIndexOf(String.fromCharCode(OPEN_CODE));
  if (firstOpen !== lastOpen) return null; // more than one open marker — unrecognized structure

  if (firstOpen === -1) {
    // No wrapper: the whole record is text, translatable if there's no
    // other stray control byte in it.
    if (hasUnexpectedControlByte(text)) return null;
    return { prefix: "", middle: text, suffix: "" };
  }

  const closeNeedle = String.fromCharCode(...CLOSE_SEQUENCE);
  const closeIndex = text.indexOf(closeNeedle, firstOpen + 1);
  if (closeIndex === -1) return null;

  const prefix = text.slice(0, firstOpen + 1);
  const middle = text.slice(firstOpen + 1, closeIndex);
  const suffix = text.slice(closeIndex);
  if (hasUnexpectedControlByte(middle)) return null;
  return { prefix, middle, suffix };
}

// Records rendered by the game's short single-byte-per-character list
// widgets (gender selection, at minimum — other short list screens may
// share the same rendering path). Verified this session, at length, with a
// real emulator and a real hardware-level debugger (GDB attached to the
// running ARM9 core): these widgets do not read glyph shapes from any ROM
// data file at render time at all — editing fonts/talk produces kanji-like
// corruption (2-byte codes read one raw byte at a time), and editing
// fonts/alpha (the dedicated single-byte ASCII font, confirmed structurally
// identical to fonts/talk and genuinely used for these widgets) has zero
// effect on what's displayed, even for a byte overwriting only a glyph
// that's never used anywhere in the game's own text — meaning the pixel
// shapes are baked into the ARM9 executable itself, not any editable file.
// Excluded rather than translated: translating them would silently replace
// working English with "??" placeholders, which is worse than leaving them
// alone.
const NO_FONT_DATA_KEY_SUFFIXES = ["MPID_BOY", "MPID_GIRL", "_GENDER_M", "_GENDER_F"];

function hasNoEditableFontData(key: string | undefined): boolean {
  if (!key) return false;
  return NO_FONT_DATA_KEY_SUFFIXES.some((suffix) => key.endsWith(suffix));
}

function hasUnexpectedControlByte(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 && code !== 0x0a) return true;
  }
  return false;
}

interface Fe12CandidateFile {
  entry: NdsFileEntry;
  decompressed: Uint8Array;
  parsed: Fe12TextFile;
}

function scanTextFiles(rom: ArrayBuffer, index: NdsRomIndex): Fe12CandidateFile[] {
  const candidates: Fe12CandidateFile[] = [];
  for (const entry of index.files) {
    if (!entry.path.startsWith("m/")) continue;
    const raw = readNitroFsFile(rom, entry);
    if (raw.length === 0) continue;
    let decompressed: Uint8Array;
    try {
      decompressed = raw[0] === 0x11 ? decompressLz11(raw) : raw;
    } catch {
      continue;
    }
    try {
      const parsed = parseFe12TextFile(decompressed);
      candidates.push({ entry, decompressed, parsed });
    } catch {
      // Not this file format — expected for the many non-text files under m/.
    }
  }
  return candidates;
}

export interface Fe12EditorImport {
  entries: ExtractedEntry[];
  fileCount: number;
  translatableRecordCount: number;
  excludedRecordCount: number;
}

export function extractFireEmblem12Entries(romBuffer: ArrayBuffer): Fe12EditorImport {
  const index = indexNitroFs(romBuffer);
  const candidates = scanTextFiles(romBuffer, index);

  const entries: ExtractedEntry[] = [];
  let excludedRecordCount = 0;
  for (const { entry, parsed } of candidates) {
    const claimedOffsets = new Set<number>();
    for (const record of parsed.records) {
      if (claimedOffsets.has(record.textOffset)) continue; // duplicate string — translating the first covers this one too
      const wrapper = splitFe12Wrapper(record.text);
      if (!wrapper || hasNoEditableFontData(record.key)) {
        excludedRecordCount++;
        continue;
      }
      claimedOffsets.add(record.textOffset);
      // Class names (m/System, key MJID_*) render into a fixed-size UI
      // widget on the character-creation screen — verified this session
      // with a real emulator (control-test matrix): a same-length
      // replacement rendered fine, but any longer one (Arabic or plain
      // ASCII) corrupted the class-preview sprite. Zero growth over the
      // original is the only bound actually proven safe, so that's the cap.
      const isClassName = (record.key ?? "").startsWith("MJID_");
      entries.push({
        msbtFile: `fe12/${entry.path}`,
        index: record.index,
        label: `${entry.path} · ${record.key || `#${record.index}`}`,
        original: wrapper.middle,
        maxBytes: isClassName ? wrapper.middle.length : 0,
      });
    }
  }

  return {
    entries,
    fileCount: candidates.length,
    translatableRecordCount: entries.length,
    excludedRecordCount,
  };
}

export interface Fe12UnsupportedCharacter {
  character: string;
  codepoint: number;
  count: number;
}

export interface Fe12RuBuild {
  buffer: ArrayBuffer;
  filename: string;
  translatedLines: number;
  unsupportedCharacters: Fe12UnsupportedCharacter[];
}

/** Shapes, reverses, and maps translated text to FE12 Shift-JIS glyph codes; ASCII passes through as single bytes. */
function encodeFe12Arabic(translation: string, codepointToSjis: Map<number, number>, unsupported: Map<string, Fe12UnsupportedCharacter>): string {
  const shaped = reshapeArabic(translation);
  const visual = reverseBidi(shaped);
  let out = "";
  for (const ch of visual) {
    const codepoint = ch.codePointAt(0)!;
    if (codepoint < 0x80) {
      out += ch;
      continue;
    }
    const sjis = codepointToSjis.get(codepoint);
    if (sjis === undefined) {
      const existing = unsupported.get(ch);
      if (existing) existing.count++;
      else unsupported.set(ch, { character: ch, codepoint, count: 1 });
      continue;
    }
    out += String.fromCharCode((sjis >> 8) & 0xff, sjis & 0xff);
  }
  return out;
}

export function buildFireEmblem12Rom(
  romBuffer: ArrayBuffer,
  entries: ExtractedEntry[],
  translations: Record<string, string>
): Fe12RuBuild {
  const index = indexNitroFs(romBuffer);
  const fontEntry = index.byPath.get("fonts/talk");
  if (!fontEntry) throw new Error("لم يُعثر على ملفّ الخطّ fonts/talk داخل الروم.");
  const fontData = readNitroFsFile(romBuffer, fontEntry).slice();
  const codepointToSjis = applyArabicFontPatch(fontData);
  for (const codepoint of ARABIC_GLYPH_RASTERS.keys()) {
    if (!codepointToSjis.has(codepoint)) throw new Error(`لم يُخصَّص رمز خطّ للحرف U+${codepoint.toString(16).toUpperCase()}.`);
  }

  const entriesByFile = new Map<string, ExtractedEntry[]>();
  for (const entry of entries) {
    const key = translations[`${entry.msbtFile}:${entry.index}`];
    if (!key || !key.trim()) continue;
    const list = entriesByFile.get(entry.msbtFile) ?? [];
    list.push(entry);
    entriesByFile.set(entry.msbtFile, list);
  }

  const unsupported = new Map<string, Fe12UnsupportedCharacter>();
  const edits: Fe12RomEdit[] = [{ fileId: fontEntry.id, data: fontData }];
  let translatedLines = 0;

  for (const [msbtFile, fileEntries] of entriesByFile) {
    const nitroPath = msbtFile.slice("fe12/".length);
    const fileEntry = index.byPath.get(nitroPath);
    if (!fileEntry) continue;
    const raw = readNitroFsFile(romBuffer, fileEntry);
    const decompressed = raw[0] === 0x11 ? decompressLz11(raw) : raw;
    const parsed = parseFe12TextFile(decompressed);
    const recordsByIndex = new Map(parsed.records.map((r) => [r.index, r]));

    const replacements = new Map<number, string>();
    for (const entry of fileEntries) {
      const record = recordsByIndex.get(entry.index);
      if (!record) continue;
      const wrapper = splitFe12Wrapper(record.text);
      if (!wrapper) continue; // structure changed since extraction — skip rather than guess
      const translation = translations[`${entry.msbtFile}:${entry.index}`];
      const encodedMiddle = encodeFe12Arabic(translation, codepointToSjis, unsupported);
      replacements.set(entry.index, `${wrapper.prefix}${encodedMiddle}${wrapper.suffix}`);
      translatedLines++;
    }
    if (replacements.size === 0) continue;

    const rebuilt = buildFe12TextFile(parsed, replacements);
    const compressed = raw[0] === 0x11 ? compressLz11(rebuilt) : rebuilt;
    edits.push({ fileId: fileEntry.id, data: compressed });
  }

  const result = buildFe12Rom(romBuffer, index, edits);
  return {
    buffer: result.rom,
    filename: "fire-emblem-12-arabic.nds",
    translatedLines,
    unsupportedCharacters: [...unsupported.values()],
  };
}
