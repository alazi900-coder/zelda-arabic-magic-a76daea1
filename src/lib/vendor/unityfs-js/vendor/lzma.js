const LZMA = {}

class OutWindow {
    constructor() {
        this._windowSize = 0
        this._buffer = null
        this._pos = 0
        this._streamPos = 0
        this._stream = null
    }

    create(windowSize) {
        if (!this._buffer || this._windowSize !== windowSize) {
            this._buffer = new Uint8Array(windowSize)
        }
        this._windowSize = windowSize
        this._pos = 0
        this._streamPos = 0
    }

    flush() {
        const size = this._pos - this._streamPos
        if (size !== 0) {
            this._stream.write(this._buffer.subarray(this._streamPos, this._pos))
            this._streamPos = this._pos
            if (this._pos >= this._windowSize) {
                this._pos = 0
                this._streamPos = 0
            }
        }
    }

    releaseStream() {
        this.flush()
        this._stream = null
    }

    setStream(stream) {
        this.releaseStream()
        this._stream = stream
    }

    init(solid) {
        if (!solid) {
            this._streamPos = 0
            this._pos = 0
        }
    }

    copyBlock(distance, len) {
        let pos = this._pos - distance - 1
        if (pos < 0) {
            pos += this._windowSize
        }

        // PERFORMANCE: Native memory block copy for non-overlapping, non-wrapping segments
        if (distance >= len && pos + len <= this._windowSize && this._pos + len <= this._windowSize) {
            this._buffer.copyWithin(this._pos, pos, pos + len)
            this._pos += len
            if (this._pos >= this._windowSize) {
                this.flush()
            }
            return
        }

        // Fallback: byte-by-byte copy for overlapping (repeating) segments or boundary wrapping
        while (len--) {
            if (pos >= this._windowSize) pos = 0
            this._buffer[this._pos++] = this._buffer[pos++]
            if (this._pos >= this._windowSize) {
                this.flush()
            }
        }
    }

    putByte(b) {
        this._buffer[this._pos++] = b
        if (this._pos >= this._windowSize) {
            this.flush()
        }
    }

    getByte(distance) {
        let pos = this._pos - distance - 1
        if (pos < 0) pos += this._windowSize
        return this._buffer[pos]
    }
}
LZMA.OutWindow = OutWindow

class RangeDecoder {
    constructor() {
        this._stream = null
        this._code = 0
        this._range = -1
    }

    setStream(stream) {
        this._stream = stream
    }
    releaseStream() {
        this._stream = null
    }

    init() {
        this._code = 0
        this._range = -1

        const data = this._stream.data
        let offset = this._stream.offset
        for (let i = 0; i < 5; i++) {
            this._code = (this._code << 8) | data[offset++]
        }
        this._stream.offset = offset
    }

    decodeDirectBits(numTotalBits) {
        let result = 0
        let i = numTotalBits
        const data = this._stream.data
        let offset = this._stream.offset

        while (i--) {
            this._range >>>= 1
            const t = (this._code - this._range) >>> 31
            this._code -= this._range & (t - 1)
            result = (result << 1) | (1 - t)

            if ((this._range & 0xff000000) === 0) {
                this._code = (this._code << 8) | data[offset++]
                this._range <<= 8
            }
        }
        this._stream.offset = offset
        return result
    }

    decodeBit(probs, index) {
        const prob = probs[index]
        const newBound = (this._range >>> 11) * prob

        // PERFORMANCE: Used >>> 0 for direct unsigned JIT comparison instead of XOR 0x80000000 hacks
        if (this._code >>> 0 < newBound >>> 0) {
            this._range = newBound
            probs[index] = prob + ((2048 - prob) >>> 5)
            if ((this._range & 0xff000000) === 0) {
                this._code = (this._code << 8) | this._stream.data[this._stream.offset++]
                this._range <<= 8
            }
            return 0
        }

        this._range -= newBound
        this._code -= newBound
        probs[index] = prob - (prob >>> 5)
        if ((this._range & 0xff000000) === 0) {
            this._code = (this._code << 8) | this._stream.data[this._stream.offset++]
            this._range <<= 8
        }
        return 1
    }
}
LZMA.RangeDecoder = RangeDecoder

LZMA.initBitModels = function (probs, len) {
    probs.fill(1024)
}

class BitTreeDecoder {
    constructor(numBitLevels) {
        this._models = new Uint16Array(1 << numBitLevels)
        this._numBitLevels = numBitLevels
    }

    init() {
        this._models.fill(1024)
    }

    decode(rangeDecoder) {
        let m = 1
        let i = this._numBitLevels
        while (i--) {
            m = (m << 1) | rangeDecoder.decodeBit(this._models, m)
        }
        return m - (1 << this._numBitLevels)
    }

    reverseDecode(rangeDecoder) {
        let m = 1
        let symbol = 0
        for (let i = 0; i < this._numBitLevels; ++i) {
            const bit = rangeDecoder.decodeBit(this._models, m)
            m = (m << 1) | bit
            symbol |= bit << i
        }
        return symbol
    }
}
LZMA.BitTreeDecoder = BitTreeDecoder

LZMA.reverseDecode2 = function (models, startIndex, rangeDecoder, numBitLevels) {
    let m = 1
    let symbol = 0
    for (let i = 0; i < numBitLevels; ++i) {
        const bit = rangeDecoder.decodeBit(models, startIndex + m)
        m = (m << 1) | bit
        symbol |= bit << i
    }
    return symbol
}

class LenDecoder {
    constructor() {
        this._choice = new Uint16Array(2)
        this._lowCoder = []
        this._midCoder = []
        this._highCoder = new BitTreeDecoder(8)
        this._numPosStates = 0
    }

    create(numPosStates) {
        for (; this._numPosStates < numPosStates; ++this._numPosStates) {
            this._lowCoder[this._numPosStates] = new BitTreeDecoder(3)
            this._midCoder[this._numPosStates] = new BitTreeDecoder(3)
        }
    }

    init() {
        this._choice.fill(1024)
        for (let i = this._numPosStates - 1; i >= 0; i--) {
            this._lowCoder[i].init()
            this._midCoder[i].init()
        }
        this._highCoder.init()
    }

    decode(rangeDecoder, posState) {
        if (rangeDecoder.decodeBit(this._choice, 0) === 0) {
            return this._lowCoder[posState].decode(rangeDecoder)
        }
        if (rangeDecoder.decodeBit(this._choice, 1) === 0) {
            return 8 + this._midCoder[posState].decode(rangeDecoder)
        }
        return 16 + this._highCoder.decode(rangeDecoder)
    }
}
LZMA.LenDecoder = LenDecoder

class LiteralDecoder {
    constructor() {
        this._coders = null
        this._numPrevBits = 0
        this._numPosBits = 0
        this._posMask = 0
    }

    create(numPosBits, numPrevBits) {
        if (this._coders && this._numPrevBits === numPrevBits && this._numPosBits === numPosBits) {
            return
        }
        this._numPosBits = numPosBits
        this._posMask = (1 << numPosBits) - 1
        this._numPrevBits = numPrevBits

        const size = 1 << (this._numPrevBits + this._numPosBits)
        this._coders = new Uint16Array(size * 0x300)
    }

    init() {
        this._coders.fill(1024)
    }

    getCoderOffset(pos, prevByte) {
        return (((pos & this._posMask) << this._numPrevBits) + ((prevByte & 0xff) >>> (8 - this._numPrevBits))) * 0x300
    }

    decodeNormal(probs, offset, rangeDecoder) {
        let symbol = 1
        do {
            symbol = (symbol << 1) | rangeDecoder.decodeBit(probs, offset + symbol)
        } while (symbol < 0x100)
        return symbol & 0xff
    }

    decodeWithMatchByte(probs, offset, rangeDecoder, matchByte) {
        let symbol = 1
        do {
            const matchBit = (matchByte >> 7) & 1
            matchByte <<= 1
            const bit = rangeDecoder.decodeBit(probs, offset + (((1 + matchBit) << 8) + symbol))
            symbol = (symbol << 1) | bit
            if (matchBit !== bit) {
                while (symbol < 0x100) {
                    symbol = (symbol << 1) | rangeDecoder.decodeBit(probs, offset + symbol)
                }
                break
            }
        } while (symbol < 0x100)
        return symbol & 0xff
    }
}
LZMA.LiteralDecoder = LiteralDecoder

class Decoder {
    constructor() {
        this._outWindow = new OutWindow()
        this._rangeDecoder = new RangeDecoder()
        this._isMatchDecoders = new Uint16Array(192)
        this._isRepDecoders = new Uint16Array(12)
        this._isRepG0Decoders = new Uint16Array(12)
        this._isRepG1Decoders = new Uint16Array(12)
        this._isRepG2Decoders = new Uint16Array(12)
        this._isRep0LongDecoders = new Uint16Array(192)
        this._posSlotDecoder = [
            new BitTreeDecoder(6),
            new BitTreeDecoder(6),
            new BitTreeDecoder(6),
            new BitTreeDecoder(6),
        ]
        this._posDecoders = new Uint16Array(114)
        this._posAlignDecoder = new BitTreeDecoder(4)
        this._lenDecoder = new LenDecoder()
        this._repLenDecoder = new LenDecoder()
        this._literalDecoder = new LiteralDecoder()
        this._dictionarySize = -1
        this._dictionarySizeCheck = -1
    }

    setDictionarySize(dictionarySize) {
        if (dictionarySize < 0) return false

        if (this._dictionarySize !== dictionarySize) {
            this._dictionarySize = dictionarySize
            this._dictionarySizeCheck = Math.max(this._dictionarySize, 1)
            this._outWindow.create(Math.max(this._dictionarySizeCheck, 4096))
        }
        return true
    }

    setLcLpPb(lc, lp, pb) {
        const numPosStates = 1 << pb
        if (lc > 8 || lp > 4 || pb > 4) return false

        this._literalDecoder.create(lp, lc)
        this._lenDecoder.create(numPosStates)
        this._repLenDecoder.create(numPosStates)
        this._posStateMask = numPosStates - 1

        return true
    }

    init() {
        this._outWindow.init(false)
        this._isMatchDecoders.fill(1024)
        this._isRep0LongDecoders.fill(1024)
        this._isRepDecoders.fill(1024)
        this._isRepG0Decoders.fill(1024)
        this._isRepG1Decoders.fill(1024)
        this._isRepG2Decoders.fill(1024)
        this._posDecoders.fill(1024)

        this._literalDecoder.init()
        for (let i = 0; i < 4; i++) {
            this._posSlotDecoder[i].init()
        }

        this._lenDecoder.init()
        this._repLenDecoder.init()
        this._posAlignDecoder.init()
        this._rangeDecoder.init()
    }

    decode(inStream, outStream, outSize) {
        let state = 0
        let rep0 = 0
        let rep1 = 0
        let rep2 = 0
        let rep3 = 0
        let nowPos64 = 0
        let prevByte = 0

        this._rangeDecoder.setStream(inStream)
        this._outWindow.setStream(outStream)
        this.init()

        while (outSize < 0 || nowPos64 < outSize) {
            const posState = nowPos64 & this._posStateMask

            if (this._rangeDecoder.decodeBit(this._isMatchDecoders, (state << 4) + posState) === 0) {
                const coderOffset = this._literalDecoder.getCoderOffset(nowPos64++, prevByte)

                if (state >= 7) {
                    prevByte = this._literalDecoder.decodeWithMatchByte(
                        this._literalDecoder._coders,
                        coderOffset,
                        this._rangeDecoder,
                        this._outWindow.getByte(rep0),
                    )
                } else {
                    prevByte = this._literalDecoder.decodeNormal(
                        this._literalDecoder._coders,
                        coderOffset,
                        this._rangeDecoder,
                    )
                }
                this._outWindow.putByte(prevByte)
                state = state < 4 ? 0 : state - (state < 10 ? 3 : 6)
            } else {
                let len
                if (this._rangeDecoder.decodeBit(this._isRepDecoders, state) === 1) {
                    len = 0
                    if (this._rangeDecoder.decodeBit(this._isRepG0Decoders, state) === 0) {
                        if (this._rangeDecoder.decodeBit(this._isRep0LongDecoders, (state << 4) + posState) === 0) {
                            state = state < 7 ? 9 : 11
                            len = 1
                        }
                    } else {
                        let distance
                        if (this._rangeDecoder.decodeBit(this._isRepG1Decoders, state) === 0) {
                            distance = rep1
                        } else {
                            if (this._rangeDecoder.decodeBit(this._isRepG2Decoders, state) === 0) {
                                distance = rep2
                            } else {
                                distance = rep3
                                rep3 = rep2
                            }
                            rep2 = rep1
                        }
                        rep1 = rep0
                        rep0 = distance
                    }
                    if (len === 0) {
                        len = 2 + this._repLenDecoder.decode(this._rangeDecoder, posState)
                        state = state < 7 ? 8 : 11
                    }
                } else {
                    rep3 = rep2
                    rep2 = rep1
                    rep1 = rep0

                    len = 2 + this._lenDecoder.decode(this._rangeDecoder, posState)
                    state = state < 7 ? 7 : 10

                    const posSlot = this._posSlotDecoder[len <= 5 ? len - 2 : 3].decode(this._rangeDecoder)
                    if (posSlot >= 4) {
                        const numDirectBits = (posSlot >> 1) - 1
                        rep0 = (2 | (posSlot & 1)) << numDirectBits

                        if (posSlot < 14) {
                            rep0 += LZMA.reverseDecode2(
                                this._posDecoders,
                                rep0 - posSlot - 1,
                                this._rangeDecoder,
                                numDirectBits,
                            )
                        } else {
                            rep0 += this._rangeDecoder.decodeDirectBits(numDirectBits - 4) << 4
                            rep0 += this._posAlignDecoder.reverseDecode(this._rangeDecoder)
                            if (rep0 < 0) {
                                if (rep0 === -1) break
                                return false
                            }
                        }
                    } else {
                        rep0 = posSlot
                    }
                }

                if (rep0 >= nowPos64 || rep0 >= this._dictionarySizeCheck) {
                    return false
                }

                this._outWindow.copyBlock(rep0, len)
                nowPos64 += len
                prevByte = this._outWindow.getByte(0)
            }
        }

        this._outWindow.flush()
        this._outWindow.releaseStream()
        this._rangeDecoder.releaseStream()
        return true
    }

    setDecoderProperties(properties) {
        if (properties.size < 5) return false

        let value = properties.readByte()
        const lc = value % 9
        value = ~~(value / 9)
        const lp = value % 5
        const pb = ~~(value / 5)

        if (!this.setLcLpPb(lc, lp, pb)) return false

        let dictionarySize = properties.readByte()
        dictionarySize |= properties.readByte() << 8
        dictionarySize |= properties.readByte() << 16
        dictionarySize += properties.readByte() * 16777216

        return this.setDictionarySize(dictionarySize)
    }
}
LZMA.Decoder = Decoder

LZMA.decompress = function (properties, inStream, outStream, outSize) {
    const decoder = new LZMA.Decoder()
    if (!decoder.setDecoderProperties(properties)) {
        throw new Error('Incorrect stream properties')
    }
    if (!decoder.decode(inStream, outStream, outSize)) {
        throw new Error('Error in data stream')
    }
    return true
}

class BasicStream {
    constructor(data, length) {
        this.data = data ?? new Uint8Array(length)
        this.offset = 0
    }

    seek(pos) {
        this.offset = pos
    }

    read(nbytes) {
        // PERFORMANCE: Used subarray to prevent creating a completely new Uint8Array copy in memory.
        const chunk = this.data.subarray(this.offset, this.offset + nbytes)
        this.offset += nbytes
        return chunk
    }

    readByte() {
        return this.data[this.offset++]
    }

    write(data) {
        this.data.set(data, this.offset)
        this.offset += data.length
    }

    writeByte(b) {
        this.data[this.offset++] = b
    }
}

export const lzmaDecompress = function (data, rawSize) {
    const dec = new LZMA.Decoder()
    const stream = new BasicStream(data)
    const props = stream.readByte()
    const lc = props % 9
    const rem = Math.floor(props / 9)
    const lp = rem % 5 | 0
    const pb = Math.floor(rem / 5) | 0

    if (pb > 4) {
        throw new Error('`pb` too high in LZMA properties')
    }

    let dictSize = 0
    for (let i = 0; i < 4; i++) {
        dictSize |= stream.readByte() << (i * 8)
    }

    dec.setLcLpPb(lc, lp, pb)
    dec.setDictionarySize(dictSize)

    const outStream = new BasicStream(null, rawSize)
    dec.decode(stream, outStream, rawSize)

    return outStream.data
}

export default LZMA
