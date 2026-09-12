/**
 * Full pipeline for Majora's Mask 3D's title-logo archive
 * (`zelda2_mag.gar.lzs`): decompress -> unpack the GAR -> patch the
 * "ZELDA" wordmark into a flat Arabic-logo quad -> repack -> recompress.
 *
 * Uses `patchLogoInPlace` (cmb.ts), not `replaceLogoWithFlatQuad`: an
 * earlier version of this pipeline used the latter, which added a new
 * texture/material/mesh/shape with freshly recalculated chunk offsets —
 * it round-tripped cleanly through this project's own parser, but crashed
 * a real 3DS console (data abort / translation-section fault, confirmed
 * via the console's own exception screen). `patchLogoInPlace` instead only
 * overwrites bytes inside the file's own existing, already-valid
 * allocations — no chunk grows, no offset is recomputed.
 *
 * `title_00` is converted from RGB565 to RGBA4444 in place (same 2 bytes
 * per pixel, so nothing resizes) rather than staying RGB565: an opaque
 * quad occluded a separate 3D mask-icon mesh that used to show through
 * the gaps between the original carved letters, confirmed against a real
 * device photo — RGBA4444's real (if coarse) alpha channel fixes that.
 *
 * All indices below (materials, shapes, the target textures) are specific
 * to this one file — confirmed this session by decoding real triangle
 * counts and face-index ranges out of the extracted asset, not guessed.
 */
import { decompressGrezzoLzs, compressGrezzoLzs } from "./grezzo-lz";
import { parseGar, buildGar } from "./gar";
import { patchLogoInPlace } from "./cmb";

/** Matches title_00's exact original size — patchLogoInPlace requires the
 * new logo to encode to the identical byte length. */
export const LOGO_WIDTH = 256;
export const LOGO_HEIGHT = 128;

const TITLE_00_TEXTURE_INDEX = 6;
const SURVIVING_LETTER_SHAPE_INDEX = 4; // fewest triangles (32) of the 5 letters, 96 indices (divisible by 6)
const REMOVED_SHAPE_INDICES = [1, 2, 3, 5, 9]; // the other 4 letters + the shine-effect quad
const LOGO_BOUNDS = { minX: -9.3, maxX: 11.72, minY: -3.97, maxY: 4.51, z: 2.26 };
/** "THE LEGEND OF / MAJORA'S MASK™ 3D" — a separate subtitle texture (two
 * small flat shapes, 10 and 11 via materials 7 and 6 — not the letter
 * geometry, so just blanking its pixels is enough), redundant once
 * title_00 carries the full Arabic title. Blanked rather than translated
 * per the user's own confirmation (relayed from a friend inspecting the
 * extracted file in a CMB viewer, screenshots showing its real
 * transparent background). */
const TITLE_SUB_TEXTURE_INDEX = 8;
/** Material 4 (title_00, bound to the surviving/reshaped shape) and
 * materials 6+7 (title_sub_00's two shapes, now blanked) all need alpha
 * testing switched on, or their now-transparent pixels still render
 * opaque with their raw (black) color instead of being discarded. */
const ALPHA_TEST_MATERIAL_INDICES = [4, 6, 7];

export function patchTitleLogoArchive(archiveLzsBytes: Uint8Array, logoRgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const decompressed = decompressGrezzoLzs(archiveLzsBytes);
  const files = parseGar(decompressed);
  const cmbFile = files.find((f) => f.typeName === "cmb" && f.fileName === "title_logo");
  if (!cmbFile) {
    throw new Error('لم يتم العثور على ملف "title_logo.cmb" داخل الأرشيف — تأكد من أنه ملف zelda2_mag.gar.lzs الصحيح');
  }

  const patchedCmb = patchLogoInPlace(cmbFile.data, {
    survivingShapeIndex: SURVIVING_LETTER_SHAPE_INDEX,
    removedShapeIndices: REMOVED_SHAPE_INDICES,
    bounds: LOGO_BOUNDS,
    logoRgba,
    textureIndex: TITLE_00_TEXTURE_INDEX,
    blankTextureIndices: [TITLE_SUB_TEXTURE_INDEX],
    alphaTestMaterialIndices: ALPHA_TEST_MATERIAL_INDICES,
  });

  const newFiles = files.map((f) => (f === cmbFile ? { ...f, data: patchedCmb } : f));
  const newGar = buildGar(newFiles);
  return compressGrezzoLzs(newGar);
}
