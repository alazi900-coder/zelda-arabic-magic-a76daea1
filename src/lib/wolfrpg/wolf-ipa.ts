/**
 * Reading and rewriting the game's .ipa.
 *
 * The Android player opens the .ipa itself — its native library carries a zip
 * reader and the paths `Packages/` and `Font_16p_Light.bmp` — so a translation
 * ships as the same .ipa with a handful of entries swapped. That was confirmed
 * in-game: replacing the fonts inside the archive changed what the game drew.
 *
 * The one rule that matters is that a replacement must *replace*. Pasting a
 * file into an archive with a phone file manager can append a second entry
 * under the same name, leaving two copies and a zip reader free to pick either
 * — which is exactly the kind of "it worked once and not the next time" that
 * costs days. `replaceIpaEntries` rewrites the archive entry by entry, keeping
 * the original order and compression, and refuses to finish if any name ends
 * up duplicated or if a requested entry was not found.
 */

import JSZip from "jszip";

/** Where the game's data lives inside the archive. */
export const WOLF_PACKAGES_PREFIX = "Payload/Wolf...RPG.app/Packages/";

export interface WolfIpa {
  zip: JSZip;
  /** Entry names in their original order. */
  names: string[];
}

export async function openIpa(bytes: Uint8Array): Promise<WolfIpa> {
  const zip = await JSZip.loadAsync(bytes);
  const names: string[] = [];
  zip.forEach((path, file) => {
    if (!file.dir) names.push(path);
  });
  if (names.length !== new Set(names).size) {
    throw new Error("this .ipa already contains duplicate entries — start from a clean copy");
  }
  return { zip, names };
}

export async function readIpaFile(ipa: WolfIpa, name: string): Promise<Uint8Array> {
  const file = ipa.zip.file(name);
  if (!file) throw new Error(`not in the archive: ${name}`);
  return file.async("uint8array");
}

/** Reads a file from `Packages/`, the only folder a translation touches. */
export function readPackagesFile(ipa: WolfIpa, name: string): Promise<Uint8Array> {
  return readIpaFile(ipa, WOLF_PACKAGES_PREFIX + name);
}

/**
 * Rebuilds the archive with the given `Packages/` files replaced.
 *
 * Returns the new bytes. Every other entry is copied through unchanged, and
 * the result is checked for duplicates before it is handed back — a corrupt
 * archive that only fails on the user's phone is the worst outcome here.
 */
export async function replaceIpaEntries(
  bytes: Uint8Array,
  replacements: Map<string, Uint8Array>
): Promise<Uint8Array> {
  const source = await JSZip.loadAsync(bytes);
  const wanted = new Map([...replacements].map(([n, d]) => [WOLF_PACKAGES_PREFIX + n, d]));
  const out = new JSZip();
  const seen = new Set<string>();
  const missing = new Set(wanted.keys());

  const entries: { path: string; file: JSZip.JSZipObject }[] = [];
  source.forEach((path, file) => {
    if (!file.dir) entries.push({ path, file });
  });

  for (const { path, file } of entries) {
    if (seen.has(path)) throw new Error(`the source archive has ${path} twice`);
    seen.add(path);
    const replacement = wanted.get(path);
    missing.delete(path);
    const data = replacement ?? (await file.async("uint8array"));
    // Copy into a plain array first: a Uint8Array minted in another realm
    // (a worker, a different document) fails JSZip's type check and the
    // archive only blows up at generate time, far from the cause.
    out.file(path, new Uint8Array(data), { date: file.date });
  }
  if (missing.size > 0) {
    throw new Error(`not in the archive: ${[...missing].join(", ")}`);
  }
  return out.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
