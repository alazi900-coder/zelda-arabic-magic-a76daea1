import { lzmaDecompress } from '../../vendor/lzma.js'
import { lzmaBlockWASM } from '../../wasm/wasmDecoders.js'

/**
 * Decompress LZMA data stream
 * @param {Uint8Array} data
 * @param {number} uncompressedSize
 * @returns {Uint8Array}
 */
export function lzmaDecompressDriver(data, uncompressedSize) {
    const p = new Uint8Array(uncompressedSize)
    const decoder = (typeof window !== 'undefined' && window.lzmaBlockWASM) || lzmaBlockWASM
    if (decoder) {
        const decoded = decoder.decodeBlock(data, uncompressedSize)
        return decoded ? decoded.slice() : p
    }
    return lzmaDecompress(data, uncompressedSize)
}
