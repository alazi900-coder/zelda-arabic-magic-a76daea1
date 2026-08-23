import * as wasmPng from './lodepng-wasm.js'
import UPNG from '../../vendor/upng/UPNG.js'

/**
 * Encode RGBA data into PNG byte array (tries LodePNG WASM first, falls back to UPNG)
 * @param {Uint8Array|ArrayBuffer} rgbaData 
 * @param {number} width 
 * @param {number} height 
 * @param {object} options 
 * @returns {Uint8Array}
 */
export function encodePng(rgbaData, width, height, options = {}) {
    if (options.decoder !== 'js') {
        try {
            const wasmRes = wasmPng.encode(rgbaData, width, height)
            if (wasmRes) {
                return wasmRes
            }
        } catch (e) {
            console.warn('[unityfs-js] LodePNG WASM encode failed, falling back to JS:', e.message)
        }
    }

    const rawBuffer = rgbaData.buffer || rgbaData
    const upngRes = UPNG.encode([rawBuffer], width, height, 0)
    return new Uint8Array(upngRes)
}

/**
 * Decode PNG data into RGBA buffer (tries LodePNG WASM first, falls back to UPNG)
 * @param {Uint8Array|ArrayBuffer} pngData 
 * @param {object} options 
 * @returns {{ data: Uint8Array, width: number, height: number }}
 */
export function decodePng(pngData, options = {}) {
    if (options.decoder !== 'js') {
        try {
            const wasmRes = wasmPng.decode(pngData)
            if (wasmRes) {
                return wasmRes
            }
        } catch (e) {
            console.warn('[unityfs-js] LodePNG WASM decode failed, falling back to JS:', e.message)
        }
    }

    const img = UPNG.decode(pngData.buffer || pngData)
    const rgbaArray = UPNG.toRGBA8(img)[0]
    return {
        data: new Uint8Array(rgbaArray),
        width: img.width,
        height: img.height,
    }
}

export default {
    encodePng,
    decodePng,
}
