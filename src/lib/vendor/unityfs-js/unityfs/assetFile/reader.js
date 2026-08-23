import { BuildTarget } from '../buildTarget.js'
import { TypeTree, TypeTreeReference } from '../typeTree.js'
import { ObjectInfo, LocalObjectIdentifier, FileIdentifier } from './model.js'

export function parseAssetFile(assetFile) {
    assetFile.reader.endian = 'big'
    assetFile.metadataSize = assetFile.reader.readUInt32()
    assetFile.fileSize = assetFile.reader.readUInt32()
    assetFile.version = assetFile.reader.readUInt32()
    assetFile.dataOffset = assetFile.reader.readUInt32()
    if (assetFile.version >= 9) {
        assetFile.endianness = ['little', 'big'][assetFile.reader.readUInt32() % 2]
    } else {
        assetFile.endianness = 'big'
    }
    if (assetFile.version >= 22) {
        assetFile.metadataSize = assetFile.reader.readUInt32()
        assetFile.fileSize = Number(assetFile.reader.readInt64())
        assetFile.dataOffset = Number(assetFile.reader.readInt64())
        assetFile.reader.readInt64() // unknown
    }
    assetFile.reader.endian = assetFile.endianness

    // Metadata
    if (assetFile.version >= 7) {
        assetFile.unityVersion = assetFile.reader.readCString()
    } else {
        assetFile.unityVersion = '2.5.0f5'
    }
    if (assetFile.version >= 8) {
        assetFile.targetPlatform = BuildTarget[assetFile.reader.readUInt32()]
    }
    if (assetFile.version >= 13) {
        assetFile.enableTypeTrees = assetFile.reader.readBool()
    }

    // Types
    const typeCount = assetFile.reader.readUInt32()
    assetFile.types = new Array(typeCount)
    for (let i = 0; i < typeCount; i++) {
        assetFile.types[i] = readSerializedTypeAsReference(assetFile, false)
    }

    if (assetFile.version >= 7 && assetFile.version < 14) {
        assetFile.hasLongIDs = assetFile.reader.readInt32()
    }

    // Objects
    let objectCount = assetFile.reader.readInt32()
    assetFile.objects = new Array(objectCount)
    for (let i = 0; i < objectCount; i++) {
        let info = new ObjectInfo(
            assetFile.reader,
            assetFile.version,
            assetFile.unityRevision || assetFile.unityVersion,
            assetFile.targetPlatform,
            assetFile,
        )
        if (assetFile.hasLongIDs) {
            info.pathID = assetFile.reader.readInt64()
        } else if (assetFile.version < 14) {
            info.pathID = BigInt(assetFile.reader.readInt32())
        } else {
            assetFile.reader.align(4)
            info.pathID = assetFile.reader.readInt64()
        }
        if (assetFile.version >= 22) {
            info.offset = Number(assetFile.reader.readInt64())
        } else {
            info.offset = assetFile.reader.readUInt32()
        }
        info.offset += assetFile.dataOffset
        info.size = assetFile.reader.readUInt32()
        info.typeID = assetFile.reader.readInt32()
        if (assetFile.version < 16) {
            info.classID = assetFile.reader.readUInt16()
        } else {
            let type = assetFile.types[info.typeID]
            info.classID = type.classID
        }
        if (assetFile.version < 11) {
            info.isDestroyed = assetFile.reader.readUInt16()
        } else {
            info.isDestroyed = false
        }
        if (assetFile.version >= 11 && assetFile.version < 17) {
            info.scriptTypeIndex = assetFile.reader.readInt16()
        } else {
            info.scriptTypeIndex = -1
        }
        if (assetFile.version === 15 || assetFile.version === 16) {
            info.stripped = assetFile.reader.read(1)[0]
        } else {
            info.stripped = false
        }
        assetFile.objects[i] = info
    }

    if (assetFile.version >= 11) {
        let scriptCount = assetFile.reader.readInt32()
        assetFile.scriptTypes = new Array(scriptCount)
        for (let i = 0; i < scriptCount; i++) {
            let scriptType = new LocalObjectIdentifier()
            scriptType.localFileIndex = assetFile.reader.readInt32()
            if (assetFile.version < 14) {
                scriptType.localIdentifier = assetFile.reader.readInt32()
            } else {
                assetFile.reader.align(4)
                scriptType.localIdentifier = assetFile.reader.readInt64()
            }
            assetFile.scriptTypes[i] = scriptType
        }
    } else {
        assetFile.scriptTypes = []
    }

    let externalsCount = assetFile.reader.readInt32()
    assetFile.externals = new Array(externalsCount)
    for (let i = 0; i < externalsCount; i++) {
        let external = new FileIdentifier()
        if (assetFile.version >= 6) {
            assetFile.reader.readCString()
        }
        if (assetFile.version >= 5) {
            external.guid = assetFile.reader.readGUID()
            external.type = assetFile.reader.readInt32()
        }
        external.path = assetFile.reader.readCString()
        assetFile.externals[i] = external
    }

    if (assetFile.version >= 20) {
        let refTypeCount = assetFile.reader.readInt32()
        assetFile.refTypes = new Array(refTypeCount)
        for (let i = 0; i < refTypeCount; i++) {
            assetFile.refTypes[i] = readSerializedTypeAsReference(assetFile, true)
        }
    } else {
        assetFile.refTypes = []
    }

    if (assetFile.version >= 5) {
        assetFile.userInformation = assetFile.reader.readCString()
    }
}

function readSerializedTypeInfoOnly(assetFile, isRef) {
    let type = {}
    type.classID = assetFile.reader.readInt32()
    if (assetFile.version >= 16) {
        type.isStripped = assetFile.reader.readBool()
    } else {
        type.isStripped = false
    }
    type.scriptTypeIndex = 0
    if (assetFile.version >= 17) {
        type.scriptTypeIndex = assetFile.reader.readInt16()
    }
    if (assetFile.version >= 13) {
        if (
            (isRef && type.scriptTypeIndex >= 0) ||
            (assetFile.version < 16 && type.classID < 0) ||
            (assetFile.version >= 16 && type.classID === 114)
        ) {
            type.scriptID = assetFile.reader.read(16)
        }
        type.oldTypeHash = assetFile.reader.readGUID()
    }
    let treeOffset = assetFile.reader.tell()
    skipSerializedTypeData(assetFile)
    if (assetFile.enableTypeTrees) {
        if (assetFile.version >= 21) {
            if (isRef) {
                type.className = assetFile.reader.readCString()
                type.nameSpace = assetFile.reader.readCString()
                type.asmName = assetFile.reader.readCString()
            } else {
                type.typeDependencies = assetFile.reader.readArrayT(
                    () => assetFile.reader.readInt32(),
                    assetFile.reader.readUInt32(),
                )
            }
        }
    }
    return [type, treeOffset]
}

function skipSerializedTypeData(assetFile) {
    if (assetFile.enableTypeTrees) {
        let tree = new TypeTree(assetFile.version, assetFile.reader)
        if (assetFile.version >= 12 || assetFile.version === 10) {
            tree.start = tree.reader.offset
            tree.skipBlob()
        } else {
            tree.readLegacy()
        }
    }
}

function readSerializedTypeAsReference(assetFile, isRef) {
    let [info, offset] = readSerializedTypeInfoOnly(assetFile, isRef)

    return new TypeTreeReference(
        assetFile.reader,
        assetFile.version,
        info.classID,
        info.isStripped,
        info.scriptTypeIndex,
        info.scriptID,
        info.oldTypeHash,
        offset,
        assetFile.enableTypeTrees,
        info.asmName,
        info.className,
        info.nameSpace,
    )
}
