import { BinaryWriter, BinaryReader } from '../../core/binaryStream.js'
import { FileType } from '../unityFile.js'
import { BundleFile, BundleFlags, CompressionType } from './model.js'
import { makeHashTable, compressBound, compressBlock } from '../../decoders/drivers/lz4.js'
import { compressBlockHC } from '../../decoders/drivers/lz4hc.js'

export function serializeBundleFile(bundleFile) {
    if (typeof bundleFile.size === 'undefined') {
        console.error('Size required to serialize bundle')
    }
    let writer = new BinaryWriter(Number(bundleFile.size))
    writer.writeCString(bundleFile.magic)
    writer.writeUInt32(bundleFile.version)
    writer.writeCString(bundleFile.unityVersion)
    writer.writeCString(bundleFile.unityRevision)

    switch (bundleFile.magic) {
        case 'UnityFS':
            writer.write(serializeUnityFS(bundleFile))
    }

    return writer.getData()
}

function serializeUnityFS(bundleFile) {
    const newNodes = []
    let estimatedSize = 0
    for (let file of bundleFile.files) {
        estimatedSize += file.node ? Number(file.node.size) : 0
    }
    const blockData = new BinaryWriter(estimatedSize)
    for (let file of bundleFile.files) {
        let data = new Uint8Array(0)
        switch (file.type) {
            case FileType.Resource:
                data = file.data
                break
            case FileType.Bundle:
                data = new BundleFile(new BinaryReader(file.data)).serialize()
                break
            case FileType.Assets:
                data = file.serialize()
                // Do not append bytes merely to force a CAB CRC. AssetFile
                // has already written its own fileSize into the Unity header;
                // changing the payload length afterwards makes Unity reject it.
                break
        }
        newNodes.push({
            offset: BigInt(blockData.offset),
            size: BigInt(data.length),
            flags: file.node.flags,
            path: file.node.path,
        })
        blockData.write(data)
    }

    const uncompressedData = blockData.getData()
    const totalUncompressedSize = uncompressedData.length

    // Preserve the source compression class. Unity uses the same LZ4 block
    // format for LZ4 and LZ4HC, but LZ4HC needs a deeper match search.
    const BLOCK_SIZE = 131072 // 128 KB
    const blocks = []
    const compressedBlocksWriter = new BinaryWriter(0)

    const originalCompType = bundleFile.flags.compressionType
    const useLZ4 = originalCompType === CompressionType.LZ4 || originalCompType === CompressionType.LZ4HC
    const useLZ4HC = originalCompType === CompressionType.LZ4HC

    if (useLZ4) {
        const hashTab = useLZ4HC ? null : makeHashTable()
        let processedSize = 0
        while (processedSize < totalUncompressedSize) {
            const blockSize = Math.min(BLOCK_SIZE, totalUncompressedSize - processedSize)
            const maxCompressedSize = compressBound(blockSize)
            const compBuf = new Uint8Array(maxCompressedSize)

            if (hashTab) {
                for (let i = 0; i < hashTab.length; i++) hashTab[i] = 0
            }

            let compressedSize = useLZ4HC
                ? compressBlockHC(uncompressedData, compBuf, processedSize, blockSize)
                : compressBlock(uncompressedData, compBuf, processedSize, blockSize, hashTab)

            // LZ4HC and LZ4 use the same on-disk block representation. Some
            // dense Alpha8 atlas chunks defeat the HC match search even when
            // the normal LZ4 matcher can encode them smaller than raw bytes.
            // Retain the source's LZ4HC block class but use that compatible
            // encoder as a safe fallback instead of emitting a raw block.
            if (useLZ4HC && !(compressedSize > 0 && compressedSize < blockSize)) {
                const fallbackHashTab = makeHashTable()
                compressedSize = compressBlock(uncompressedData, compBuf, processedSize, blockSize, fallbackHashTab)
            }

            if (compressedSize > 0 && compressedSize < blockSize) {
                compressedBlocksWriter.write(compBuf.subarray(0, compressedSize))
                blocks.push({
                    uncompressedSize: blockSize,
                    compressedSize: compressedSize,
                    flags: useLZ4HC ? CompressionType.LZ4HC : CompressionType.LZ4,
                })
            } else {
                compressedBlocksWriter.write(uncompressedData.subarray(processedSize, processedSize + blockSize))
                blocks.push({
                    uncompressedSize: blockSize,
                    compressedSize: blockSize,
                    flags: 0, // CompressionType.None
                })
            }
            processedSize += blockSize
        }
    } else {
        blocks.push({
            uncompressedSize: totalUncompressedSize,
            compressedSize: totalUncompressedSize,
            flags: 0,
        })
        compressedBlocksWriter.write(uncompressedData)
    }

    const blockInfoWriter = new BinaryWriter(0)
    blockInfoWriter.write(new Uint8Array(16)) // 16 bytes hash/padding

    blockInfoWriter.writeUInt32(blocks.length) // blockInfoCount
    for (let block of blocks) {
        blockInfoWriter.writeUInt32(block.uncompressedSize)
        blockInfoWriter.writeUInt32(block.compressedSize)
        blockInfoWriter.writeUInt16(block.flags)
    }

    blockInfoWriter.writeUInt32(newNodes.length) // nodeCount
    for (let node of newNodes) {
        blockInfoWriter.writeUInt64(node.offset)
        blockInfoWriter.writeUInt64(node.size)
        blockInfoWriter.writeUInt32(node.flags)
        blockInfoWriter.writeCString(node.path)
    }

    const blockInfoBytes = blockInfoWriter.getData()
    const blockInfoUsesLZ4HC = originalCompType === CompressionType.LZ4HC
    let encodedBlockInfoBytes = blockInfoBytes
    if (blockInfoUsesLZ4HC) {
        const blockInfoBuffer = new Uint8Array(compressBound(blockInfoBytes.length))
        const blockInfoSize = compressBlockHC(blockInfoBytes, blockInfoBuffer, 0, blockInfoBytes.length)
        if (blockInfoSize > 0 && blockInfoSize < blockInfoBytes.length) {
            encodedBlockInfoBytes = blockInfoBuffer.subarray(0, blockInfoSize)
        }
    }

    const headerWriter = new BinaryWriter(0)
    headerWriter.writeUInt64(BigInt(0)) // placeholder for size
    headerWriter.writeUInt32(encodedBlockInfoBytes.length) // compressedBlockInfoSize
    headerWriter.writeUInt32(blockInfoBytes.length) // uncompressedBlockInfoSize

    let copyFlags = new BundleFlags(bundleFile.flags.encode())
    copyFlags.compressionType = blockInfoUsesLZ4HC && encodedBlockInfoBytes.length < blockInfoBytes.length
        ? CompressionType.LZ4HC
        : CompressionType.None
    headerWriter.writeUInt32(copyFlags.encode())

    if (bundleFile.version >= 7) {
        const absoluteStart =
            bundleFile.magic.length + 1 + 4 + bundleFile.unityVersion.length + 1 + bundleFile.unityRevision.length + 1
        const currentAbsolutePos = absoluteStart + headerWriter.offset
        const alignMod = currentAbsolutePos % 16
        const padding = alignMod !== 0 ? 16 - alignMod : 0
        if (padding > 0) {
            headerWriter.write(new Uint8Array(padding))
        }
    }
    const headerBytes = headerWriter.getData()

    const absoluteStart =
        bundleFile.magic.length +
        1 +
        4 +
        bundleFile.unityVersion.length +
        1 +
        bundleFile.unityRevision.length +
        1 +
        headerBytes.length +
        encodedBlockInfoBytes.length

    let blockPadding = 0
    if (bundleFile.version >= 7 && (copyFlags.encode() & 0x200) !== 0) {
        const alignMod = absoluteStart % 16
        blockPadding = alignMod !== 0 ? 16 - alignMod : 0
    }

    const totalSize = absoluteStart + blockPadding + compressedBlocksWriter.offset

    bundleFile.size = BigInt(totalSize)

    const sizeWriter = new BinaryWriter(8)
    sizeWriter.writeUInt64(BigInt(totalSize))
    headerBytes.set(sizeWriter.getData(), 0)

    const finalWriter = new BinaryWriter(
        headerBytes.length + encodedBlockInfoBytes.length + blockPadding + compressedBlocksWriter.offset,
    )
    finalWriter.write(headerBytes)
    finalWriter.write(encodedBlockInfoBytes)
    if (blockPadding > 0) {
        finalWriter.write(new Uint8Array(blockPadding))
    }
    finalWriter.write(compressedBlocksWriter.getData())
    return finalWriter.getData()
}

// ==========================================
// CRC-32 Math Helpers for Inner Checksum Spoofing
// ==========================================
const POLYNOMIAL_CRC = 0x104c11db7n
const CRC32_TABLE = new Int32Array(256)
for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    CRC32_TABLE[i] = c
}

function calculateCrc32(buffer) {
    let crc = 0 ^ -1
    for (let i = 0; i < buffer.length; i++) {
        crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buffer[i]) & 0xff]
    }
    return (crc ^ -1) >>> 0
}

function getDegree(x) {
    let deg = -1
    let temp = x
    while (temp > 0n) {
        deg++
        temp >>= 1n
    }
    return deg
}

function reverse32(x) {
    let y = 0n
    let temp = BigInt(x)
    for (let i = 0; i < 32; i++) {
        y = (y << 1n) | (temp & 1n)
        temp >>= 1n
    }
    return Number(y)
}

function multiplyMod(x, y) {
    let z = 0n
    let tempX = x
    let tempY = y
    while (tempY > 0n) {
        z ^= tempX * (tempY & 1n)
        tempY >>= 1n
        tempX <<= 1n
        if (((tempX >> 32n) & 1n) !== 0n) {
            tempX ^= POLYNOMIAL_CRC
        }
    }
    return z
}

function powMod(x, y) {
    let z = 1n
    let tempX = x
    let tempY = y
    while (tempY > 0n) {
        if ((tempY & 1n) !== 0n) {
            z = multiplyMod(z, tempX)
        }
        tempX = multiplyMod(tempX, tempX)
        tempY >>= 1n
    }
    return z
}

function divideAndRemainder(x, y) {
    if (y === 0n) throw new Error('Division by zero')
    if (x === 0n) return [0n, 0n]

    let tempX = x
    const ydeg = getDegree(y)
    let z = 0n
    for (let i = getDegree(tempX) - ydeg; i >= 0; i--) {
        if (((tempX >> BigInt(i + ydeg)) & 1n) !== 0n) {
            tempX ^= y << BigInt(i)
            z |= 1n << BigInt(i)
        }
    }
    return [z, tempX]
}

function reciprocalMod(x) {
    let y = x
    let tempX = POLYNOMIAL_CRC
    let a = 0n
    let b = 1n
    while (y !== 0n) {
        const [q, r] = divideAndRemainder(tempX, y)
        const c = a ^ multiplyMod(q, b)
        tempX = y
        y = r
        a = b
        b = c
    }
    if (tempX === 1n) {
        return a
    } else {
        throw new Error('Reciprocal does not exist')
    }
}

function forceBufferCrc32(originalBuffer, targetCrc32) {
    const extendedBuffer = new Uint8Array(originalBuffer.length + 4)
    extendedBuffer.set(originalBuffer, 0)

    const currentCrcVal = calculateCrc32(extendedBuffer)
    const crc = BigInt(reverse32(currentCrcVal))
    const newcrc = BigInt(reverse32(targetCrc32))

    const delta = crc ^ newcrc
    const offset = originalBuffer.length
    const length = extendedBuffer.length

    const power = BigInt(length - offset) * 8n
    const reciprocal = reciprocalMod(powMod(2n, power))
    const finalDelta = multiplyMod(reciprocal, delta)

    const finalDeltaRev = reverse32(Number(finalDelta))

    for (let i = 0; i < 4; i++) {
        extendedBuffer[offset + i] ^= (finalDeltaRev >>> (i * 8)) & 0xff
    }

    const verifiedCrc = calculateCrc32(extendedBuffer)
    if (verifiedCrc !== targetCrc32) {
        console.error(`CRC Forcer Verification failed! Expected ${targetCrc32}, got ${verifiedCrc}`)
    }

    return extendedBuffer
}
