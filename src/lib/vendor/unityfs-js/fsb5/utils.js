// Ogg CRC32 variant implementation (polynomial 0x04C11DB7, direct algorithm)

function makeOggCRCTable() {
    const polynomial = 0x04c11db7
    const CRCTable = new Uint32Array(256)

    for (let i = 0; i < 256; i++) {
        let crc = i << 24
        for (let j = 0; j < 8; j++) {
            crc = crc & 0x80000000 ? polynomial ^ (crc << 1) : crc << 1
        }
        CRCTable[i] = crc >>> 0
    }
    return CRCTable
}

const OGG_CRC_TABLE = makeOggCRCTable()

export function computeOggCRC(data) {
    let crc = 0
    for (let i = 0; i < data.length; i++) {
        crc = (crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xff]
    }
    return crc >>> 0
}
