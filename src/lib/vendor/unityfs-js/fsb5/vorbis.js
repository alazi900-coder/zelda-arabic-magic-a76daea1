import { lookup } from './vorbis_headers.js'
import { computeOggCRC } from './utils.js'

function base64ToBytes(base64) {
    const binString = atob(base64)
    const len = binString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
        bytes[i] = binString.charCodeAt(i)
    }
    return bytes
}

class BitReader {
    constructor(arrayBuffer) {
        this.bytes = new Uint8Array(arrayBuffer)
        this.bitIdx = 0
    }

    readBit() {
        if (this.bitIdx >= this.bytes.length * 8) return 0
        const byteIdx = Math.floor(this.bitIdx / 8)
        const bitOffset = this.bitIdx % 8
        const bit = (this.bytes[byteIdx] >> bitOffset) & 1
        this.bitIdx++
        return bit
    }

    readBits(numBits) {
        let val = 0
        for (let i = 0; i < numBits; i++) {
            val |= this.readBit() << i
        }
        return val
    }
}

function ilog(v) {
    let ret = 0
    while (v > 0) {
        ret++
        v >>= 1
    }
    return ret
}

function lookup1_values(entries, dim) {
    if (entries === 0 || dim === 0) return 0
    let low = 1
    let high = entries
    let ans = 1
    while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        if (Math.pow(mid, dim) <= entries) {
            ans = mid
            low = mid + 1
        } else {
            high = mid - 1
        }
    }
    return ans
}

function writeUInt32(arr, index, val) {
    arr[index] = val & 0xff
    arr[index + 1] = (val >> 8) & 0xff
    arr[index + 2] = (val >> 16) & 0xff
    arr[index + 3] = (val >> 24) & 0xff
}

function parseVorbisSetupHeader(packet, channels) {
    const reader = new BitReader(packet.buffer)

    const type = reader.readBits(8)
    if (type !== 5) throw new Error('Expected setup header type 5, got ' + type)

    // 'vorbis' (6 bytes)
    for (let i = 0; i < 6; i++) reader.readBits(8)

    // 1. Codebooks
    const codebookCount = reader.readBits(8) + 1
    for (let c = 0; c < codebookCount; c++) {
        const sync = reader.readBits(24)
        if (sync !== 0x564342) throw new Error('Invalid codebook sync: ' + sync)
        const dim = reader.readBits(16)
        const entries = reader.readBits(24)
        const ordered = reader.readBit()
        if (ordered) {
            reader.readBits(5) // length bits
            let current = 0
            while (current < entries) {
                const num = reader.readBits(ilog(entries - current))
                current += num
            }
        } else {
            const sparse = reader.readBit()
            for (let i = 0; i < entries; i++) {
                if (sparse) {
                    if (reader.readBit()) {
                        reader.readBits(5)
                    }
                } else {
                    reader.readBits(5)
                }
            }
        }

        const mapType = reader.readBits(4)
        if (mapType > 0) {
            reader.readBits(32) // min
            reader.readBits(32) // delta
            const valueBits = reader.readBits(4) + 1
            reader.readBit() // sequence_p
            let quantvals = 0
            if (mapType === 1) {
                quantvals = lookup1_values(entries, dim)
            } else {
                quantvals = entries * dim
            }
            for (let i = 0; i < quantvals; i++) {
                reader.readBits(valueBits)
            }
        }
    }

    // 2. Time domain transforms
    const timeCount = reader.readBits(6) + 1
    for (let i = 0; i < timeCount; i++) {
        reader.readBits(16)
    }

    // 3. Floors
    const floorCount = reader.readBits(6) + 1
    for (let f = 0; f < floorCount; f++) {
        const floorType = reader.readBits(16)
        if (floorType === 0) {
            reader.readBits(8) // order
            reader.readBits(16) // rate
            reader.readBits(16) // bark_map_size
            reader.readBits(6) // amplitude_bits
            reader.readBits(8) // amplitude_offset
            const numBooks = reader.readBits(4)
            for (let i = 0; i < numBooks; i++) reader.readBits(8)
        } else if (floorType === 1) {
            const partitions = reader.readBits(5)
            const partitionClass = []
            let maxClass = -1
            for (let i = 0; i < partitions; i++) {
                const cls = reader.readBits(4)
                partitionClass.push(cls)
                if (cls > maxClass) maxClass = cls
            }
            const classDimensions = new Array(maxClass + 1).fill(0)
            const classSubclasses = new Array(maxClass + 1).fill(0)
            const classMasterbooks = new Array(maxClass + 1).fill(0)
            for (let i = 0; i <= maxClass; i++) {
                classDimensions[i] = reader.readBits(3) + 1
                classSubclasses[i] = reader.readBits(2)
                if (classSubclasses[i] > 0) {
                    classMasterbooks[i] = reader.readBits(8)
                }
                for (let j = 0; j < 1 << classSubclasses[i]; j++) {
                    reader.readBits(8) // subclass book
                }
            }
            reader.readBits(2) // multiplier
            const rangebits = reader.readBits(4)
            for (let i = 0; i < partitions; i++) {
                const cls = partitionClass[i]
                const dim = classDimensions[cls]
                for (let j = 0; j < dim; j++) {
                    reader.readBits(rangebits)
                }
            }
        } else {
            throw new Error('Invalid floor type: ' + floorType)
        }
    }

    // 4. Residues
    const residueCount = reader.readBits(6) + 1
    for (let r = 0; r < residueCount; r++) {
        const residueType = reader.readBits(16)
        reader.readBits(24) // begin
        reader.readBits(24) // end
        reader.readBits(24) // partition_size
        const classifications = reader.readBits(6) + 1
        reader.readBits(8) // classbook
        const cascade = []
        for (let i = 0; i < classifications; i++) {
            let temp = reader.readBits(3)
            const bit = reader.readBit()
            if (bit) {
                temp += reader.readBits(5) << 3
            }
            cascade.push(temp)
        }
        for (let i = 0; i < classifications; i++) {
            for (let j = 0; j < 8; j++) {
                if ((cascade[i] & (1 << j)) !== 0) {
                    reader.readBits(8)
                }
            }
        }
    }

    // 5. Mappings
    const mappingCount = reader.readBits(6) + 1
    for (let m = 0; m < mappingCount; m++) {
        const mappingType = reader.readBits(16)
        if (mappingType !== 0) throw new Error('Invalid mapping type: ' + mappingType)
        const submapsFlag = reader.readBit()
        let submaps = 1
        if (submapsFlag) {
            submaps = reader.readBits(4) + 1
        }
        const couplingFlag = reader.readBit()
        if (couplingFlag) {
            const couplingSteps = reader.readBits(8) + 1
            for (let i = 0; i < couplingSteps; i++) {
                reader.readBits(ilog(channels - 1))
                reader.readBits(ilog(channels - 1))
            }
        }
        reader.readBits(2) // reserved
        if (submaps > 1) {
            for (let i = 0; i < channels; i++) {
                reader.readBits(4) // mux
            }
        }
        for (let i = 0; i < submaps; i++) {
            reader.readBits(8) // placeholder
            reader.readBits(8) // floor
            reader.readBits(8) // residue
        }
    }

    // 6. Modes
    const modeCount = reader.readBits(6) + 1
    const modes = []
    for (let i = 0; i < modeCount; i++) {
        const blockflag = reader.readBit()
        const windowtype = reader.readBits(16)
        const transformtype = reader.readBits(16)
        const mapping = reader.readBits(8)
        modes.push({ blockflag, windowtype, transformtype, mapping })
    }

    return modes
}

function getPacketBlocksize(packet, modes, blocksize_0, blocksize_1) {
    const reader = new BitReader(packet.buffer)
    const type = reader.readBit()
    if (type !== 0) {
        return 0
    }
    const modebits = ilog(modes.length - 1)
    const modeIdx = reader.readBits(modebits)
    if (modeIdx >= modes.length) {
        return blocksize_0
    }
    const mode = modes[modeIdx]
    return mode.blockflag ? blocksize_1 : blocksize_0
}

class OggStream {
    constructor(serialNo) {
        this.serialNo = serialNo
        this.pageSeqNo = 0
        this.out = []
        this.packets = []
    }

    writePacket(packetData, granulePos, isBOS = false, isEOS = false, forceFlush = false) {
        this.packets.push({ data: packetData, granulePos })

        let totalSegments = 0
        let totalBytes = 0
        for (const p of this.packets) {
            const segments = Math.ceil(p.data.length / 255) + (p.data.length % 255 === 0 ? 1 : 0)
            totalSegments += segments
            totalBytes += p.data.length
        }

        if (isBOS || isEOS || forceFlush || totalSegments >= 200 || totalBytes >= 4000) {
            this.flushPage(isBOS, isEOS)
        }
    }

    flushPage(isBOS, isEOS) {
        if (this.packets.length === 0) return

        const segmentTable = []
        let totalBytes = 0
        for (const p of this.packets) {
            let len = p.data.length
            while (len >= 255) {
                segmentTable.push(255)
                len -= 255
            }
            segmentTable.push(len)
            totalBytes += p.data.length
        }

        if (segmentTable.length > 255) {
            throw new Error('Ogg page cannot have more than 255 segments')
        }

        const pageSize = 27 + segmentTable.length + totalBytes
        const page = new Uint8Array(pageSize)

        page[0] = 0x4f // O
        page[1] = 0x67 // g
        page[2] = 0x67 // g
        page[3] = 0x53 // S
        page[4] = 0 // version

        let flag = 0
        if (isBOS) flag |= 0x02
        if (isEOS) flag |= 0x04
        page[5] = flag

        const lastGranulePos = this.packets[this.packets.length - 1].granulePos
        const low = lastGranulePos & 0xffffffff
        const high = Math.floor(lastGranulePos / 0x100000000)
        writeUInt32(page, 6, low)
        writeUInt32(page, 10, high)

        writeUInt32(page, 14, this.serialNo)
        writeUInt32(page, 18, this.pageSeqNo++)
        writeUInt32(page, 22, 0) // checksum placeholder
        page[26] = segmentTable.length

        for (let i = 0; i < segmentTable.length; i++) {
            page[27 + i] = segmentTable[i]
        }

        let destOffset = 27 + segmentTable.length
        for (const p of this.packets) {
            page.set(p.data, destOffset)
            destOffset += p.data.length
        }

        const crc = computeOggCRC(page)
        writeUInt32(page, 22, crc)

        this.out.push(page)
        this.packets = []
    }

    getBuffer() {
        if (this.packets.length > 0) {
            this.flushPage(false, false)
        }
        let totalSize = 0
        for (const p of this.out) totalSize += p.length
        const res = new Uint8Array(totalSize)
        let offset = 0
        for (const p of this.out) {
            res.set(p, offset)
            offset += p.length
        }
        return res
    }
}

function makeIdHeader(channels, frequency) {
    const arr = new Uint8Array(30)
    arr[0] = 0x01
    arr[1] = 118 // 'v'
    arr[2] = 111 // 'o'
    arr[3] = 114 // 'r'
    arr[4] = 98 // 'b'
    arr[5] = 105 // 'i'
    arr[6] = 115 // 's'
    writeUInt32(arr, 7, 0) // version
    arr[11] = channels
    writeUInt32(arr, 12, frequency)
    writeUInt32(arr, 16, 0) // max bitrate
    writeUInt32(arr, 20, 0) // nominal bitrate
    writeUInt32(arr, 24, 0) // min bitrate
    arr[28] = 8 | (11 << 4) // blocksize_0 = 8 (256), blocksize_1 = 11 (2048)
    arr[29] = 1 // framing_flag
    return arr
}

function makeCommentHeader() {
    const arr = new Uint8Array(16)
    arr[0] = 0x03
    arr[1] = 118 // 'v'
    arr[2] = 111 // 'o'
    arr[3] = 114 // 'r'
    arr[4] = 98 // 'b'
    arr[5] = 105 // 'i'
    arr[6] = 115 // 's'
    arr[15] = 1 // framing
    return arr
}

export function rebuildVorbis(sample) {
    const vorbisData = sample.metadata[11]
    if (!vorbisData) {
        throw new Error('No VORBISDATA metadata chunk found for Vorbis rebuild')
    }

    const crc32 = vorbisData.crc32 >>> 0
    const b64Setup = lookup[crc32]
    if (!b64Setup) {
        throw new Error(`Vorbis setup header with CRC32 ${crc32} not found in precompiled lookup table`)
    }

    const setupPacket = base64ToBytes(b64Setup)
    const modes = parseVorbisSetupHeader(setupPacket, sample.channels)

    const blocksize_0 = 256
    const blocksize_1 = 2048

    const oggStream = new OggStream(1)

    const idHeader = makeIdHeader(sample.channels, sample.frequency)
    oggStream.writePacket(idHeader, 0, true, false, true)

    const commentHeader = makeCommentHeader()
    oggStream.writePacket(commentHeader, 0, false, false, true)

    oggStream.writePacket(setupPacket, 0, false, false, true)

    const data = sample.data
    let offset = 0

    let prevBlocksize = 0
    let granulepos = 0

    while (offset < data.length) {
        if (offset + 2 > data.length) break
        const packetSize = data[offset] | (data[offset + 1] << 8)
        offset += 2

        if (offset + packetSize > data.length) break
        const packetData = data.subarray(offset, offset + packetSize)
        offset += packetSize

        const isEOS = offset >= data.length
        const blocksize = getPacketBlocksize(packetData, modes, blocksize_0, blocksize_1)
        if (blocksize === 0) {
            // Header or invalid packet, skip granulepos increment
        } else {
            if (prevBlocksize !== 0) {
                granulepos += Math.floor((blocksize + prevBlocksize) / 4)
            } else {
                granulepos = 0
            }
            prevBlocksize = blocksize
        }

        oggStream.writePacket(packetData, granulepos, false, isEOS, false)
    }

    return oggStream.getBuffer()
}
