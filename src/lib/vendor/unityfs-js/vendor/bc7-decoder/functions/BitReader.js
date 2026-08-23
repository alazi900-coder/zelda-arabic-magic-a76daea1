export default class BitReader {
    constructor(blockUint8Array, byteOffset = 0) {
        this.data = new Uint32Array(4)
        const readUInt32 = (arr, offset) => {
            return (arr[offset] | (arr[offset + 1] << 8) | (arr[offset + 2] << 16) | (arr[offset + 3] << 24)) >>> 0
        }
        this.data[0] = readUInt32(blockUint8Array, byteOffset + 0)
        this.data[1] = readUInt32(blockUint8Array, byteOffset + 4)
        this.data[2] = readUInt32(blockUint8Array, byteOffset + 8)
        this.data[3] = readUInt32(blockUint8Array, byteOffset + 12)
    }

    read(offset, count) {
        let wordIdx = offset >>> 5
        let bitIdx = offset & 31

        let result = this.data[wordIdx] >>> bitIdx
        let bitsRead = 32 - bitIdx

        if (bitsRead < count && wordIdx < 3) {
            result |= this.data[wordIdx + 1] << bitsRead
        }

        if (count === 32) return result >>> 0
        return (result & ((1 << count) - 1)) >>> 0
    }
}
