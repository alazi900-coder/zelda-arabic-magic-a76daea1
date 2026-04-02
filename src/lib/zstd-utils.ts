/**
 * zstd decompression utilities for Pokémon SV .dat files.
 * Uses @bokuweb/zstd-wasm for decompression.
 */

import { init as initZstd, decompress, compress } from '@bokuweb/zstd-wasm';

let zstdReady = false;

const ZSTD_MAGIC = [0x28, 0xB5, 0x2F, 0xFD];

/** Check if buffer starts with zstd magic bytes */
export function hasZstdMagic(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  return data[0] === ZSTD_MAGIC[0] &&
         data[1] === ZSTD_MAGIC[1] &&
         data[2] === ZSTD_MAGIC[2] &&
         data[3] === ZSTD_MAGIC[3];
}

/** Initialize zstd-wasm if not already done */
async function ensureZstd(): Promise<void> {
  if (!zstdReady) {
    await initZstd();
    zstdReady = true;
  }
}

/**
 * Auto-detect and decompress zstd data.
 * Returns { data, wasCompressed }.
 */
export async function autoDecompressZstd(
  buffer: ArrayBuffer
): Promise<{ data: ArrayBuffer; wasCompressed: boolean }> {
  const bytes = new Uint8Array(buffer);

  if (!hasZstdMagic(bytes)) {
    return { data: buffer, wasCompressed: false };
  }

  await ensureZstd();

  try {
    const decompressed = decompress(bytes);
    const result = new ArrayBuffer(decompressed.byteLength);
    new Uint8Array(result).set(decompressed);
    return { data: result, wasCompressed: true };
  } catch (err) {
    console.warn('[zstd] Decompression failed, using raw buffer:', err);
    return { data: buffer, wasCompressed: false };
  }
}

/**
 * Compress data using zstd.
 */
export async function compressZstd(data: Uint8Array, level = 3): Promise<Uint8Array> {
  await ensureZstd();
  return compress(data, level);
}
