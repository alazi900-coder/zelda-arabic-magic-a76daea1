import { pngEncoderWASM } from '../wasmDecoders.js'

/**
 * Encode RGBA data into PNG byte array using LodePNG WASM
 * @param {Uint8Array|ArrayBuffer} rgbaData 
 * @param {number} width 
 * @param {number} height 
 * @returns {Uint8Array|null}
 */
export function encode(rgbaData, width, height) {
    if (!pngEncoderWASM) {
        return null
    }
    return pngEncoderWASM.encode(rgbaData, width, height)
}

/**
 * Decode PNG data into RGBA buffer using LodePNG WASM
 * @param {Uint8Array|ArrayBuffer} pngData 
 * @returns {{ data: Uint8Array, width: number, height: number }|null}
 */
export function decode(pngData) {
    if (!pngEncoderWASM) {
        return null
    }
    return pngEncoderWASM.decode(pngData)
}

export default {
    encode,
    decode,
}
