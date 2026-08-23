import { NamedObject } from './namedObject.js'
import { DecoderManager } from '../../decoders/DecoderManager.js'

const utf8Decoder = new TextDecoder('utf-8')

export const FMODSoundType = {
    0: 'Unknown',
    1: 'ACC',
    2: 'AIFF',
    3: 'ASF',
    4: 'AT3',
    5: 'CDDA',
    6: 'DLS',
    7: 'FLAC',
    8: 'FSB',
    9: 'GCADPCM',
    10: 'IT',
    11: 'MIDI',
    12: 'MOD',
    13: 'MPEG',
    14: 'OGGVORBIS',
    15: 'PLAYLIST',
    16: 'RAW',
    17: 'S3M',
    18: 'SF2',
    19: 'USER',
    20: 'WAV',
    21: 'XM',
    22: 'XMA',
    23: 'VAG',
    24: 'AUDIOQUEUE',
    25: 'XWMA',
    26: 'BCWAV',
    27: 'AT9',
    28: 'VORBIS',
    29: 'MEDIA_FOUNDATION',
}

export const AudioCompressionFormat = {
    0: 'PCM',
    1: 'Vorbis',
    2: 'ADPCM',
    3: 'MP3',
    4: 'PSMVAG',
    5: 'HEVAG',
    6: 'XMA',
    7: 'AAC',
    8: 'GCADPCM',
    9: 'ATRAC9',
}

export class AudioClip extends NamedObject {
    static exposedAttributes = [
        'name',
        'loadType',
        'channels',
        'frequency',
        'bitsPerSample',
        'length',
        'isTrackerFormat',
        'subsoundIndex',
        'preloadAudioData',
        'loadInBackground',
        'legacy3D',
        'source',
        'offset',
        'size',
        'compressionFormat',
    ]
    exportExtension = '.wav'
    constructor(reader) {
        super(reader)
        this.reader = reader
        if (reader.version[0] < 5) {
            this.format = reader.readInt32()
            this.type = FMODSoundType[reader.readInt32()]
            this.is3D = reader.readBool()
            this.useHardware = reader.readBool()
            reader.align(4)

            if (reader.versionGTE(3, 2)) {
                reader.readInt32()
                this.size = reader.readInt32()
            } else {
                this.size = reader.readInt32()
            }
        } else {
            this.loadType = reader.readInt32()
            this.channels = reader.readInt32()
            this.frequency = reader.readInt32()
            this.bitsPerSample = reader.readInt32()
            this.length = reader.readFloat32()
            this.isTrackerFormat = reader.readBool()
            reader.align(4)
            this.subsoundIndex = reader.readInt32()
            this.preloadAudioData = reader.readBool()
            this.loadInBackground = reader.readBool()
            this.legacy3D = reader.readBool()
            reader.align(4)

            this.source = reader.readAlignedString()
            this.offset = Number(reader.readInt64())
            this.size = Number(reader.readInt64())
            this.compressionFormat = AudioCompressionFormat[reader.readInt32()]
        }
    }

    createBinaryData(bundleFile) {
        const context = this.reader?.assetFile?.context || bundleFile?.context || bundleFile
        if (context && typeof context.resolveResource === 'function') {
            const data = context.resolveResource(this.source, this.offset, this.size)
            if (data) {
                const slicedData = data.slice()
                this.getAudioType(slicedData)
                return slicedData.buffer
            }
        }
        if (bundleFile && Array.isArray(bundleFile.files)) {
            for (var i = 0; i < bundleFile.files.length; i++) {
                let file = bundleFile.files[i]
                if (this.source.indexOf(file.node.path) !== -1 && file.type == 3) {
                    let data = file.data.slice(this.offset, this.offset + this.size)
                    this.getAudioType(data)
                    return data.buffer
                }
            }
        }
    }

    async createAudioData(bundleFile) {
        let data = this.createBinaryData(bundleFile)
        if (!data) return null
        let fileType = this.getAudioType(data)
        if (fileType === 'fsb') {
            try {
                const decoded = await DecoderManager.decodeAudio(data, 'fsb')
                data = decoded.data
                fileType = decoded.fileType
            } catch (e) {
                console.error('FSB decoding failed', e)
            }
        }
        return {
            fileType: fileType,
            data: data,
        }
    }

    createDataUrl(bundleFile) {
        let wavData = this.createBinaryData(bundleFile)
        return URL.createObjectURL(new Blob([wavData], { type: 'audio/wav' }))
    }

    getAudioType(data) {
        if (!data) return 'wav'
        const len = data.byteLength ?? data.length ?? 0
        const readLen = Math.min(32, len)
        const view = data instanceof ArrayBuffer ? new Uint8Array(data, 0, readLen) : data.subarray(0, readLen)
        let txt = utf8Decoder.decode(view)
        if (txt.indexOf('ftyp') !== -1) {
            return 'm4a'
        }
        if (txt.indexOf('ID3') !== -1) {
            return 'mp3'
        }
        if (txt.indexOf('Ogg') !== -1) {
            return 'ogg'
        }
        if (txt.indexOf('FSB5') !== -1) {
            return 'fsb'
        }
        return 'wav'
    }
}
