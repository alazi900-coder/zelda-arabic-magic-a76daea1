import { parseBundleFile } from './reader.js'
import { serializeBundleFile } from './writer.js'

export class BundleFlags {
    static exposedAttributes = [
        'compressionType',
        'hasDirInfo',
        'blockInfoAtEnd',
        'oldWebPluginCompat',
        'blockInfoHasPadding',
    ]

    constructor(value) {
        this.compressionType = value & 0x3f
        this.hasDirInfo = (value & 0x40) === 0x40
        this.blockInfoAtEnd = (value & 0x80) === 0x80
        this.oldWebPluginCompat = (value & 0x100) === 0x100
        this.blockInfoHasPadding = (value & 0x200) === 0x200
    }

    encode() {
        let value = this.compressionType & 0x3f
        if (this.hasDirInfo) value |= 0x40
        if (this.blockInfoAtEnd) value |= 0x80
        if (this.oldWebPluginCompat) value |= 0x100
        if (this.blockInfoHasPadding) value |= 0x200
        return value
    }
}

export class BlockFlags {
    static exposedAttributes = ['compressionType', 'isStreamed']

    constructor(value) {
        this.compressionType = value & 0x3f
        this.isStreamed = (value & 0x40) === 0x40
    }

    encode() {
        let value = this.compressionType & 0x3f
        if (this.isStreamed) value |= 0x40
        return value
    }
}

export class StorageBlock {
    static exposedAttributes = ['compressedSize', 'uncompressedSize', 'flags']

    constructor(uncompressedSize, compressedSize, flags) {
        this.uncompressedSize = uncompressedSize
        this.compressedSize = compressedSize
        this.flags = new BlockFlags(flags)
    }
}

export class Node {
    static exposedAttributes = ['offset', 'size', 'flags', 'path']

    constructor(offset, size, flags, path) {
        this.offset = offset
        this.size = size
        this.flags = flags
        this.path = path
    }
}

export class NodeFile {
    constructor(node, data) {
        this.node = node
        this.data = data
    }
}

export class LazyNodeFile {
    constructor(node, decompressRange) {
        this.node = node
        this.decompressRange = decompressRange
        this._data = null
        this.type = null
        this.assetFile = null
    }

    get data() {
        if (!this._data) {
            this._data = this.decompressRange(Number(this.node.offset), Number(this.node.size))
        }
        return this._data
    }

    resolveRange(offset, size) {
        return this.decompressRange(Number(this.node.offset) + Number(offset), Number(size))
    }

    serialize() {
        if (this.assetFile) {
            return this.assetFile.serialize()
        }
        return this.data
    }
}

export const CompressionType = {
    None: 0,
    LZMA: 1,
    LZ4: 2,
    LZ4HC: 3,
    LZHAM: 4,
}

export class BundleFile {
    static exposedAttributes = [
        'magic',
        'version',
        'unityVersion',
        'unityRevision',
        'size',
        'compressedBlockInfoSize',
        'uncompressedBlockInfoSize',
        'flags',
        'blockInfo',
        'nodes',
        'files',
    ]

    constructor(reader, options = {}) {
        this.reader = reader
        this.options = options
    }

    parse() {
        parseBundleFile(this)
    }

    serialize() {
        return serializeBundleFile(this)
    }
}
