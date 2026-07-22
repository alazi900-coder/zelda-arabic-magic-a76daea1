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

export function init(): void;

/**
 * Parse a PACK file and return a JSON array of {id, kind, names} for every asset.
 */
export function list_assets(data: Uint8Array): string;

/**
 * Parse a FONT asset (by UUID) from a PACK file and return its glyph table as JSON.
 */
export function list_glyphs(data: Uint8Array, id: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly build_font_glyphs: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
  readonly decode_texture_png: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly edit_font_glyphs: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
  readonly list_assets: (a: number, b: number) => [number, number, number, number];
  readonly list_glyphs: (a: number, b: number, c: number, d: number) => [number, number, number, number];
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
