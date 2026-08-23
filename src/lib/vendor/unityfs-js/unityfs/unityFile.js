import { BundleFile } from './bundleFile/index.js'
import { BinaryReader } from '../core/binaryStream.js'
import { AssetFile } from './assetFile/index.js'
import { WebFile } from './webFile.js'
import { AssetManager } from '../assetManager.js'

export const FileType = {
    Assets: 0,
    Bundle: 1,
    Web: 2,
    Resource: 3,
    GZip: 4,
    Brotli: 5,
    Zip: 6,
}

export class UnityFS {
    constructor(data, options = {}) {
        this.options = options
        if (options.sliceBeforeSecondUnityFS && (data instanceof ArrayBuffer || data instanceof Uint8Array)) {
            const slicedData = this.sliceBeforeSecondUnityFS(data)
            this.reader = new BinaryReader(slicedData)
        } else {
            this.reader = new BinaryReader(data)
        }
    }

    parseHeader() {
        let magic = this.reader.readCString(16)
        this.reader.seek(0)
        switch (magic) {
            case 'UnityWeb':
            case 'UnityRaw':
            case 'UnityArchive':
            case 'UnityFS':
                this.fileType = FileType.Bundle
                break
            case 'UnityWebData1.0':
                this.fileType = FileType.Web
                break
            default:
                if (this.isAsset()) {
                    this.fileType = FileType.Assets
                } else {
                    this.fileType = FileType.Resource
                }
        }
    }

    isAsset() {
        this.reader.seek(0)
        if (this.reader.data.length < 20) {
            return false
        }
        this.reader.readUInt32()
        let fileSize = BigInt(this.reader.readUInt32())
        const version = this.reader.readUInt32()
        let dataOffset = BigInt(this.reader.readUInt32())
        if (version >= 22) {
            if (this.reader.data.length < 48) {
                return false
            }
            // Unity 2022 keeps the legacy fields first, then stores the
            // endianness flag, metadataSize, fileSize, and dataOffset.
            this.reader.readUInt32()
            this.reader.readUInt32()
            fileSize = this.reader.readUInt64()
            dataOffset = this.reader.readUInt64()
        }
        this.reader.seek(0)
        if (fileSize !== BigInt(this.reader.data.length)) {
            return false
        }
        return dataOffset <= BigInt(this.reader.data.length)
    }

    parse() {
        this.parseHeader()
        switch (this.fileType) {
            case FileType.Bundle:
                this.parser = new BundleFile(this.reader, this.options)
                this.parser.parse()
                this.assetManager = this.parser.assetManager
                if (this.assetManager) {
                    this.assetManager.bindContainer(this)
                }
                return
            case FileType.Assets:
                this.parser = new AssetFile(this.reader, 0, this.options)
                this.parser.parse()
                this.assetManager = new AssetManager(this.options)
                this.assetManager.registerAssetFile(this.parser)
                this.assetManager.bindContainer(this)
                break
            case FileType.Web:
                this.parser = new WebFile(this.reader)
                break
            default:
                return
        }
    }

    sliceBeforeSecondUnityFS(arrayBuffer) {
        const view = new Uint8Array(arrayBuffer)
        const signature = new Uint8Array([85, 110, 105, 116, 121, 70, 83])
        const sigLen = signature.length
        const limit = view.length - sigLen
        let occurrences = 0
        let targetIndex = -1

        for (let i = 0; i <= limit; i++) {
            if (view[i] !== 85) continue
            let match = true
            for (let j = 1; j < sigLen; j++) {
                if (view[i + j] !== signature[j]) {
                    match = false
                    break
                }
            }

            if (match) {
                occurrences++
                if (occurrences === 2) {
                    targetIndex = i
                    break
                }
            }
        }

        if (targetIndex !== -1) {
            return arrayBuffer instanceof Uint8Array
                ? arrayBuffer.subarray(targetIndex)
                : arrayBuffer.slice(targetIndex)
        } else {
            console.warn('未找到第二个 UnityFS 标志，返回原数据')
            return arrayBuffer
        }
    }
}
