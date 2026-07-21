/**
 * Bridge between the Mother 3 script engine (m3-script.ts) and the shared
 * translation editor (`/editor`). Turns the ROM's decoded script lines into
 * `ExtractedEntry[]` the editor understands, and rebuilds a patched ROM from
 * the editor's translations.
 *
 * Entry identity: msbtFile = `bank_<N>`, index = line index within the bank.
 * Only lines that contain real translatable text become entries (control-only
 * lines like `[F103]0` are skipped from the UI but always preserved on build —
 * rebuildBank re-emits every original line whose index the user didn't edit).
 *
 * Byte budget: Mother 3's space limit is per *bank* (its whole region), not per
 * line, so per-entry maxBytes is left generous and the real limit is enforced
 * at build time (rebuildBank reports the exact overflow per bank).
 */

import type { ExtractedEntry } from "@/components/editor/types";
import {
  parseBankTable,
  parseBankRegion,
  rebuildBank,
  applyRebuild,
  type M3Bank,
} from "./m3-script";

/** IndexedDB key holding the loaded Mother 3 ROM bytes for the build step. */
export const MOTHER3_BUFFER_KEY = "mother3SourceBuffer";
export const MOTHER3_SOURCE_GAME = "mother3";

const LETTER = /[A-Za-z]/;

/** A line is worth showing in the editor only if it has at least one real
 *  letter once its control-code / raw-byte tokens are stripped (lone digits/
 *  0x0X bytes are control arguments, not translatable text). */
function isTranslatable(text: string): boolean {
  const stripped = text.replace(/\[[0-9A-Fa-f]{2,4}\]/g, "").replace(/\{[0-9A-Fa-f]{2}\}/g, "");
  return LETTER.test(stripped);
}

function preview(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

export interface Mother3ExtractResult {
  entries: ExtractedEntry[];
  bankCount: number;
  lineCount: number;
}

/** Decode the whole main script into editor entries. */
export function extractMother3Entries(rom: Uint8Array): Mother3ExtractResult {
  const regions = parseBankTable(rom).filter((r) => r.end - r.start > 2);
  const entries: ExtractedEntry[] = [];
  let lineCount = 0;
  let usedBanks = 0;
  for (const region of regions) {
    const bank = parseBankRegion(rom, region);
    if (!bank || bank.lines.length === 0) continue;
    let bankHasText = false;
    for (const line of bank.lines) {
      lineCount++;
      if (!isTranslatable(line.text)) continue;
      bankHasText = true;
      entries.push({
        msbtFile: `bank_${bank.index}`,
        index: line.index,
        label: preview(line.text),
        original: line.text,
        maxBytes: 0x7fff, // real limit is per-bank, enforced at build
      });
    }
    if (bankHasText) usedBanks++;
  }
  return { entries, bankCount: usedBanks, lineCount };
}

export interface Mother3BuildOk {
  rom: Uint8Array;
  translatedLines: number;
  changedBanks: number;
}
export interface Mother3BuildError {
  error: string;
  /** per-bank overflow details when a translated bank exceeds its region */
  overflows: { bank: number; overflowBy: number }[];
  /** true when at least one bank failed because the text contained characters
   *  the ROM font can't encode yet (e.g. Arabic before font insertion) */
  hasEncodingError?: boolean;
}

const KEY_RE = /^bank_(\d+)$/;

/**
 * Rebuild a patched ROM from the editor's translations. `translations` is keyed
 * `bank_<N>:<lineIndex>` -> Arabic text (same tokens the extractor produced).
 * Banks with no edits are left byte-identical.
 */
export function buildMother3Rom(
  rom: Uint8Array,
  translations: Record<string, string>
): Mother3BuildOk | Mother3BuildError {
  // group edits by bank index
  const byBank = new Map<number, Map<number, string>>();
  let translatedLines = 0;
  for (const [key, value] of Object.entries(translations)) {
    if (value == null || value === "") continue;
    const [file, idxStr] = key.split(":");
    const m = KEY_RE.exec(file);
    if (!m) continue;
    const bank = parseInt(m[1], 10);
    const lineIndex = parseInt(idxStr, 10);
    if (Number.isNaN(bank) || Number.isNaN(lineIndex)) continue;
    if (!byBank.has(bank)) byBank.set(bank, new Map());
    byBank.get(bank)!.set(lineIndex, value);
    translatedLines++;
  }

  let out = rom;
  const overflows: { bank: number; overflowBy: number }[] = [];
  let encodingFailure = false;
  let changedBanks = 0;
  for (const [bankIndex, edits] of byBank) {
    const parsed: M3Bank | null = parseBankRegion(
      out,
      parseBankTable(out).find((r) => r.index === bankIndex) ?? { index: bankIndex, start: 0, end: 0 }
    );
    if (!parsed) {
      overflows.push({ bank: bankIndex, overflowBy: 0 });
      continue;
    }
    const res = rebuildBank(out, parsed, edits);
    if ("error" in res) {
      // overflowBy set => space overflow; unset => an un-encodable character
      if (res.overflowBy == null) encodingFailure = true;
      else overflows.push({ bank: bankIndex, overflowBy: res.overflowBy });
      continue;
    }
    out = applyRebuild(out, res);
    changedBanks++;
  }

  if (encodingFailure) {
    return {
      error:
        "النص يحتوي حروفاً لا يدعمها خط اللعبة الحالي (مثل الحروف العربية). يلزم إدراج خط عربي في الـ ROM وربط الحروف بأكواد أولاً.",
      overflows,
      hasEncodingError: true,
    };
  }
  if (overflows.length > 0) {
    return {
      error: `${overflows.length} بنك تجاوز مساحته بعد الترجمة — قصّر النص في هذه البنوك`,
      overflows,
    };
  }
  return { rom: out, translatedLines, changedBanks };
}
