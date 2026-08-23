export const SEEK_SET = 0
export const SEEK_CUR = 1
export const SEEK_END = 2

const utf8Encoder = new TextEncoder()

export class BinaryWriter {
    constructor(length, endian = 'big', extendSize = 32768) {
        this.data = new Uint8Array(length)
        this.offset = 0
        this.endian = endian
        this.extendSize = extendSize
        this.size = 0
    }

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

    align(alignment) {
        let offset = this.tell()
        let mod = offset % alignment
        if (mod !== 0) {
            this.write(new Uint8Array(alignment - mod))
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

    write(data) {
        if (this.offset + data.length > this.data.length) {
            let newData = new Uint8Array(
                this.data.length + ((Math.ceil(data.length / this.extendSize) * this.extendSize) | 0),
            )
            newData.set(this.data)
            this.data = newData
        }
        this.data.set(data, this.offset)
        this.offset += data.length
        if (this.offset > this.size) {
            this.size = this.offset
        }
    }

    writeRaw(data, offset) {
        this.data.set(data, offset)
    }

    getData() {
        return this.data.slice(0, this.size)
    }

    writeCString(str) {
        let totalArray = new Uint8Array(str.length + 1)
        totalArray.set(utf8Encoder.encode(str), 0)
        totalArray[str.length] = 0
        this.write(totalArray)
    }

    writeChars(chars) {
        this.write(utf8Encoder.encode(chars))
    }

    writeAlignedString(str) {
        this.writeInt32(str.length)
        this.writeChars(str)
        this.align(4)
    }

    writeT(type, value, length) {
        const buf = new ArrayBuffer(length)
        const u8 = new Uint8Array(buf)

        if (type === 'Uint8') {
            u8[0] = value
        } else if (type === 'Int8') {
            const i8 = new Int8Array(buf)
            i8[0] = value
        } else if (type === 'Uint16') {
            const u16 = new Uint16Array(buf)
            u16[0] = value
        } else if (type === 'Int16') {
            const i16 = new Int16Array(buf)
            i16[0] = value
        } else if (type === 'Uint32') {
            const u32 = new Uint32Array(buf)
            u32[0] = value
        } else if (type === 'Int32') {
            const i32 = new Int32Array(buf)
            i32[0] = value
        } else if (type === 'BigUint64') {
            const u64 = new BigUint64Array(buf)
            u64[0] = BigInt(value)
        } else if (type === 'BigInt64') {
            const i64 = new BigInt64Array(buf)
            i64[0] = BigInt(value)
        } else if (type === 'Float32') {
            const f32 = new Float32Array(buf)
            f32[0] = value
        } else if (type === 'Float64') {
            const f64 = new Float64Array(buf)
            f64[0] = value
        }

        if (this.endian === 'big') {
            u8.reverse()
        }

        this.write(u8)
    }

    writeBool(val) {
        this.writeUInt8(val ? 1 : 0)
    }

    writeUInt8(val) {
        this.writeT('Uint8', val, 1)
    }
    writeInt8(val) {
        this.writeT('Int8', val, 1)
    }
    writeUNorm8(val) {
        this.writeUInt8(Math.floor(val * 0xff))
    }
    writeNorm8(val) {
        this.writeInt8(Math.floor(val * 0xff))
    }
    writeUInt16(val) {
        this.writeT('Uint16', val, 2)
    }
    writeInt16(val) {
        this.writeT('Int16', val, 2)
    }
    writeUNorm16(val) {
        this.writeUInt16(Math.floor(val * 0xffff))
    }
    writeNorm16(val) {
        this.writeInt16(Math.floor(val * 0xffff))
    }
    writeUInt32(val) {
        this.writeT('Uint32', val, 4)
    }
    writeInt32(val) {
        this.writeT('Int32', val, 4)
    }
    writeUInt64(val) {
        this.writeT('BigUint64', val, 8)
    }
    writeInt64(val) {
        this.writeT('BigInt64', val, 8)
    }
    writeFloat32(val) {
        this.writeT('Float32', val, 4)
    }
    writeFloat64(val) {
        this.writeT('Float64', val, 8)
    }

    writeArrayT(writer, val, length) {
        if (length === undefined) {
            length = val.length
            this.writeUInt32(length)
        }
        for (let i = 0; i < length; i++) {
            writer(val[i])
        }
    }

    writeVector2(val) {
        this.writeFloat32(val.x)
        this.writeFloat32(val.y)
    }
    writeIVector2(val) {
        this.writeInt32(val.x)
        this.writeInt32(val.y)
    }
    writeVector3(val) {
        this.writeFloat32(val.x)
        this.writeFloat32(val.y)
        this.writeFloat32(val.z)
    }
    writeIVector3(val) {
        this.writeInt32(val.x)
        this.writeInt32(val.y)
        this.writeInt32(val.z)
    }
    writeVector4(val) {
        this.writeFloat32(val.x)
        this.writeFloat32(val.y)
        this.writeFloat32(val.z)
        this.writeFloat32(val.w)
    }
    writeIVector4(val) {
        this.writeInt32(val.x)
        this.writeInt32(val.y)
        this.writeInt32(val.z)
        this.writeInt32(val.w)
    }
    writeQuaternion(val) {
        this.writeFloat32(val.x)
        this.writeFloat32(val.y)
        this.writeFloat32(val.z)
        this.writeFloat32(val.w)
    }
    writeColor(val) {
        this.writeFloat32(val.r)
        this.writeFloat32(val.g)
        this.writeFloat32(val.b)
        this.writeFloat32(val.a)
    }
    writeByteColor(val) {
        this.writeUInt8(Math.floor(val.r / 255))
        this.writeUInt8(Math.floor(val.g / 255))
        this.writeUInt8(Math.floor(val.b / 255))
        this.writeUInt8(Math.floor(val.a / 255))
    }
    writeMatrix(val) {
        this.writeArrayT(this.writeFloat32.bind(this), val, 16)
    }
}
