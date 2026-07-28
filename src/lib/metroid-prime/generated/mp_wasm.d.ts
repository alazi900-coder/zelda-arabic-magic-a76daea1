/* tslint:disable */
/* eslint-disable */

/**
 * WASM export — thin wrapper around `build_font_glyphs_native`.
 */
export function build_font_glyphs(data: Uint8Array, txtr_id: string, font_id: string, glyphs_meta_json: string, pixels_concat: Uint8Array): Uint8Array;

/**
 * Decode a TXTR asset (by UUID) from a PACK file into PNG bytes.
 */
export function decode_texture_png(data: Uint8Array, id: string): Uint8Array;

/**
 * WASM export — thin wrapper around `edit_font_glyphs_native`.
 */
export function edit_font_glyphs(data: Uint8Array, font_id: string, ops_json: string): Uint8Array;

/**
 * Returns one asset's raw bytes (the full RFRM-wrapped form, i.e.
 * `asset.data` verbatim) by UUID — generic, works on any asset kind
 * (used for MSBT text assets, which need no special Rust-side parsing:
 * the RFRM/locale-chunk/MsgStdBn structure is simple enough to handle in
 * pure TypeScript — see mp-msbt.ts).
 */
export function get_asset_data(data: Uint8Array, id: string): Uint8Array;

export function init(): void;

/**
 * Parse a PACK file and return a JSON array of {id, kind, names} for every asset.
 */
export function list_assets(data: Uint8Array): string;

/**
 * Parse a FONT asset's texture-page GUID list — content starts with a u32
 * page count followed by that many 16-byte GUIDs (see find_glyph_table_start
 * docblock). Page index 0 is the only one confirmed (by comparing a real
 * community mod against the original) to correspond to `flag=0` glyphs, so
 * callers use this to highlight the correct TXTR to select/edit — with ~190
 * unlabeled textures in a real .pak, there's no other way for a user to
 * know which one is actually the font atlas.
 */
export function list_font_pages(data: Uint8Array, id: string): string;

/**
 * Parse a FONT asset (by UUID) from a PACK file and return its glyph table as JSON.
 */
export function list_glyphs(data: Uint8Array, id: string): string;

/**
 * Every TXTR asset in the PACK with its dimensions and pixel format, as JSON.
 *
 * `list_assets` gives only ids and names, and most textures in a real .pak
 * carry no name at all — so an image tool has no way to tell a 4096x4096 BC7
 * logo from a 4x4 solid-colour swatch without this. A texture whose header
 * won't parse is still listed, with `readable: false`, rather than dropped:
 * a missing entry looks like the tool lost the image.
 */
export function list_textures(data: Uint8Array): string;

/**
 * Replaces MANY assets' raw bytes at once (by UUID) and rebuilds the whole
 * PACK file in a single pass — used to swap in every edited MSBT text
 * asset for a translation build. `ids_json` is a JSON array of UUID
 * strings; `lengths_json` a parallel JSON array of byte lengths; the
 * actual bytes are back-to-back in `concat_data` in the same order
 * (avoids JSON-encoding large binary blobs — same pattern as
 * build_font_glyphs's pixel buffer).
 */
export function replace_assets_data(data: Uint8Array, ids_json: string, lengths_json: string, concat_data: Uint8Array): Uint8Array;

/**
 * Replaces one TXTR asset's pixels with a new RGBA8 image, re-encoding into
 * the texture's original format and regenerating its mip chain.
 *
 * Dimensions must match the original: a texture's size is baked into
 * whatever references it (font UV rects, UI layout), so silently resizing
 * would break the very screen the user is trying to translate. Everything
 * else about the asset — format, sampler settings, mip count, and every
 * other asset in the .pak — is preserved.
 */
export function replace_texture(data: Uint8Array, id: string, rgba: Uint8Array, width: number, height: number): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly build_font_glyphs: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
  readonly decode_texture_png: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly edit_font_glyphs: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
  readonly get_asset_data: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly list_assets: (a: number, b: number) => [number, number, number, number];
  readonly list_font_pages: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly list_glyphs: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly list_textures: (a: number, b: number) => [number, number, number, number];
  readonly replace_assets_data: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
  readonly replace_texture: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
  readonly init: () => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
