/**
 * Full pipeline for Majora's Mask 3D's title-logo archive
 * (`zelda2_mag.gar.lzs`): decompress -> unpack the GAR -> swap the
 * "ZELDA" wordmark mesh for a flat quad carrying the new Arabic logo
 * texture -> repack -> recompress.
 *
 * The material index (4 = title_00, the 5 lettering shapes), the effect
 * material to drop alongside it (5 = title_eff_00, the shine sweep that
 * would otherwise animate across now-empty space), the template shape
 * (0 = the flat "© Nintendo" plane) and the quad's world-space bounds are
 * all specific to this one file — confirmed this session by decoding real
 * triangle counts and vertex positions out of the extracted asset, not
 * guessed. This module isn't a general CMB/GAR editor, just this patch.
 */
import { decompressGrezzoLzs, compressGrezzoLzs } from "./grezzo-lz";
import { parseGar, buildGar } from "./gar";
import { replaceLogoWithFlatQuad } from "./cmb";

/** Matches title_00's original texture size, confirmed against the real file. */
export const LOGO_WIDTH = 256;
export const LOGO_HEIGHT = 128;

const LETTERS_MATERIAL_INDEX = 4;
const EFFECT_MATERIAL_INDEX = 5;
const TEMPLATE_SHAPE_INDEX = 0;
const LOGO_BOUNDS = { minX: -9.3, maxX: 11.72, minY: -3.97, maxY: 4.51, z: 2.26 };

export function patchTitleLogoArchive(archiveLzsBytes: Uint8Array, logoRgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const decompressed = decompressGrezzoLzs(archiveLzsBytes);
  const files = parseGar(decompressed);
  const cmbFile = files.find((f) => f.typeName === "cmb" && f.fileName === "title_logo");
  if (!cmbFile) {
    throw new Error('لم يتم العثور على ملف "title_logo.cmb" داخل الأرشيف — تأكد من أنه ملف zelda2_mag.gar.lzs الصحيح');
  }

  const patchedCmb = replaceLogoWithFlatQuad(cmbFile.data, {
    lettersMaterialIndex: LETTERS_MATERIAL_INDEX,
    effectMaterialIndex: EFFECT_MATERIAL_INDEX,
    templateShapeIndex: TEMPLATE_SHAPE_INDEX,
    bounds: LOGO_BOUNDS,
    logoRgba,
    logoWidth: LOGO_WIDTH,
    logoHeight: LOGO_HEIGHT,
    newTextureName: "title_ar",
  });

  const newFiles = files.map((f) => (f === cmbFile ? { ...f, data: patchedCmb } : f));
  const newGar = buildGar(newFiles);
  return compressGrezzoLzs(newGar);
}
