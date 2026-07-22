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

interface MpWasmModule {
  list_assets(data: Uint8Array): string;
  decode_texture_png(data: Uint8Array, id: string): Uint8Array;
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
