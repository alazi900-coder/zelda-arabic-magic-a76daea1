import { getTextureDecoderPool } from './TextureDecoderPool.js'
import initCRN from '../../vendor/crunchjs/crunch.js'
import initUnityCRN from '../../vendor/crunchjs/unityCrunch.js'
import * as texture2dDec from '../../wasm/texture2ddecoder-wasm/texture2ddecoder-any.js'

async function decompressCRN(data) {
    const CRN_FORMAT = {
        cCRNFmtInvalid: -1,
        cCRNFmtDXT1: 0,
        cCRNFmtDXT3: 1,
        cCRNFmtDXT5: 2,
    }
    const GL_EXTENSIONS_CONSTANTS = {
        COMPRESSED_RGB_S3TC_DXT1_EXT: 0x83f0,
        COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1,
        COMPRESSED_RGBA_S3TC_DXT3_EXT: 0x83f2,
        COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3,
    }

    const DXT_FORMAT_MAP = {
        [CRN_FORMAT.cCRNFmtDXT1]: {
            pixelFormat: GL_EXTENSIONS_CONSTANTS.COMPRESSED_RGB_S3TC_DXT1_EXT,
            sizeFunction: getDxt1LevelSize,
        },
        [CRN_FORMAT.cCRNFmtDXT3]: {
            pixelFormat: GL_EXTENSIONS_CONSTANTS.COMPRESSED_RGBA_S3TC_DXT3_EXT,
            sizeFunction: getDxtXLevelSize,
        },
        [CRN_FORMAT.cCRNFmtDXT5]: {
            pixelFormat: GL_EXTENSIONS_CONSTANTS.COMPRESSED_RGBA_S3TC_DXT5_EXT,
            sizeFunction: getDxtXLevelSize,
        },
    }
    const crunchModule = await initCRN()
    const srcSize = data.byteLength
    const bytes = new Uint8Array(data)
    const src = crunchModule._malloc(srcSize)
    let dst = null

    try {
        arrayBufferCopy(bytes, crunchModule.HEAPU8, src, srcSize)

        const format = crunchModule._crn_get_dxt_format(src, srcSize)
        if (format === CRN_FORMAT.cCRNFmtInvalid) {
            throw new Error('Invalid CRN format')
        }

        const mipMapLevels = crunchModule._crn_get_levels(src, srcSize)
        const width = crunchModule._crn_get_width(src, srcSize)
        const height = crunchModule._crn_get_height(src, srcSize)

        const sizeFunction = DXT_FORMAT_MAP[format].sizeFunction
        let dstSize = 0
        for (let i = 0; i < mipMapLevels; ++i) {
            dstSize += sizeFunction(width >> i, height >> i)
        }

        dst = crunchModule._malloc(dstSize)

        crunchModule._crn_decompress(src, srcSize, dst, dstSize, 0, mipMapLevels)

        const image = new Uint8Array(crunchModule.HEAPU8.buffer, dst, dstSize).slice()
        return image
    } finally {
        crunchModule._free(src)
        if (dst) {
            crunchModule._free(dst)
        }
    }

    function arrayBufferCopy(srcData, dstData, dstByteOffset, numBytes) {
        dstData.set(srcData.subarray(0, numBytes), dstByteOffset)
    }
    function getDxt1LevelSize(w, h) {
        return ((w + 3) >> 2) * ((h + 3) >> 2) * 8
    }
    function getDxtXLevelSize(w, h) {
        return ((w + 3) >> 2) * ((h + 3) >> 2) * 16
    }
}

async function decompressUnityCRN(crnData, levelIndex = 0) {
    const wasmModule = await initUnityCRN()
    const crnPtr = wasmModule._malloc(crnData.length)
    wasmModule.HEAPU8.set(crnData, crnPtr)

    const retPtrPtr = wasmModule._malloc(4)
    const retSizePtr = wasmModule._malloc(4)

    try {
        const success = wasmModule._unity_crunch_unpack_level(crnPtr, crnData.length, levelIndex, retPtrPtr, retSizePtr)

        if (success) {
            const resultPtr = new Uint32Array(wasmModule.HEAPU8.buffer, retPtrPtr, 1)[0]
            const resultSize = new Uint32Array(wasmModule.HEAPU8.buffer, retSizePtr, 1)[0]
            const decompressed = new Uint8Array(wasmModule.HEAPU8.buffer, resultPtr, resultSize).slice()

            wasmModule._free_unity_crunch_buffer(resultPtr)
            return decompressed
        }
        throw new Error('CRN解压失败')
    } finally {
        wasmModule._free(crnPtr)
        wasmModule._free(retPtrPtr)
        wasmModule._free(retSizePtr)
    }
}

function decodeRgb24(data, width, height) {
    const pixelCount = width * height
    const out = new Uint8Array(pixelCount * 4)
    let srcIdx = 0
    let destIdx = 0
    for (let i = 0; i < pixelCount; i++) {
        out[destIdx] = data[srcIdx]
        out[destIdx + 1] = data[srcIdx + 1]
        out[destIdx + 2] = data[srcIdx + 2]
        out[destIdx + 3] = 255
        srcIdx += 3
        destIdx += 4
    }
    return out
}

function decodeArgb4444(data, width, height) {
    const pixelCount = width * height
    const output = new Uint8Array(pixelCount * 4)
    const lookupTable = new Uint8Array(16)
    for (let i = 0; i < 16; i++) {
        lookupTable[i] = Math.round((i * 255) / 15)
    }

    let byteOffset = 0
    let outputOffset = 0
    for (let i = 0; i < pixelCount; i++) {
        const pixelValue = (data[byteOffset + 1] << 8) | data[byteOffset]
        const a = (pixelValue >> 12) & 0xf
        const r = (pixelValue >> 8) & 0xf
        const g = (pixelValue >> 4) & 0xf
        const b = pixelValue & 0xf

        output[outputOffset] = lookupTable[r]
        output[outputOffset + 1] = lookupTable[g]
        output[outputOffset + 2] = lookupTable[b]
        output[outputOffset + 3] = lookupTable[a]

        byteOffset += 2
        outputOffset += 4
    }
    return output
}

function decodeAlpha8(alpha8Data, baseColor = [255, 255, 255]) {
    const pixelCount = alpha8Data.length
    const rgbaData = new Uint8Array(pixelCount * 4)
    const r = baseColor[0]
    const g = baseColor[1]
    const b = baseColor[2]

    let rgbaIndex = 0
    for (let i = 0; i < pixelCount; i++) {
        rgbaData[rgbaIndex] = r
        rgbaData[rgbaIndex + 1] = g
        rgbaData[rgbaIndex + 2] = b
        rgbaData[rgbaIndex + 3] = alpha8Data[i]
        rgbaIndex += 4
    }
    return rgbaData
}

/**
 * Decode compressed texture format to straight RGBA Uint8Array
 * @param {Uint8Array} data
 * @param {number} width
 * @param {number} height
 * @param {string} textureFormat
 * @param {Object} options
 * @returns {Promise<Uint8Array>}
 */
export async function decodeTexture2D(data, width, height, textureFormat, options = {}) {
    const format = textureFormat.toLowerCase()
    let imageData = null
    const version = options.version || [0, 0, 0, 0]

    const u8Data = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data)

    // Route to Web Worker thread pool by default unless explicitly disabled (worker: false)
    if (options.worker !== false) {
        try {
            const pool = getTextureDecoderPool()
            const pooledResult = await pool.decode(u8Data, width, height, textureFormat, {
                ...options,
                worker: false, // Prevent worker from spawning sub-workers
            })
            if (pooledResult) {
                return pooledResult
            }
        } catch (poolErr) {
            console.warn('[Texture2DDecoder] Worker pool failed, fallback to main thread:', poolErr)
        }
    }

    switch (format) {
        case 'dxt1':
        case 'dxt2':
        case 'dxt3':
        case 'dxt4':
        case 'dxt5':
            imageData = await texture2dDec.decodeDxt(u8Data, width, height, textureFormat, options)
            break
        case 'rgb24':
            imageData = decodeRgb24(u8Data, width, height)
            break
        case 'rgba32':
            if (u8Data.length > width * height * 4) {
                imageData = u8Data.slice(0, width * height * 4)
            } else {
                imageData = u8Data
            }
            break
        case 'argb4444':
            imageData = decodeArgb4444(u8Data, width, height)
            break
        case 'dxt1crunched':
        case 'dxt5crunched': {
            let dxtData = null
            if (version[0] > 2017 || (version[0] === 2017 && version[1] >= 3)) {
                dxtData = await decompressUnityCRN(u8Data, 0)
            } else {
                dxtData = await decompressCRN(u8Data)
            }
            const baseFormat = textureFormat.replace('crunched', '').toLowerCase()
            imageData = await texture2dDec.decodeDxt(dxtData, width, height, baseFormat, options)
            break
        }
        case 'bc7':
            imageData = await texture2dDec.decodeBc7(u8Data, width, height, options)
            break
        case 'alpha8':
            imageData = decodeAlpha8(u8Data)
            break
        case 'etc_rgb4':
            imageData = await texture2dDec.decodeEtc1(u8Data, width, height, options)
            break
        case 'etc2_rgb':
            imageData = await texture2dDec.decodeEtc2(u8Data, width, height, options)
            break
        case 'etc2_rgba1':
            imageData = await texture2dDec.decodeEtc2a1(u8Data, width, height, options)
            break
        case 'etc2_rgba8':
            imageData = await texture2dDec.decodeEtc2a8(u8Data, width, height, options)
            break
        case 'eac_r':
            imageData = await texture2dDec.decodeEacr(u8Data, width, height, options)
            break
        case 'eac_r_signed':
            imageData = await texture2dDec.decodeEacrSigned(u8Data, width, height, options)
            break
        case 'eac_rg':
            imageData = await texture2dDec.decodeEacrg(u8Data, width, height, options)
            break
        case 'eac_rg_signed':
            imageData = await texture2dDec.decodeEacrgSigned(u8Data, width, height, options)
            break
        case 'etc_rgb4crunched':
        case 'etc2_rgba8crunched': {
            let etcData = u8Data
            if (version[0] > 2017 || (version[0] === 2017 && version[1] >= 3)) {
                etcData = await decompressUnityCRN(u8Data, 0)
            } else {
                etcData = await decompressCRN(u8Data)
            }
            const baseFormat = format.replace('crunched', '')
            if (baseFormat === 'etc_rgb4') {
                imageData = await texture2dDec.decodeEtc1(etcData, width, height, options)
            } else {
                imageData = await texture2dDec.decodeEtc2a8(etcData, width, height, options)
            }
            break
        }
        default:
            throw new Error(`Unsupported texture format decoder: ${textureFormat}`)
    }

    if (!imageData || imageData.length !== width * height * 4) {
        throw new Error(
            `Decoded image data size mismatch: got ${imageData ? imageData.length : 0}, expected ${width * height * 4}`,
        )
    }

    return imageData
}
