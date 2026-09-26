/** Phantom Hourglass integration with the shared translation editor.
 *
 * Dialogue text lives in 32 BMG files (`ph-bmg.ts`) under `English/Message/`
 * in the ROM's own filesystem — not NARC-wrapped, so this reuses the same
 * `nds-rom.ts` file-table reader/writer the `/ph-logo` tool already uses,
 * not the NitroFS/NARC machinery Fire Emblem 12 needed.
 *
 * Text is genuine UTF-16 (confirmed this session against the real ROM), not
 * a fixed byte-per-glyph charmap — so unlike Fire Emblem 12, this never
 * needs to hunt for spare font glyph slots or remap codepoints to another
 * encoding. Translations only get `reshapeArabic` (letter-form shaping is
 * needed regardless of rendering direction) — NOT `reverseBidi`. That is a
 * deliberate difference from every other game this project supports: PH's
 * ARM9 has (or will have, pending its own separate, still-unverified
 * work — see decomps/ph/.claude_notes/bidi_progress.md) a right-to-left
 * *rendering* patch that reverses the pen's drawing direction per line, so
 * text is expected to stay stored in logical (natural reading) order.
 * Storing it pre-reversed here would be actively wrong now that the patch
 * works. Only embedded English/number runs are pre-reversed
 * (`reverseLatinRunsForPh`), so the per-glyph RTL draw flips them back.
 *
 * Messages containing a BMG escape/control code (player-name insertion,
 * icons, etc.) are excluded from translation entirely — `ph-bmg.ts` flags
 * them, and this project's own precedent (Fire Emblem 12's text wrapper)
 * is that leaving a sequence this module doesn't parse untranslated beats
 * silently corrupting it.
 */
import type { ExtractedEntry } from "@/components/editor/types";
import { reshapeArabic, isArabicChar } from "@/lib/arabic-processing";
import { findNdsFile, ndsFiles, ndsFileIdByPath, writeNdsFile, type NdsFile } from "@/lib/nds/nds-rom";
import { parseBmg, buildBmg, type BmgFile } from "./ph-bmg";

export const PH_SOURCE_GAME = "ph";
export const PH_BUFFER_KEY = "ph:rom-buffer";
export const PH_SOURCE_NAME_KEY = "ph:rom-name";

const MESSAGE_DIR_PREFIX = "English/Message/";

interface PhCandidateFile {
  path: string;
  ndsFile: NdsFile;
  parsed: BmgFile;
}

function scanBmgFiles(rom: Uint8Array): PhCandidateFile[] {
  const idByPath = ndsFileIdByPath(rom);
  const files = ndsFiles(rom);
  const candidates: PhCandidateFile[] = [];
  for (const [path, id] of idByPath) {
    if (!path.startsWith(MESSAGE_DIR_PREFIX) || !path.endsWith(".bmg")) continue;
    const ndsFile = files[id];
    if (!ndsFile) continue;
    try {
      const parsed = parseBmg(rom.subarray(ndsFile.start, ndsFile.end));
      candidates.push({ path, ndsFile, parsed });
    } catch {
      // Not a real BMG file despite the extension/location — skip it.
    }
  }
  return candidates;
}

export interface PhEditorImport {
  entries: ExtractedEntry[];
  fileCount: number;
  translatableMessageCount: number;
  excludedControlCodeCount: number;
}

export function extractPhEntries(romBuffer: ArrayBuffer): PhEditorImport {
  const rom = new Uint8Array(romBuffer);
  const candidates = scanBmgFiles(rom);

  const entries: ExtractedEntry[] = [];
  let excludedControlCodeCount = 0;
  for (const { path, parsed } of candidates) {
    const claimedOffsets = new Set<number>();
    parsed.messages.forEach((message, index) => {
      if (message.hasControlCode) {
        excludedControlCodeCount++;
        return;
      }
      if (!message.text.trim()) return; // nothing to translate
      if (claimedOffsets.has(message.offset)) return; // shared string — the first entry covers it
      claimedOffsets.add(message.offset);
      entries.push({
        msbtFile: `ph/${path}`,
        index,
        label: `${path.slice(MESSAGE_DIR_PREFIX.length)} · #${index}`,
        original: message.text,
        maxBytes: 0,
      });
    });
  }

  return {
    entries,
    fileCount: candidates.length,
    translatableMessageCount: entries.length,
    excludedControlCodeCount,
  };
}

export interface PhRomBuild {
  buffer: ArrayBuffer;
  filename: string;
  translatedLines: number;
}

const isLtrChar = (c: string) => /[A-Za-z0-9]/.test(c);

/**
 * The RTL patch draws every glyph right-to-left, so an English word or number
 * would read backwards ("Link" -> "kniL"). Messages with control codes are
 * never translated, so any Latin text is literal in the string: store each
 * run pre-reversed and the renderer flips it back. A run goes from a Latin
 * letter or digit to the last one before the next Arabic letter or line
 * break, taking the spaces/punctuation between them ("1,000", "Mr. Link").
 */
export function reverseLatinRunsForPh(text: string): string {
  return text.split("\n").map((line) => {
    const chars = [...line];
    let i = 0;
    while (i < chars.length) {
      if (!isLtrChar(chars[i])) { i++; continue; }
      let last = i;
      for (let j = i; j < chars.length && !isArabicChar(chars[j]); j++) {
        if (isLtrChar(chars[j])) last = j;
      }
      const run = chars.slice(i, last + 1).reverse();
      chars.splice(i, run.length, ...run);
      i = last + 1;
    }
    return chars.join("");
  }).join("\n");
}

export function buildPhRom(romBuffer: ArrayBuffer, entries: ExtractedEntry[], translations: Record<string, string>): PhRomBuild {
  let rom: Uint8Array = new Uint8Array(romBuffer);

  const entriesByFile = new Map<string, ExtractedEntry[]>();
  for (const entry of entries) {
    const translation = translations[`${entry.msbtFile}:${entry.index}`];
    if (!translation || !translation.trim()) continue;
    const list = entriesByFile.get(entry.msbtFile) ?? [];
    list.push(entry);
    entriesByFile.set(entry.msbtFile, list);
  }

  let translatedLines = 0;
  for (const [msbtFile, fileEntries] of entriesByFile) {
    const path = msbtFile.slice("ph/".length);
    const ndsFile = findNdsFile(rom, path);
    if (!ndsFile) continue;
    const parsed = parseBmg(rom.subarray(ndsFile.start, ndsFile.end));

    const replacements = new Map<number, string>();
    for (const entry of fileEntries) {
      const translation = translations[`${entry.msbtFile}:${entry.index}`];
      const shaped = reverseLatinRunsForPh(reshapeArabic(translation));
      // Every message index that originally shared this entry's offset
      // gets the same shaped translation, matching how extraction only
      // ever emits one editable entry per shared string.
      const offset = parsed.messages[entry.index]?.offset;
      if (offset === undefined) continue;
      parsed.messages.forEach((m, i) => {
        if (m.offset === offset) replacements.set(i, shaped);
      });
      translatedLines++;
    }
    if (replacements.size === 0) continue;

    const rebuilt = buildBmg(parsed, replacements);
    rom = writeNdsFile(rom, ndsFile, rebuilt);
  }

  return {
    buffer: rom.buffer.slice(rom.byteOffset, rom.byteOffset + rom.byteLength) as ArrayBuffer,
    filename: "phantom-hourglass-arabic.nds",
    translatedLines,
  };
}
