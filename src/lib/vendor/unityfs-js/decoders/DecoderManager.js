import { lz4DecompressDriver } from './drivers/LZ4Driver.js'
import { lzmaDecompressDriver } from './drivers/LZMADriver.js'
import { decodeTexture2D } from './drivers/Texture2DDecoder.js'
import { decodeAudioFSB5 } from './drivers/AudioFSB5Decoder.js'

export class DecoderManager {
    static decompressors = new Map()
    static textureDecoders = new Map()
    static audioDecoders = new Map()

    static registerDecompressor(type, fn) {
        this.decompressors.set(type, fn)
    }

    static registerTextureDecoder(format, fn) {
        this.textureDecoders.set(format.toLowerCase(), fn)
    }

    static registerAudioDecoder(format, fn) {
        this.audioDecoders.set(format.toLowerCase(), fn)
    }

    static decompress(data, uncompressedSize, type) {
        const fn = this.decompressors.get(type)
        if (!fn) {
            throw new Error(`Unsupported or unregistered compression type: ${type}`)
        }
        return fn(data, uncompressedSize)
    }

    static async decodeTexture(data, width, height, format, options = {}) {
        const fn = this.textureDecoders.get(format.toLowerCase())
        if (!fn) {
            throw new Error(`Unsupported or unregistered texture format: ${format}`)
        }
        return fn(data, width, height, options)
    }

    static async decodeAudio(data, format, options = {}) {
        const fn = this.audioDecoders.get(format.toLowerCase())
        if (!fn) {
            throw new Error(`Unsupported or unregistered audio format: ${format}`)
        }
        return fn(data, options)
    }
}

// Auto-register built-in drivers
DecoderManager.registerDecompressor(2, lz4DecompressDriver) // CompressionType.LZ4
DecoderManager.registerDecompressor(3, lz4DecompressDriver) // CompressionType.LZ4HC
DecoderManager.registerDecompressor(1, lzmaDecompressDriver) // CompressionType.LZMA

// Register texture decoding formats (handled by decodeTexture2D driver)
const supportedFormats = [
    'dxt1',
    'dxt2',
    'dxt3',
    'dxt4',
    'dxt5',
    'dxt1crunched',
    'dxt5crunched',
    'rgb24',
    'rgba32',
    'argb4444',
    'bc7',
    'alpha8',
    'etc_rgb4',
    'etc2_rgb',
    'etc2_rgba1',
    'etc2_rgba8',
    'etc2_rgba8crunched',
    'etc_rgb4crunched',
    'eac_r',
    'eac_r_signed',
    'eac_rg',
    'eac_rg_signed',
]
for (const fmt of supportedFormats) {
    DecoderManager.registerTextureDecoder(fmt, (data, width, height, options) => {
        return decodeTexture2D(data, width, height, fmt, options)
    })
}

// Register audio formats
DecoderManager.registerAudioDecoder('fsb', decodeAudioFSB5)
