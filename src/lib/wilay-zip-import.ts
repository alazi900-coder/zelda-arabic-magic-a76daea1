/**
 * Finds which texture of which open wilay file a PNG from an Arabised ZIP
 * belongs to, from nothing but its path in the ZIP.
 *
 * The viewer's "export ZIP" writes one folder per open file, named after the
 * file without its extension, holding `tex<N>_<W>x<H>_<FORMAT>.png` -- or, with
 * a single file open, the PNGs at the root. The single-texture export writes
 * `<file>_tex<N>.png`. Each of those names says exactly where the picture came
 * from, so the translator can hand the whole ZIP back and every picture goes
 * home without being placed by hand.
 *
 * Tolerated on the way back: an extra folder around everything (a ZIP of the
 * unpacked folder, not of its contents), macOS `__MACOSX` litter, and folder
 * names that differ only in case.
 */

export type WilayZipMatch =
  | { ok: true; fileIndex: number; texIndex: number }
  | { ok: false; reason: "not-png" | "no-texture-number" | "no-file" | "ambiguous-file" };

/** The folder name the ZIP export gives a file: its name without the extension. */
export function wilayExportFolder(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, "");
}

const lastSegment = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? "";

export function matchWilayZipEntry(zipPath: string, openFileNames: string[]): WilayZipMatch {
  const path = zipPath.replace(/\\/g, "/");
  const segments = path.split("/").filter(Boolean);
  const base = segments.pop() ?? "";
  if (!/\.png$/i.test(base) || segments.includes("__MACOSX") || base.startsWith("._")) {
    return { ok: false, reason: "not-png" };
  }

  const texMatch = /(?:^|_)tex(\d+)(?=[_.])/i.exec(base);
  if (!texMatch) return { ok: false, reason: "no-texture-number" };
  const texIndex = Number(texMatch[1]);
  const dir = segments.join("/").toLowerCase();
  const folders = openFileNames.map((n) => wilayExportFolder(n).replace(/\\/g, "/").toLowerCase());

  // 1. The folder the picture sits in is the file's export folder, with or
  //    without extra folders above it. The longest match wins, so `a/b` is
  //    not mistaken for a file called `b`.
  let best = -1;
  let bestLen = -1;
  let tie = false;
  folders.forEach((folder, i) => {
    if (!folder) return;
    if (dir === folder || dir.endsWith(`/${folder}`)) {
      if (folder.length > bestLen) { best = i; bestLen = folder.length; tie = false; }
      else if (folder.length === bestLen) tie = true;
    }
  });
  if (best < 0 && dir) {
    // An open file added from a folder carries that folder in its name; the
    // ZIP may only have the file's own name. Match on the last part alone,
    // but only when exactly one open file has it.
    const last = lastSegment(dir);
    const hits = folders.map((f, i) => (lastSegment(f) === last ? i : -1)).filter((i) => i >= 0);
    if (hits.length === 1) best = hits[0];
    else if (hits.length > 1) return { ok: false, reason: "ambiguous-file" };
  }
  if (tie) return { ok: false, reason: "ambiguous-file" };
  if (best >= 0) return { ok: true, fileIndex: best, texIndex };

  // 2. The single-texture export: `<file>_tex<N>.png`.
  const prefix = base.slice(0, texMatch.index).toLowerCase();
  if (prefix) {
    const hits = openFileNames
      .map((n, i) => (lastSegment(n).toLowerCase() === prefix || lastSegment(wilayExportFolder(n)).toLowerCase() === prefix ? i : -1))
      .filter((i) => i >= 0);
    if (hits.length === 1) return { ok: true, fileIndex: hits[0], texIndex };
    if (hits.length > 1) return { ok: false, reason: "ambiguous-file" };
  }

  // 3. One file open: the export put its pictures at the root of the ZIP.
  if (openFileNames.length === 1) return { ok: true, fileIndex: 0, texIndex };
  return { ok: false, reason: "no-file" };
}
