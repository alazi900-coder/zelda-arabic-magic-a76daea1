import { Vector2, Vector3, Vector4, Quaternion, Color, Matrix4x4 } from '../unityfs/basicTypes.js'
import { decodeUTF8 } from './utf8.js'

export const SEEK_SET = 0
export const SEEK_CUR = 1
export const SEEK_END = 2

export class BinaryReader {
    /**
     * Creates a new BinaryReader.
     * @param {Uint8Array} data Input data.
     * @param {string} endian 'big' or 'little'
     */
    constructor(data, endian = 'big') {
        this.data = data
        this.offset = 0
        this.endian = endian
        this.version = [0, 0, 0, 0]
        this.platform = 'No Target'

        // 实例隔离的二进制缓冲区，防范并发场景下的全局单例数据竞争/污染
        this.floatBuf = new ArrayBuffer(8)
        this.floatU8 = new Uint8Array(this.floatBuf)
        this.floatF32 = new Float32Array(this.floatBuf)
        this.floatF64 = new Float64Array(this.floatBuf)
        this.floatU32 = new Uint32Array(this.floatBuf)
        this.floatI64 = new BigInt64Array(this.floatBuf)
        this.floatU64 = new BigUint64Array(this.floatBuf)
    }

    /**
     * Moves the cursor to the specified offset.
     * @param {number} pos
     * @param {number} mode SEEK_SET, SEEK_CUR, or SEEK_END
     */
    seek(pos, mode = SEEK_SET) {
        switch (mode) {
            case SEEK_SET:
                this.offset = pos
                break
            case SEEK_CUR:
                this.offset += pos
                break
            case SEEK_END:
                this.offset = this.data.length
                break
        }
        this.validateCursor()
    }

    tell() {
        return this.offset
    }

    get size() {
        return this.data.length
    }

    align(alignment) {
        let offset = this.offset
        let mod = offset % alignment
        if (mod !== 0) {
            this.seek(alignment - mod, SEEK_CUR)
        }
    }

    alignStream() {
        const mod = this.offset % 4
        if (mod !== 0) {
            this.offset += 4 - mod
        }
    }

    validateCursor() {
        if (this.offset < 0) {
            throw new Error('Cursor cannot be negative')
        }
        if (this.offset > this.data.length) {
            throw new Error('Cursor cannot be past end of data')
        }
    }

    read(length) {
        if (this.data.length < this.offset + length) throw new Error('Range error: read out of bounds')
        if (length < 32) {
            return this.data.slice(this.offset, (this.offset += length))
        } else {
            return this.data.subarray(this.offset, (this.offset += length))
        }
    }

    readCopy(length) {
        if (this.data.length < this.offset + length) throw new Error('Range error: readCopy out of bounds')
        return this.data.subarray(this.offset, (this.offset += length))
    }

    readRaw(offset, size) {
        return this.data.subarray(offset, offset + size)
    }

    readCString(limit = 32768) {
        let s = ''
        let i = 0
        const len = this.data.length
        // 零对象分配优化：直接索引基础类型数组读取，规避临时对象生成产生的 GC 开销
        while (this.offset < len) {
            const c = this.data[this.offset++]
            if (c === 0) break
            s += String.fromCharCode(c)
            i++
            if (i > limit) break
        }
        return s
    }

    readCodeString(nbytes, encoding) {
        if (this.offset + nbytes > this.data.length) {
            throw new Error('Range error: readCodeString out of bounds')
        }
        const start = this.offset
        this.offset += nbytes

        if (encoding === 'ascii') {
            let str = ''
            for (let i = start; i < this.offset; i++) {
                str += String.fromCharCode(this.data[i])
            }
            return str
        } else if (encoding === 'utf16le') {
            let str = ''
            for (let i = start; i < this.offset; i += 2) {
                const code = this.data[i] + (this.data[i + 1] << 8)
                str += String.fromCharCode(code)
            }
            return str
        } else if (encoding === 'utf-8') {
            return decodeUTF8(this.data.subarray(start, this.offset))
        } else {
            throw new Error("Unsupported encoding type. Use 'ascii', 'utf16le', or 'utf-8'.")
        }
    }

    readChars(count) {
        if (this.offset + count > this.data.length) {
            throw new Error('Range error: readChars out of bounds')
        }
        const start = this.offset
        this.offset += count
        // 零拷贝优化：直接在 underlying 数组切片上进行 UTF-8 混合解码
        return decodeUTF8(this.data.subarray(start, this.offset))
    }

    readString() {
        return this.readChars(this.readUInt32()).split('\0')[0]
    }

    readVarString() {
        return this.readChars(this.readVarInt()).split('\0')[0]
    }

    readAlignedString() {
        let s = this.readChars(this.readUInt32())
        this.align(4)
        return s
    }

    readBool() {
        return this.read(1)[0] === 1
    }

    readUInt8() {
        return this.read(1)[0]
    }

    readInt8() {
        if (this.data.length < this.offset + 1) {
            throw new Error('Range error: readInt8 out of bounds')
        }
        let result = this.data[this.offset]
        this.offset += 1
        return result
    }

    readUNorm8() {
        return this.readUInt8() / 0xff
    }

    readNorm8() {
        return this.readInt8() / 0xff
    }

    readUInt16() {
        if (this.data.length < this.offset + 2) {
            throw new Error('Range error: readUInt16 out of bounds')
        }
        let result
        if (this.endian === 'little') {
            result = this.data[this.offset] + (this.data[this.offset + 1] << 8)
        } else {
            result = this.data[this.offset + 1] + (this.data[this.offset] << 8)
        }
        this.offset += 2
        return result
    }

    readInt16() {
        let result = this.readUInt16()
        if (result & 0x8000) {
            result = -((result - 1) ^ 0xffff)
        }
        return result
    }

    readUNorm16() {
        return this.readUInt16() / 0xffff
    }

    readNorm16() {
        return this.readUInt16() / 0xffff
    }

    readUInt32() {
        if (this.data.length < this.offset + 4) {
            throw new Error('Range error: readUInt32 out of bounds')
        }
        let result
        if (this.endian === 'little') {
            result =
                this.data[this.offset] +
                (this.data[this.offset + 1] << 8) +
                (this.data[this.offset + 2] << 16) +
                (this.data[this.offset + 3] << 24)
        } else {
            result =
                this.data[this.offset + 3] +
                (this.data[this.offset + 2] << 8) +
                (this.data[this.offset + 1] << 16) +
                (this.data[this.offset] << 24)
        }
        this.offset += 4
        return result >>> 0
    }

    readInt32() {
        let result = this.readUInt32()
        if (result & 0x80000000) {
            result = -((result - 1) ^ 0xffffffff)
        }
        return result
    }

    readUInt64() {
        if (this.data.length < this.offset + 8) {
            throw new Error('Range error: readUInt64 out of bounds')
        }
        const currentOffset = this.offset
        const u8 = this.floatU8
        // 循环展开优化：避免 V8 循环计算开销，直接平铺装载
        if (this.endian === 'little') {
            u8[0] = this.data[currentOffset]
            u8[1] = this.data[currentOffset + 1]
            u8[2] = this.data[currentOffset + 2]
            u8[3] = this.data[currentOffset + 3]
            u8[4] = this.data[currentOffset + 4]
            u8[5] = this.data[currentOffset + 5]
            u8[6] = this.data[currentOffset + 6]
            u8[7] = this.data[currentOffset + 7]
        } else {
            u8[0] = this.data[currentOffset + 7]
            u8[1] = this.data[currentOffset + 6]
            u8[2] = this.data[currentOffset + 5]
            u8[3] = this.data[currentOffset + 4]
            u8[4] = this.data[currentOffset + 3]
            u8[5] = this.data[currentOffset + 2]
            u8[6] = this.data[currentOffset + 1]
            u8[7] = this.data[currentOffset]
        }
        this.offset += 8
        return this.floatU64[0]
    }

    readInt64() {
        if (this.data.length < this.offset + 8) {
            throw new Error('Range error: readInt64 out of bounds')
        }
        const currentOffset = this.offset
        const u8 = this.floatU8
        if (this.endian === 'little') {
            u8[0] = this.data[currentOffset]
            u8[1] = this.data[currentOffset + 1]
            u8[2] = this.data[currentOffset + 2]
            u8[3] = this.data[currentOffset + 3]
            u8[4] = this.data[currentOffset + 4]
            u8[5] = this.data[currentOffset + 5]
            u8[6] = this.data[currentOffset + 6]
            u8[7] = this.data[currentOffset + 7]
        } else {
            u8[0] = this.data[currentOffset + 7]
            u8[1] = this.data[currentOffset + 6]
            u8[2] = this.data[currentOffset + 5]
            u8[3] = this.data[currentOffset + 4]
            u8[4] = this.data[currentOffset + 3]
            u8[5] = this.data[currentOffset + 2]
            u8[6] = this.data[currentOffset + 1]
            u8[7] = this.data[currentOffset]
        }
        this.offset += 8
        return this.floatI64[0]
    }

    readVarInt() {
        let result = 0
        let bitsRead = 0
        let value
        do {
            value = this.readUInt8()
            result |= (value & 0x7f) << bitsRead
            bitsRead += 7
        } while (value & 0x80)
        return result
    }

    readFloat16() {
        if (this.data.length < this.offset + 2) {
            throw new Error('Range error: readFloat16 out of bounds')
        }
        let raw
        if (this.endian === 'little') {
            raw = this.data[this.offset] + (this.data[this.offset + 1] << 8)
        } else {
            raw = this.data[this.offset + 1] + (this.data[this.offset] << 8)
        }
        this.offset += 2

        const w = raw * 65536
        const sign = w & 0x80000000
        const nonsign = w & 0x7fffffff
        let renormShift = Math.clz32(nonsign)
        renormShift = renormShift > 5 ? renormShift - 5 : 0
        const infNanMask = ((nonsign + 0x04000000) >> 8) & 0x7f800000
        const zeroMask = (nonsign - 1) >> 31
        const intVal =
            sign | (((((nonsign << renormShift) >> 3) + ((0x70 - renormShift) << 23)) | infNanMask) & ~zeroMask)

        this.floatU32[0] = intVal
        return this.floatF32[0]
    }

    readFloat32() {
        if (this.data.length < this.offset + 4) {
            throw new Error('Range error: readFloat32 out of bounds')
        }
        const currentOffset = this.offset
        const u8 = this.floatU8
        if (this.endian === 'little') {
            u8[0] = this.data[currentOffset]
            u8[1] = this.data[currentOffset + 1]
            u8[2] = this.data[currentOffset + 2]
            u8[3] = this.data[currentOffset + 3]
        } else {
            u8[0] = this.data[currentOffset + 3]
            u8[1] = this.data[currentOffset + 2]
            u8[2] = this.data[currentOffset + 1]
            u8[3] = this.data[currentOffset]
        }
        this.offset += 4
        return this.floatF32[0]
    }

    readFloat64() {
        if (this.data.length < this.offset + 8) {
            throw new Error('Range error: readFloat64 out of bounds')
        }
        const currentOffset = this.offset
        const u8 = this.floatU8
        if (this.endian === 'little') {
            u8[0] = this.data[currentOffset]
            u8[1] = this.data[currentOffset + 1]
            u8[2] = this.data[currentOffset + 2]
            u8[3] = this.data[currentOffset + 3]
            u8[4] = this.data[currentOffset + 4]
            u8[5] = this.data[currentOffset + 5]
            u8[6] = this.data[currentOffset + 6]
            u8[7] = this.data[currentOffset + 7]
        } else {
            u8[0] = this.data[currentOffset + 7]
            u8[1] = this.data[currentOffset + 6]
            u8[2] = this.data[currentOffset + 5]
            u8[3] = this.data[currentOffset + 4]
            u8[4] = this.data[currentOffset + 3]
            u8[5] = this.data[currentOffset + 2]
            u8[6] = this.data[currentOffset + 1]
            u8[7] = this.data[currentOffset]
        }
        this.offset += 8
        return this.floatF64[0]
    }

    readArrayT(reader, length) {
        if (length === undefined) {
            length = this.readUInt32()
        }
        let arr = new Array(length)
        for (let i = 0; i < length; i++) {
            arr[i] = reader()
        }
        return arr
    }

    readVector2() {
        return new Vector2(this.readFloat32(), this.readFloat32())
    }

    readIVector2() {
        return new Vector2(this.readInt32(), this.readInt32())
    }

    readVector3() {
        return new Vector3(this.readFloat32(), this.readFloat32(), this.readFloat32())
    }

    readIVector3() {
        return new Vector3(this.readInt32(), this.readInt32(), this.readInt32())
    }

    readVector4() {
        return new Vector4(this.readFloat32(), this.readFloat32(), this.readFloat32(), this.readFloat32())
    }

    readIVector4() {
        return new Vector4(this.readInt32(), this.readInt32(), this.readInt32(), this.readInt32())
    }

    readQuaternion() {
        return new Quaternion(this.readFloat32(), this.readFloat32(), this.readFloat32(), this.readFloat32())
    }

    readColor() {
        return new Color(this.readFloat32(), this.readFloat32(), this.readFloat32(), this.readFloat32())
    }

    readByteColor() {
        return new Color(
            this.readUInt8() / 0xff,
            this.readUInt8() / 0xff,
            this.readUInt8() / 0xff,
            this.readUInt8() / 0xff,
        )
    }

    readMatrix() {
        return new Matrix4x4(this.readArrayT(this.readFloat32.bind(this), 16))
    }

    readGUID() {
        const bytes = this.read(16)
        let guid = ''
        for (let i = 0; i < 16; i++) {
            const hex = bytes[i].toString(16)
            guid += hex.length === 1 ? '0' + hex : hex
        }
        return guid
    }

    readStringArray(length = -1) {
        if (length === -1) {
            length = this.readInt32()
        }
        return this.readArrayT(() => this.readAlignedString(), length)
    }

    /**
     * Create a scoped sub-reader that cannot mutate this reader's cursor offset.
     * Provides cursor safety for parallel parsing.
     * @param {number} offset Relative offset to slice from
     * @param {number} length Length of sliced sub-stream
     * @returns {BinaryReader}
     */
    slice(offset, length) {
        if (this.offset + offset + length > this.data.length) {
            throw new Error('Range error: slice out of bounds')
        }
        const subData = this.data.subarray(this.offset + offset, this.offset + offset + length)
        const subReader = new BinaryReader(subData, this.endian)
        subReader.version = this.version
        subReader.platform = this.platform
        return subReader
    }
}

export const BinaryStream = BinaryReader
