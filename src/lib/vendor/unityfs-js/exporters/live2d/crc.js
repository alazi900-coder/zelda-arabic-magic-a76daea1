// IEEE 802.3 CRC32 implementation
function makeCRCTable() {
    let c
    const crcTable = []
    for (let n = 0; n < 256; n++) {
        c = n
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        crcTable[n] = c
    }
    return crcTable
}
const crcTable = makeCRCTable()

export function crc32(str) {
    let crc = 0 ^ -1
    for (let i = 0; i < str.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xff]
    }
    return (crc ^ -1) >>> 0
}
