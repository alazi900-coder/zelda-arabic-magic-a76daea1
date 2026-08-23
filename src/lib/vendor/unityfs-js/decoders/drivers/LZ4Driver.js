import { decompressBlock } from './lz4.js'
import { lz4BlockWASM } from '../../wasm/wasmDecoders.js'

/**
 * Decompress LZ4 data block
 * @param {Uint8Array} data
 * @param {number} uncompressedSize
 * @returns {Uint8Array}
 */
export function lz4DecompressDriver(data, uncompressedSize) {
    const p = new Uint8Array(uncompressedSize)
    const decoder = (typeof window !== 'undefined' && window.lz4BlockWASM) || lz4BlockWASM
    if (decoder) {
        const decoded = decoder.decodeBlock(data, 0, uncompressedSize)
        return decoded ? decoded.slice() : p
    }
    decompressBlock(data, p, 0, uncompressedSize, 0)
    return p
}
