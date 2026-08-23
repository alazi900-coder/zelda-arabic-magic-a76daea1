import FMODModule from '../vendor/fmod/fmod.js'
import { BinaryWriter, BinaryReader } from '../core/binaryStream.js'
import { rebuildVorbis } from './vorbis.js'
import { rebuildPcm } from './pcm.js'

const SoundFormat = {
    NONE: 0,
    PCM8: 1,
    PCM16: 2,
    PCM24: 3,
    PCM32: 4,
    PCMFLOAT: 5,
    GCADPCM: 6,
    IMAADPCM: 7,
    VAG: 8,
    HEVAG: 9,
    XMA: 10,
    MPEG: 11,
    CELT: 12,
    AT9: 13,
    XWMA: 14,
    VORBIS: 15,
    FADPCM: 16,
    OPUS: 17,
}

export class FSB5 {
    constructor(data) {
        this.data = data
        this.samples = []
        this.format = SoundFormat.NONE
        this.version = 0

        this.fmodModule = null
        this.system = null

        this.parse()
    }

    parse() {
        const reader = new BinaryReader(this.data, 'little')
        const magic = reader.readChars(4)
        if (magic !== 'FSB5') {
            throw new Error(`Expected magic header 'FSB5' but got '${magic}'`)
        }
        this.version = reader.readUInt32()
        const numSamples = reader.readUInt32()
        const sampleHeadersSize = reader.readUInt32()
        const nameTableSize = reader.readUInt32()
        const dataSize = reader.readUInt32()
        this.format = reader.readUInt32()

        reader.read(8)
        reader.read(16)
        reader.read(8)
        if (this.version === 0) {
            reader.readUInt32()
        }
        const headerSize = reader.tell()

        // Parse sample headers
        const samples = new Array(numSamples)
        for (let i = 0; i < numSamples; i++) {
            const raw = reader.readUInt64() // BigInt

            const next_chunk = Number(raw & 1n)
            const frequency = Number((raw >> 1n) & 0xfn)
            const channels = Number((raw >> 5n) & 1n) + 1
            const dataOffset = Number((raw >> 6n) & 0xfffffffn) * 16
            const numSamplesVal = Number((raw >> 34n) & 0x3fffffffn)

            const chunks = {}
            let hasNextChunk = next_chunk
            while (hasNextChunk) {
                const chunk_raw = reader.readUInt32()
                hasNextChunk = chunk_raw & 1
                const chunk_size = (chunk_raw >> 1) & 0xffffff
                const chunk_type = (chunk_raw >> 25) & 0x7f

                let chunk_data
                if (chunk_type === 11) {
                    // VORBISDATA
                    const crc32 = reader.readUInt32()
                    const unknown_bytes = reader.read(chunk_size - 4)
                    chunk_data = { crc32, unknown: unknown_bytes }
                } else if (chunk_type === 1) {
                    // CHANNELS (uint8)
                    chunk_data = [reader.readUInt8()]
                } else if (chunk_type === 2) {
                    // FREQUENCY (uint32)
                    chunk_data = [reader.readUInt32()]
                } else if (chunk_type === 3) {
                    // LOOP (uint32, uint32)
                    chunk_data = [reader.readUInt32(), reader.readUInt32()]
                } else {
                    chunk_data = reader.read(chunk_size)
                }
                chunks[chunk_type] = chunk_data
            }

            let finalFrequency = frequency
            if (chunks[2]) {
                // MetadataChunkType.FREQUENCY
                finalFrequency = chunks[2][0]
            } else {
                const frequency_values = {
                    1: 8000,
                    2: 11000,
                    3: 11025,
                    4: 16000,
                    5: 22050,
                    6: 24000,
                    7: 32000,
                    8: 44100,
                    9: 48000,
                }
                if (frequency_values[frequency]) {
                    finalFrequency = frequency_values[frequency]
                } else {
                    finalFrequency = 44100
                }
            }

            let finalChannels = channels
            if (chunks[1]) {
                // MetadataChunkType.CHANNELS
                finalChannels = chunks[1][0]
            }

            samples[i] = {
                name: i.toString().padStart(4, '0'),
                frequency: finalFrequency,
                channels: finalChannels,
                dataOffset,
                samples: numSamplesVal,
                metadata: chunks,
                data: null,
            }
        }

        // Parse name table if nameTableSize > 0
        if (nameTableSize > 0) {
            const nametable_start = reader.tell()
            const samplename_offsets = new Array(numSamples)
            for (let i = 0; i < numSamples; i++) {
                samplename_offsets[i] = reader.readUInt32()
            }
            for (let i = 0; i < numSamples; i++) {
                reader.seek(nametable_start + samplename_offsets[i])
                const name = reader.readCString(nameTableSize)
                samples[i].name = name
            }
        }

        // Seek to raw data payload and extract each sample's raw payload
        const payload_start = headerSize + sampleHeadersSize + nameTableSize
        for (let i = 0; i < numSamples; i++) {
            const data_start = payload_start + samples[i].dataOffset
            let data_end = payload_start + dataSize
            if (i < numSamples - 1) {
                data_end = payload_start + samples[i + 1].dataOffset
            }
            reader.seek(data_start)
            samples[i].data = reader.read(data_end - data_start)
        }

        this.samples = samples
    }

    async getAudio() {
        if (this.samples.length === 0) return null

        const sample = this.samples[0]

        // Pure JS path
        if (this.format === SoundFormat.VORBIS) {
            try {
                return rebuildVorbis(sample)
            } catch (e) {
                console.error('Pure JS Vorbis rebuild failed, falling back to FMOD WASM:', e)
            }
        } else if (
            this.format === SoundFormat.PCM8 ||
            this.format === SoundFormat.PCM16 ||
            this.format === SoundFormat.PCM24 ||
            this.format === SoundFormat.PCM32
        ) {
            try {
                return rebuildPcm(sample, this.format)
            } catch (e) {
                console.error('Pure JS PCM rebuild failed, falling back to FMOD WASM:', e)
            }
        } else if (this.format === SoundFormat.MPEG) {
            return sample.data
        }

        // Fallback to FMOD WASM path for unsupported/failed formats
        return this.getAudioFMOD()
    }

    async getAudioFMOD(isRetry = false) {
        try {
            const sound = await this.getSound()
            const wav = await this.convertSound(sound)
            sound.release()
            this.fmodModule.Memory_Free(sound.$$.ptr)
            return wav
        } catch {
            if (isRetry) {
                console.error('Failed on FMOD retry - not exporting')
                return null
            }
            console.warn('Error exporting with FMOD - resetting module and retrying')
            await this.reset()
            return await this.getAudioFMOD(true)
        }
    }

    async getSound() {
        if (this.system == null) {
            await this._initModule()
        }

        const info = new this.fmodModule.CREATESOUNDEXINFO()
        info.length = this.data.length
        const soundOut = {}
        if (this.system.createSound(this.data, this.fmodModule.OPENMEMORY, info, soundOut) !== 0) {
            console.error('Could not create sound')
        }
        const sound = soundOut.val
        let numSubSounds = {}
        if (sound.getNumSubSounds(numSubSounds) !== 0) {
            console.error('Could not get number of subsounds')
        }
        let subSound
        if (numSubSounds.val > 0) {
            const subSoundOut = {}
            if (sound.getSubSound(0, subSoundOut) !== 0) {
                console.error('Could not get subsound')
            }
            subSound = subSoundOut.val
        } else {
            subSound = sound
        }
        return subSound
    }

    async convertSound(sound) {
        let type = {}
        let format = {}
        let channels = {}
        let bits = {}
        if (sound.getFormat(type, format, channels, bits) !== 0) {
            console.error('Could not get sound format')
        }
        channels = channels.val
        bits = bits.val
        format = format.val
        const frequency = {}
        const priority = {}
        if (sound.getDefaults(frequency, priority) !== 0) {
            console.error('Could not get sound frequency')
        }
        const sampleRate = Math.floor(frequency.val)
        let length = {}
        if (sound.getLength(length, this.fmodModule.TIMEUNIT_PCMBYTES) !== 0) {
            console.error('Could not get sound length')
        }
        length = length.val

        const heap = this.fmodModule.HEAPU8
        const ptr = sound.$$.ptr
        const sndOffset = heap[ptr] | (heap[ptr + 1] << 8) | (heap[ptr + 2] << 16) | (heap[ptr + 3] << 24)
        const offset2 = sndOffset + 228
        const intSndOffset =
            heap[offset2] | (heap[offset2 + 1] << 8) | (heap[offset2 + 2] << 16) | (heap[offset2 + 3] << 24)

        const soundData = heap.subarray(intSndOffset, intSndOffset + length)

        const writer = new BinaryWriter(soundData.length + 44, 'little')
        writer.writeChars('RIFF')
        writer.writeUInt32(soundData.length + 36)
        writer.writeChars('WAVE')
        writer.writeChars('fmt ')
        writer.writeUInt32(16)

        let wavFormat = 0
        switch (format) {
            case this.fmodModule.SOUND_FORMAT_PCM8:
            case this.fmodModule.SOUND_FORMAT_PCM16:
            case this.fmodModule.SOUND_FORMAT_PCM24:
            case this.fmodModule.SOUND_FORMAT_PCM32:
                wavFormat = 1
                break
            case this.fmodModule.SOUND_FORMAT_PCMFLOAT:
                wavFormat = 3
                break
            default:
                console.error(`Unsupported sound format ${format}!`)
                return null
        }
        writer.writeUInt16(wavFormat)
        writer.writeUInt16(channels)
        writer.writeUInt32(sampleRate)
        writer.writeUInt32((sampleRate * channels * bits) / 8)
        writer.writeUInt16((channels * bits) / 8)
        writer.writeUInt16(bits)
        writer.writeChars('data')
        writer.writeUInt32(soundData.length)
        writer.write(soundData)

        return writer.data
    }

    async _initModule() {
        return new Promise((resolve) => {
            if (typeof window.global_fmodModule !== 'undefined') {
                this.fmodModule = window.global_fmodModule
            }
            if (typeof window.global_fmodSystem !== 'undefined') {
                this.system = window.global_fmodSystem
            }
            if (this.fmodModule != null && this.system != null) {
                resolve()
                return
            }
            this.fmodModule = {}
            this.system = {}
            this.fmodModule['preRun'] = () => {}
            this.fmodModule['onRuntimeInitialized'] = () => {
                const systemOut = {}
                if (this.fmodModule.System_Create(systemOut) !== 0) {
                    console.error('Failed to initialize FMOD system')
                }
                this.system = systemOut.val
                if (this.system.init(1024, this.fmodModule.INIT_NORMAL, null) !== 0) {
                    console.error('Failed to initialize FMOD system')
                }
                window.global_fmodModule = this.fmodModule
                window.global_fmodSystem = this.system
                resolve()
            }
            this.fmodModule['INITIAL_MEMORY'] = 64 * 1024 * 1024
            FMODModule(this.fmodModule)
        })
    }

    async reset() {
        window.global_fmodModule = undefined
        window.global_fmodSystem = undefined
        await this._initModule()
    }
}
