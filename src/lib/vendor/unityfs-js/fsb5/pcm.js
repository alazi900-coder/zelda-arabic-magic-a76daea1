import { BinaryWriter } from '../core/binaryStream.js'

export function rebuildPcm(sample, format) {
    let bitDepth = 16
    if (format === 1) bitDepth = 8
    else if (format === 2) bitDepth = 16
    else if (format === 3) bitDepth = 24
    else if (format === 4) bitDepth = 32

    const data = sample.data
    const writer = new BinaryWriter(44 + data.length, 'little')

    // RIFF header
    writer.writeChars('RIFF')
    writer.writeUInt32(36 + data.length)
    writer.writeChars('WAVE')

    // fmt subchunk
    writer.writeChars('fmt ')
    writer.writeUInt32(16)
    writer.writeUInt16(1) // AudioFormat: 1 for PCM
    writer.writeUInt16(sample.channels)
    writer.writeUInt32(sample.frequency)

    const blockAlign = sample.channels * (bitDepth / 8)
    const byteRate = sample.frequency * blockAlign
    writer.writeUInt32(byteRate)
    writer.writeUInt16(blockAlign)
    writer.writeUInt16(bitDepth)

    // data subchunk
    writer.writeChars('data')
    writer.writeUInt32(data.length)
    writer.write(data)

    return writer.getData()
}
