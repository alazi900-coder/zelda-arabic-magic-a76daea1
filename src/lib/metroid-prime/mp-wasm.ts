/**
 * Thin wrapper around the pre-built mp_wasm module (compiled from a Rust
 * wasm-bindgen crate that wraps `retrolib`, the open-source Metroid Prime
 * Remastered asset library: https://github.com/PrimeDecomp/retrotool).
 * The .wasm binary is pre-built and checked into `public/wasm/metroid-prime/`
 * — Lovable's build environment has no Rust toolchain, so it's loaded as a
 * static asset rather than compiled at build time. The generated JS glue
 * (`generated/mp_wasm.js`) lives under src/ so Vite bundles it normally —
 * dev-mode Vite refuses to import .js modules straight out of /public.
 */
import init, * as mpWasm from "./generated/mp_wasm.js";

export interface MetroidPrimeAssetInfo {
  id: string;
  kind: string;
  names: string[];
}

/** One glyph's metrics — see mp-wasm/src/lib.rs for the reverse-engineered
 *  record layout this is parsed from (no official FONT format spec exists
 *  for Metroid Prime Remastered). A FONT asset can reference up to 5 texture
 *  pages, and `flag` groups glyphs by page — confirmed by comparing a real
 *  community mod (which added Cyrillic) against the original: the mod added
 *  66 new records, all `flag=0`, all sized/positioned against the first
 *  (smallest) texture page only, which it grew/reformatted to fit them.
 *  `flag=0` is the only value confirmed to map to that first page; the
 *  other ~250 flag values seen (1 through 255) belong to the other 4 much
 *  larger CJK/Hangul pages and are not reliably mapped per-page yet. u0/v0/
 *  u1/v1 are normalized (0..1) against whichever page the glyph's flag
 *  belongs to — so only reliable for `flag=0` glyphs against the game's
 *  first texture page today. */
export interface MetroidPrimeGlyph {
  code: number;
  flag: number;
  x0: number;
  y0: number;
  width: number;
  height: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  advance: number;
}

/** One glyph ready to be inserted into a FONT's atlas — same fields the
 *  real glyph records store (see MetroidPrimeGlyph), plus its rasterized
 *  pixel bitmap (grayscale/R8, row-major top-down, width*height bytes). */
export interface MpGlyphInput {
  code: number;
  x0: number;
  y0: number;
  width: number;
  height: number;
  advance: number;
  pixels: Uint8Array;
}

/** One glyph-table edit operation — see mp-wasm/src/lib.rs's GlyphEditOp.
 *  None of these touch the TXTR atlas, only the FONT's record table. */
export type MpGlyphEditOp =
  | { op: "alias"; code: number; source_code: number }
  | { op: "remap"; code: number; source_code: number }
  | { op: "delete"; code: number }
  | { op: "set_fields"; code: number; x0: number; y0: number; advance: number };

interface MpWasmModule {
  list_assets(data: Uint8Array): string;
  decode_texture_png(data: Uint8Array, id: string): Uint8Array;
  list_glyphs(data: Uint8Array, id: string): string;
  build_font_glyphs(data: Uint8Array, txtrId: string, fontId: string, glyphsMetaJson: string, pixelsConcat: Uint8Array): Uint8Array;
  edit_font_glyphs(data: Uint8Array, fontId: string, opsJson: string): Uint8Array;
  list_font_pages(data: Uint8Array, id: string): string;
  get_asset_data(data: Uint8Array, id: string): Uint8Array;
  replace_assets_data(data: Uint8Array, idsJson: string, lengthsJson: string, concatData: Uint8Array): Uint8Array;
}

let modPromise: Promise<MpWasmModule> | null = null;

async function loadModule(): Promise<MpWasmModule> {
  if (!modPromise) {
    modPromise = (async () => {
      await init({ module_or_path: "/wasm/metroid-prime/mp_wasm_bg.wasm" });
      return mpWasm as unknown as MpWasmModule;
    })();
  }
  return modPromise;
}

/** List every asset (texture/font/text/model/...) in a Metroid Prime Remastered .pak file. */
export async function listPakAssets(data: Uint8Array): Promise<MetroidPrimeAssetInfo[]> {
  const mod = await loadModule();
  return JSON.parse(mod.list_assets(data)) as MetroidPrimeAssetInfo[];
}

/** Decode a TXTR asset (by UUID) from a .pak file into PNG bytes. */
export async function decodeTextureToPng(data: Uint8Array, id: string): Promise<Uint8Array> {
  const mod = await loadModule();
  return mod.decode_texture_png(data, id);
}

/** Parse a FONT asset's (by UUID) glyph table from a .pak file. */
export async function listGlyphs(data: Uint8Array, id: string): Promise<MetroidPrimeGlyph[]> {
  const mod = await loadModule();
  return JSON.parse(mod.list_glyphs(data, id)) as MetroidPrimeGlyph[];
}

/**
 * Adds real rasterized glyphs (e.g. from renderArabicGlyphsForMp) to a FONT
 * asset: shelf-packs their pixel bitmaps into new atlas rows, inserts a
 * matching glyph record for each at its correct sorted position in the
 * FONT's glyph table, then rebuilds the whole .pak file. Throws if any
 * requested codepoint already exists in the font — callers should filter
 * against `listGlyphs` first.
 */
export async function buildFontGlyphs(
  data: Uint8Array,
  txtrId: string,
  fontId: string,
  glyphs: MpGlyphInput[]
): Promise<Uint8Array> {
  const mod = await loadModule();
  const meta = glyphs.map(({ code, x0, y0, width, height, advance }) => ({ code, x0, y0, width, height, advance }));
  const totalLen = glyphs.reduce((sum, g) => sum + g.pixels.length, 0);
  const pixelsConcat = new Uint8Array(totalLen);
  let offset = 0;
  for (const g of glyphs) {
    pixelsConcat.set(g.pixels, offset);
    offset += g.pixels.length;
  }
  return mod.build_font_glyphs(data, txtrId, fontId, JSON.stringify(meta), pixelsConcat);
}

/**
 * Applies glyph-table-only edits (alias/remap/delete/set_fields — see
 * MpGlyphEditOp) to a FONT asset and rebuilds the whole .pak file. No TXTR
 * involvement, so no pixel data is needed for any of these operations.
 */
export async function editFontGlyphs(data: Uint8Array, fontId: string, ops: MpGlyphEditOp[]): Promise<Uint8Array> {
  const mod = await loadModule();
  return mod.edit_font_glyphs(data, fontId, JSON.stringify(ops));
}

/**
 * Returns a FONT asset's ordered texture-page GUID list. Index 0 is the
 * only page confirmed to correspond to `flag=0` glyphs (see
 * MetroidPrimeGlyph docblock) — used to highlight the correct TXTR to
 * select/edit, since a real .pak has ~190 unlabeled textures.
 */
export async function listFontPages(data: Uint8Array, fontId: string): Promise<string[]> {
  const mod = await loadModule();
  return JSON.parse(mod.list_font_pages(data, fontId)) as string[];
}

/** Returns one asset's raw bytes (RFRM header + content) verbatim, by UUID. */
export async function getAssetData(data: Uint8Array, id: string): Promise<Uint8Array> {
  const mod = await loadModule();
  return mod.get_asset_data(data, id);
}

/**
 * Batch-replaces many assets' raw bytes in a single .pak rebuild pass —
 * far cheaper than rebuilding once per asset when translating dozens of
 * MSBT text assets. `ids` and `replacements` must be the same length and
 * order (replacements[i] is the new raw bytes for ids[i]).
 */
export async function replaceAssetsData(data: Uint8Array, ids: string[], replacements: Uint8Array[]): Promise<Uint8Array> {
  const mod = await loadModule();
  const lengths = replacements.map((r) => r.length);
  const concat = new Uint8Array(lengths.reduce((sum, l) => sum + l, 0));
  let offset = 0;
  for (const r of replacements) {
    concat.set(r, offset);
    offset += r.length;
  }
  return mod.replace_assets_data(data, JSON.stringify(ids), JSON.stringify(lengths), concat);
}
