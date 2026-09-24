/**
 * Which Inazuma picture a PNG in an Arabised ZIP belongs to, and at which
 * width it was drawn -- from nothing but its path in the ZIP.
 *
 * The picture tool names every exported PNG after where it came from:
 *
 *   «تحميل المحدد ZIP», an SFP entry   pic2d/menu/en/MMName/NEDN_BG01_256x24.png
 *   «تحميل المحدد ZIP», a bare file    pic2d/menu/en/msup_bg00_256x192.png
 *   «تنزيل PNG»                        NEDN_BG01_256x24.png
 *
 * The folder is the ROM path without `data_iz/` and without its extension;
 * the width and height are the layout the picture was shown at. That width
 * matters on the way back: the Arabic was painted on the picture as it was
 * laid out then, so it has to go back on that same layout.
 *
 * Tolerated: an extra folder around everything, backslashes, letter case,
 * macOS `__MACOSX` litter. A bare name (the single «تنزيل PNG» file) is
 * matched only when exactly one picture in the ROM has it.
 */

import type { InazumaImageRef } from "./inazuma-images";

/** The picture's short name as the exports write it: entry or file name, no extension. */
export function inazumaImageShortName(ref: InazumaImageRef): string {
  const base = ref.entryName ?? ref.romPath.slice(ref.romPath.lastIndexOf("/") + 1);
  return base.replace(/\.(pac_?|PAC|SPF_)$/i, "").replace(/[^\w.-]/g, "_");
}

/** The path «تحميل المحدد ZIP» gives a picture laid out at width×height. */
export function inazumaImageZipPath(ref: InazumaImageRef, width: number, height: number): string {
  const folder = ref.romPath.replace(/^data_iz\//, "").replace(/\.(SPF_|pac_?)$/i, "");
  return ref.entryName
    ? `${folder}/${inazumaImageShortName(ref)}_${width}x${height}.png`
    : `${folder}_${width}x${height}.png`;
}

export type InazumaZipMatch =
  | { ok: true; id: string; width: number; height: number }
  | { ok: false; reason: "not-png" | "no-size" | "no-image" | "ambiguous" };

/** A matcher over the ROM's pictures, built once for a whole ZIP. */
export function inazumaZipMatcher(refs: InazumaImageRef[]): (zipPath: string) => InazumaZipMatch {
  const byKey = new Map<string, string>();
  const byShort = new Map<string, string[]>();
  for (const ref of refs) {
    const key = inazumaImageZipPath(ref, 0, 0).replace(/_0x0\.png$/, "").toLowerCase();
    byKey.set(key, ref.id);
    const short = inazumaImageShortName(ref).toLowerCase();
    byShort.set(short, [...(byShort.get(short) ?? []), ref.id]);
  }

  return (zipPath) => {
    const segments = zipPath.replace(/\\/g, "/").split("/").filter(Boolean);
    const base = segments[segments.length - 1] ?? "";
    if (!/\.png$/i.test(base) || segments.includes("__MACOSX") || base.startsWith("._")) {
      return { ok: false, reason: "not-png" };
    }
    const size = /_(\d+)x(\d+)\.png$/i.exec(base);
    if (!size) return { ok: false, reason: "no-size" };
    const width = Number(size[1]), height = Number(size[2]);
    const stem = [...segments.slice(0, -1), base.slice(0, size.index)].join("/").toLowerCase();

    // The export's own path, with or without folders above it. Trying the
    // longest tail first means an outer folder never hides the real one.
    const parts = stem.split("/");
    for (let i = 0; i < parts.length; i++) {
      const id = byKey.get(parts.slice(i).join("/"));
      if (id) return { ok: true, id, width, height };
    }
    // A single «تنزيل PNG» file: its name alone, if only one picture has it.
    const hits = byShort.get(parts[parts.length - 1]) ?? [];
    if (hits.length === 1) return { ok: true, id: hits[0], width, height };
    return { ok: false, reason: hits.length > 1 ? "ambiguous" : "no-image" };
  };
}
