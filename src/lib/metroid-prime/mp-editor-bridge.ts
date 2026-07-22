/**
 * Bridge between the Metroid Prime Remastered .pak text assets (mp-msbt.ts)
 * and the shared translation editor (`/editor`). Turns every MSBT text
 * asset's USEN (US English) locale strings into `ExtractedEntry[]` the
 * editor understands, and rebuilds a patched .pak from the editor's
 * translations — only the USEN sub-chunk of each MSBT asset is touched; the
 * other 12 bundled locales (EUFR/JPJP/KOKO/...) are preserved byte-for-byte.
 *
 * Entry identity: msbtFile = the MSBT asset's name (e.g. "TEXT_Subtitles"),
 * index = TXT2 string index within that asset's USEN section.
 */

import type { ExtractedEntry } from "@/components/editor/types";
import { listPakAssets, getAssetData, replaceAssetsData } from "./mp-wasm";
import { parseMsbtUsenEntries, rebuildMsbtUsenAsset } from "./mp-msbt";

export const METROID_PRIME_BUFFER_KEY = "metroidPrimeSourceBuffer";
export const METROID_PRIME_SOURCE_GAME = "metroidprime";

const LETTER = /[A-Za-z]/;
const TAG_RE = /\[TAG:[0-9a-fA-F]{4}:[0-9a-fA-F]{4}:[0-9a-fA-F]{4}:[0-9a-fA-F]*\]/g;

/** An entry is worth showing in the editor only if it has at least one real
 *  letter once its [TAG:...] control-tag placeholders are stripped. */
function isTranslatable(text: string): boolean {
  return LETTER.test(text.replace(TAG_RE, ""));
}

function preview(text: string): string {
  const t = text.replace(TAG_RE, " ").replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

export interface MetroidPrimeExtractResult {
  entries: ExtractedEntry[];
  assetCount: number;
}

/** Decode every MSBT text asset's USEN strings into editor entries. */
export async function extractMetroidPrimeEntries(pakBytes: Uint8Array): Promise<MetroidPrimeExtractResult> {
  const assets = await listPakAssets(pakBytes);
  const msbtAssets = assets.filter((a) => a.kind === "MSBT");
  const entries: ExtractedEntry[] = [];
  let assetCount = 0;
  for (const asset of msbtAssets) {
    const name = asset.names[0] || asset.id;
    let assetData: Uint8Array;
    try {
      assetData = await getAssetData(pakBytes, asset.id);
    } catch {
      continue;
    }
    let msbtEntries;
    try {
      msbtEntries = parseMsbtUsenEntries(assetData);
    } catch {
      continue; // no USEN section in this asset
    }
    if (msbtEntries.length === 0) continue;
    assetCount++;
    for (const e of msbtEntries) {
      if (!isTranslatable(e.original)) continue;
      entries.push({
        msbtFile: name,
        index: e.index,
        label: preview(e.original),
        original: e.original,
        maxBytes: 0x7fff, // no real per-string limit — TXT2 grows to fit; generous soft bound
      });
    }
  }
  return { entries, assetCount };
}

export interface MetroidPrimeBuildOk {
  pak: Uint8Array;
  translatedLines: number;
  changedAssets: number;
}
export interface MetroidPrimeBuildError {
  error: string;
}

/**
 * Rebuild a translated .pak from the editor's translations. `translations`
 * is keyed `<msbtFile>:<index>` -> Arabic text, matching entryKey(). Every
 * MSBT asset with at least one edit is rebuilt (USEN TXT2 only) and all
 * rebuilt assets are spliced into the .pak in a single rebuild pass.
 */
export async function buildMetroidPrimePak(
  pakBytes: Uint8Array,
  translations: Record<string, string>
): Promise<MetroidPrimeBuildOk | MetroidPrimeBuildError> {
  const assets = await listPakAssets(pakBytes);
  const msbtAssets = assets.filter((a) => a.kind === "MSBT");

  const ids: string[] = [];
  const replacements: Uint8Array[] = [];
  let translatedLines = 0;

  for (const asset of msbtAssets) {
    const name = asset.names[0] || asset.id;
    let assetData: Uint8Array;
    try {
      assetData = await getAssetData(pakBytes, asset.id);
    } catch {
      continue;
    }
    let msbtEntries;
    try {
      msbtEntries = parseMsbtUsenEntries(assetData);
    } catch {
      continue;
    }
    if (msbtEntries.length === 0) continue;

    const edits = new Map<number, string>();
    for (const e of msbtEntries) {
      const value = translations[`${name}:${e.index}`];
      if (value != null && value !== "") {
        edits.set(e.index, value);
        translatedLines++;
      }
    }
    if (edits.size === 0) continue;

    let rebuilt: Uint8Array;
    try {
      rebuilt = rebuildMsbtUsenAsset(assetData, edits);
    } catch (err) {
      return { error: `فشل إعادة بناء ${name}: ${(err as Error).message}` };
    }
    ids.push(asset.id);
    replacements.push(rebuilt);
  }

  if (ids.length === 0) {
    return { error: "لا توجد ترجمات محفوظة لبنائها" };
  }

  const pak = await replaceAssetsData(pakBytes, ids, replacements);
  return { pak, translatedLines, changedAssets: ids.length };
}
