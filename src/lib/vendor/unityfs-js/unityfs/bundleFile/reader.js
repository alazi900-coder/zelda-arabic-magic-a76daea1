import { BinaryReader } from '../../core/binaryStream.js'
import { FileType, UnityFS } from '../unityFile.js'
import { AssetManager } from '../../assetManager.js'
import { DecoderManager } from '../../decoders/DecoderManager.js'
import { BundleFlags, StorageBlock, Node, LazyNodeFile, CompressionType } from './model.js'

export function parseBundleFile(bundleFile) {
    bundleFile.magic = bundleFile.reader.readCString()
    bundleFile.version = bundleFile.reader.readUInt32()
    bundleFile.unityVersion = bundleFile.reader.readCString()
    bundleFile.unityRevision = bundleFile.reader.readCString()

    if (bundleFile.options && bundleFile.options.unityRevision) {
        bundleFile.unityRevision = bundleFile.options.unityRevision
    }

    switch (bundleFile.magic) {
        case 'UnityFS':
            parseUnityFS(bundleFile)
            break
    }
}

export function parseUnityWeb(bundleFile) {
    if (bundleFile.version >= 6) {
        parseUnityFS(bundleFile)
    }
}

function parseUnityFS(bundleFile) {
    const reader = bundleFile.reader
    bundleFile.size = reader.readUInt64()
    bundleFile.compressedBlockInfoSize = reader.readUInt32()
    bundleFile.uncompressedBlockInfoSize = reader.readUInt32()
    bundleFile.flags = new BundleFlags(reader.readUInt32())
    if (bundleFile.magic !== 'UnityFS') {
        reader.read(1)
    }

    if (bundleFile.version >= 7) {
        reader.align(16)
    }
    let blockInfoData
    if (bundleFile.flags.blockInfoAtEnd) {
        const origPos = reader.tell()
        reader.seek(reader.data.length - bundleFile.compressedBlockInfoSize)
        blockInfoData = reader.read(bundleFile.compressedBlockInfoSize)
        reader.seek(origPos)
    } else {
        blockInfoData = reader.read(bundleFile.compressedBlockInfoSize)
    }

    const onDecompress = (data) => {
        let blockInfoReader = new BinaryReader(data)
        blockInfoReader.read(16)
        let blockInfoCount = blockInfoReader.readUInt32()
        bundleFile.blockInfo = []
        for (let i = 0; i < blockInfoCount; i++) {
            bundleFile.blockInfo.push(
                new StorageBlock(
                    blockInfoReader.readUInt32(),
                    blockInfoReader.readUInt32(),
                    blockInfoReader.readUInt16(),
                ),
            )
        }
        bundleFile.nodes = []
        let nodeCount = blockInfoReader.readUInt32()
        for (let i = 0; i < nodeCount; i++) {
            bundleFile.nodes.push(
                new Node(
                    blockInfoReader.readUInt64(),
                    blockInfoReader.readUInt64(),
                    blockInfoReader.readUInt32(),
                    blockInfoReader.readCString(),
                ),
            )
        }
        if (bundleFile.flags && bundleFile.flags.blockInfoHasPadding) {
            reader.align(16)
        }

        const startOfBlocks = reader.tell()
        const compressedBlocksSize = bundleFile.blockInfo.reduce((sum, block) => sum + block.compressedSize, 0)

        let currentPhysicalOffset = startOfBlocks
        let currentLogicalOffset = 0
        const blockMeta = bundleFile.blockInfo.map((block) => {
            const meta = {
                block,
                physicalOffset: currentPhysicalOffset,
                logicalOffset: currentLogicalOffset,
            }
            currentPhysicalOffset += block.compressedSize
            currentLogicalOffset += block.uncompressedSize
            return meta
        })

        // Advance main reader past all compressed block arrays
        reader.seek(startOfBlocks + compressedBlocksSize)

        const decompressedCache = new Map()
        const cacheOrder = []
        const MAX_CACHE_SIZE = 4

        const decompressRange = (start, size) => {
            const end = start + size
            const result = new Uint8Array(size)

            // Binary search to find the first block that can intersect with start
            let low = 0
            let high = blockMeta.length - 1
            let startIndex = 0

            while (low <= high) {
                const mid = (low + high) >> 1
                const meta = blockMeta[mid]
                const blockEnd = meta.logicalOffset + meta.block.uncompressedSize
                if (blockEnd > start) {
                    startIndex = mid
                    high = mid - 1
                } else {
                    low = mid + 1
                }
            }

            for (let i = startIndex; i < blockMeta.length; i++) {
                const meta = blockMeta[i]
                const blockStart = meta.logicalOffset
                if (blockStart >= end) {
                    break
                }
                const blockEnd = blockStart + meta.block.uncompressedSize

                if (blockStart < end && blockEnd > start) {
                    let decompressed = decompressedCache.get(meta.physicalOffset)
                    if (!decompressed) {
                        const origPos = reader.tell()
                        reader.seek(meta.physicalOffset)
                        const compressedData = reader.readCopy(meta.block.compressedSize)
                        reader.seek(origPos)

                        if (meta.block.flags.compressionType === CompressionType.None) {
                            decompressed = compressedData
                        } else {
                            decompressed = DecoderManager.decompress(
                                compressedData,
                                meta.block.uncompressedSize,
                                meta.block.flags.compressionType,
                            )
                        }

                        // Keep LRU cache size limit
                        if (decompressedCache.size >= MAX_CACHE_SIZE) {
                            const oldest = cacheOrder.shift()
                            decompressedCache.delete(oldest)
                        }
                        decompressedCache.set(meta.physicalOffset, decompressed)
                        cacheOrder.push(meta.physicalOffset)
                    } else {
                        // Update LRU order
                        const idx = cacheOrder.indexOf(meta.physicalOffset)
                        if (idx !== -1) {
                            cacheOrder.splice(idx, 1)
                        }
                        cacheOrder.push(meta.physicalOffset)
                    }

                    const srcStart = Math.max(0, start - blockStart)
                    const srcEnd = Math.min(meta.block.uncompressedSize, end - blockStart)
                    const destOffset = Math.max(0, blockStart - start)

                    result.set(decompressed.subarray(srcStart, srcEnd), destOffset)
                }
            }
            return result
        }

        bundleFile.files = []
        for (let node of bundleFile.nodes) {
            bundleFile.files.push(new LazyNodeFile(node, decompressRange))
        }

        const manager = new AssetManager(bundleFile.options)
        manager.bindBundle(bundleFile)

        bundleFile.readers = []
        for (let file of bundleFile.files) {
            let fileReader = new UnityFS(file.data, bundleFile.options)
            fileReader.parseHeader()
            file.type = fileReader.fileType
            bundleFile.readers.push(fileReader)
            fileReader.parse()
            if (fileReader.fileType === FileType.Assets && fileReader.parser) {
                fileReader.parser.files = bundleFile.files
                file.assetFile = fileReader.parser
                manager.registerAssetFile(fileReader.parser)
            } else if (fileReader.fileType === FileType.Resource) {
                manager.registerResourceFile(file.node.path, file)
            }
        }
        bundleFile.assetManager = manager
    }

    let data
    if (bundleFile.flags.compressionType === CompressionType.None) {
        data = blockInfoData
    } else {
        data = DecoderManager.decompress(
            blockInfoData,
            bundleFile.uncompressedBlockInfoSize,
            bundleFile.flags.compressionType,
        )
    }

    onDecompress(data)
}
