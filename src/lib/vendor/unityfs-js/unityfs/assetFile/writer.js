import { BinaryWriter, SEEK_CUR } from '../../core/binaryStream.js'
import { BuildTarget } from '../buildTarget.js'
import { TypeTree } from '../typeTree.js'
import { writeTypeTreeDirect } from '../typeTree/index.js'

function hexToBytes(hex) {
    if (!hex) return new Uint8Array(16)
    let bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
    }
    return bytes
}

export function serializeAssetFile(assetFile) {
    const metadataWriter = new BinaryWriter(0, assetFile.endianness)

    // 1. Write metadata fields (starting from unityVersion)
    if (assetFile.version >= 7) {
        metadataWriter.writeCString(assetFile.unityVersion)
    }
    if (assetFile.version >= 8) {
        const platformID = Object.keys(BuildTarget).find((key) => BuildTarget[key] === assetFile.targetPlatform) || 0
        metadataWriter.writeUInt32(Number(platformID))
    }
    if (assetFile.version >= 13) {
        metadataWriter.writeBool(assetFile.enableTypeTrees)
    }

    // 2. Write types
    metadataWriter.writeUInt32(assetFile.types.length)
    for (let typeRef of assetFile.types) {
        metadataWriter.writeInt32(typeRef.classID)
        if (assetFile.version >= 16) {
            metadataWriter.writeBool(typeRef.isStripped)
        }
        if (assetFile.version >= 17) {
            metadataWriter.writeInt16(typeRef.scriptTypeIndex)
        }
        if (assetFile.version >= 13) {
            if (
                typeRef.scriptTypeIndex >= 0 ||
                (assetFile.version < 16 && typeRef.classID < 0) ||
                (assetFile.version >= 16 && typeRef.classID === 114)
            ) {
                metadataWriter.write(typeRef.scriptID)
            }
            metadataWriter.write(hexToBytes(typeRef.oldTypeHash))
        }
        if (assetFile.enableTypeTrees) {
            // Copy TypeTree bytes from the original file
            assetFile.reader.seek(typeRef.offset)
            let tree = new TypeTree(assetFile.version, assetFile.reader)
            if (assetFile.version >= 12 || assetFile.version === 10) {
                tree.skipBlob()
            } else {
                tree.readLegacy()
            }
            if (assetFile.version >= 21) {
                const depCount = assetFile.reader.readUInt32()
                assetFile.reader.seek(depCount * 4, SEEK_CUR)
            }
            let endOffset = assetFile.reader.tell()
            let typeTreeBytes = assetFile.reader.readRaw(typeRef.offset, endOffset - typeRef.offset)
            metadataWriter.write(typeTreeBytes)
        }
    }

    if (assetFile.version >= 7 && assetFile.version < 14) {
        metadataWriter.writeInt32(assetFile.hasLongIDs || 0)
    }

    // 3. Write object records & payload data
    const serializedObjects = []
    let totalPayloadSize = 0
    for (let obj of assetFile.objects) {
        let data = obj.serialize()
        serializedObjects.push(data)
        totalPayloadSize += data.length
        let padding = (8 - (data.length % 8)) % 8
        totalPayloadSize += padding
    }

    // Write object headers
    metadataWriter.writeInt32(assetFile.objects.length)
    let currentPayloadOffset = 0
    for (let i = 0; i < assetFile.objects.length; i++) {
        let info = assetFile.objects[i]
        let data = serializedObjects[i]

        if (assetFile.hasLongIDs) {
            metadataWriter.writeUInt64(info.pathID)
        } else if (assetFile.version < 14) {
            metadataWriter.writeInt32(Number(info.pathID))
        } else {
            metadataWriter.align(4)
            metadataWriter.writeUInt64(info.pathID)
        }

        if (assetFile.version >= 22) {
            metadataWriter.writeUInt64(BigInt(currentPayloadOffset))
        } else {
            metadataWriter.writeUInt32(currentPayloadOffset)
        }
        metadataWriter.writeUInt32(data.length)
        metadataWriter.writeInt32(info.typeID)

        if (assetFile.version < 16) {
            metadataWriter.writeUInt16(info.classID)
        }
        if (assetFile.version < 11) {
            metadataWriter.writeUInt16(info.isDestroyed || 0)
        }
        if (assetFile.version >= 11 && assetFile.version < 17) {
            metadataWriter.writeInt16(info.scriptTypeIndex)
        }
        if (assetFile.version === 15 || assetFile.version === 16) {
            metadataWriter.writeBool(info.stripped)
        }

        let padding = (8 - (data.length % 8)) % 8
        currentPayloadOffset += data.length + padding
    }

    // 4. Write script types
    if (assetFile.version >= 11) {
        metadataWriter.writeInt32(assetFile.scriptTypes.length)
        for (let scriptType of assetFile.scriptTypes) {
            metadataWriter.writeInt32(scriptType.localFileIndex)
            if (assetFile.version < 14) {
                metadataWriter.writeInt32(scriptType.localIdentifier)
            } else {
                metadataWriter.align(4)
                metadataWriter.writeUInt64(BigInt(scriptType.localIdentifier))
            }
        }
    }

    // 5. Write externals
    metadataWriter.writeInt32(assetFile.externals.length)
    for (let external of assetFile.externals) {
        if (assetFile.version >= 6) {
            metadataWriter.writeCString('')
        }
        if (assetFile.version >= 5) {
            metadataWriter.write(hexToBytes(external.guid))
            metadataWriter.writeInt32(external.type)
        }
        metadataWriter.writeCString(external.path)
    }

    // 6. Write refTypes
    if (assetFile.version >= 20) {
        metadataWriter.writeInt32(assetFile.refTypes.length)
        for (let typeRef of assetFile.refTypes) {
            metadataWriter.writeInt32(typeRef.classID)
            if (assetFile.version >= 16) {
                metadataWriter.writeBool(typeRef.isStripped)
            }
            if (assetFile.version >= 17) {
                metadataWriter.writeInt16(typeRef.scriptTypeIndex)
            }
            if (assetFile.version >= 13) {
                if (
                    typeRef.scriptTypeIndex >= 0 ||
                    (assetFile.version < 16 && typeRef.classID < 0) ||
                    (assetFile.version >= 16 && typeRef.classID === 114)
                ) {
                    metadataWriter.write(typeRef.scriptID)
                }
                metadataWriter.write(hexToBytes(typeRef.oldTypeHash))
            }
            if (assetFile.enableTypeTrees) {
                assetFile.reader.seek(typeRef.offset)
                let tree = new TypeTree(assetFile.version, assetFile.reader)
                if (assetFile.version >= 12 || assetFile.version === 10) {
                    tree.skipBlob()
                } else {
                    tree.readLegacy()
                }
                if (assetFile.version >= 21) {
                    assetFile.reader.readCString() // className
                    assetFile.reader.readCString() // nameSpace
                    assetFile.reader.readCString() // asmName
                }
                let endOffset = assetFile.reader.tell()
                let typeTreeBytes = assetFile.reader.readRaw(typeRef.offset, endOffset - typeRef.offset)
                metadataWriter.write(typeTreeBytes)
            }
        }
    }

    if (assetFile.version >= 5) {
        metadataWriter.writeCString(assetFile.userInformation || '')
    }

    // Calculate sizes
    const metadataBytes = metadataWriter.getData()

    let tempHeaderSize = 16
    if (assetFile.version >= 22) {
        tempHeaderSize = 48
    } else if (assetFile.version >= 9) {
        tempHeaderSize = 20
    }

    const dataOffset = tempHeaderSize + metadataBytes.length

    const alignMod = dataOffset % 16
    const headerPaddingSize = alignMod !== 0 ? 16 - alignMod : 0
    const finalDataOffset = dataOffset + headerPaddingSize
    const finalFileSize = finalDataOffset + totalPayloadSize

    const headerWriter = new BinaryWriter(0, 'big')
    if (assetFile.version >= 22) {
        headerWriter.writeUInt32(0)
        headerWriter.writeUInt32(0)
        headerWriter.writeUInt32(assetFile.version)
        headerWriter.writeUInt32(0)
        headerWriter.writeUInt32(assetFile.endianness === 'little' ? 0 : 1)

        headerWriter.writeUInt32(metadataBytes.length)
        headerWriter.writeUInt64(BigInt(finalFileSize))
        headerWriter.writeUInt64(BigInt(finalDataOffset))
        headerWriter.writeUInt64(BigInt(0))
    } else {
        headerWriter.writeUInt32(metadataBytes.length)
        headerWriter.writeUInt32(finalFileSize)
        headerWriter.writeUInt32(assetFile.version)
        headerWriter.writeUInt32(finalDataOffset)
        if (assetFile.version >= 9) {
            headerWriter.writeUInt32(assetFile.endianness === 'little' ? 0 : 1)
        }
    }

    const headerBytes = headerWriter.getData()

    const fullFileWriter = new BinaryWriter(finalFileSize, assetFile.endianness)
    fullFileWriter.write(headerBytes)
    fullFileWriter.write(metadataBytes)
    if (headerPaddingSize > 0) {
        fullFileWriter.write(new Uint8Array(headerPaddingSize))
    }
    for (let i = 0; i < assetFile.objects.length; i++) {
        let data = serializedObjects[i]
        fullFileWriter.write(data)
        let padding = (8 - (data.length % 8)) % 8
        if (padding > 0) {
            fullFileWriter.write(new Uint8Array(padding))
        }
    }

    return fullFileWriter.getData()
}
