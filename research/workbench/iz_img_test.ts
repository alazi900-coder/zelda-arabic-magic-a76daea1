import { readFileSync } from "node:fs";
import { inazumaImagePaths, readInazumaContainer, inazumaContainerImages, parseInazumaImage, renderInazumaImage, guessInazumaImageWidth, encodeInazumaImage, inazumaImageWidths } from "@/lib/inazuma/inazuma-images";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const t0 = Date.now();
const paths = inazumaImagePaths(rom);
let files = 0, noLz = 0, refs = 0, unparsed = 0, rtFail = 0; const kinds: Record<string, number> = {};
const unp: string[] = [];
for (const p of paths) {
  const d = readInazumaContainer(rom, p);
  if (!d) { noLz++; continue; }
  files++;
  for (const r of inazumaContainerImages(p, d)) {
    refs++;
    const img = parseInazumaImage(d, r);
    if (!img) { unparsed++; unp.push(r.id); continue; }
    kinds[img.kind] = (kinds[img.kind] ?? 0) + 1;
    const w = inazumaImageWidths(img).length > 1 ? guessInazumaImageWidth(d, img) : inazumaImageWidths(img)[0];
    const a = renderInazumaImage(d, img, w);
    const copy = d.slice();
    const img2 = parseInazumaImage(copy, r)!;
    encodeInazumaImage(copy, img2, w, a.rgba);
    const b = renderInazumaImage(copy, parseInazumaImage(copy, r)!, w);
    let same = a.rgba.length === b.rgba.length;
    for (let i = 0; same && i < a.rgba.length; i += 4) if (a.rgba[i + 3] !== b.rgba[i + 3] || (a.rgba[i + 3] && (a.rgba[i] !== b.rgba[i] || a.rgba[i+1] !== b.rgba[i+1] || a.rgba[i+2] !== b.rgba[i+2]))) same = false;
    // bytes outside the entry must not change
    for (let i = 0; same && i < d.length; i++) if ((i < r.dataOffset || i >= r.dataOffset + r.size) && d[i] !== copy[i]) same = false;
    if (!same) rtFail++;
  }
}
console.log({ paths: paths.length, files, noLz, refs, unparsed, rtFail, kinds, ms: Date.now() - t0 });
console.log(unp.slice(0, 15));
