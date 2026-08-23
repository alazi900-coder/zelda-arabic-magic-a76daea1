import { readLegacy, readBlob, skipBlob, getTreeFromReference } from './reader.js'

export class TypeTree {
    static exposedAttributes = ['level', 'type', 'name', 'size', 'index', 'typeFlags', 'metaFlag', 'children']

    constructor(version, reader) {
        if (reader) {
            this.startOffset = reader.offset
        }
        this.version = version
        this.reader = reader
        this.children = []
    }

    readLegacy(type, level = 0) {
        return readLegacy(this, this.reader, type, level)
    }

    readBlob() {
        readBlob(this, this.reader)
    }

    skipBlob() {
        skipBlob(this, this.reader)
    }
}

export class TypeTreeReference {
    constructor(
        reader,
        version,
        classID,
        isStripped,
        scriptTypeIndex,
        scriptID,
        oldTypeHash,
        offset,
        enableTypeTrees,
        asmName,
        className,
        nameSpace,
    ) {
        this.reader = reader
        this.version = version
        this.classID = classID
        this.isStripped = isStripped
        this.scriptTypeIndex = scriptTypeIndex
        this.scriptID = scriptID
        this.oldTypeHash = oldTypeHash
        this.offset = offset
        this.enableTypeTrees = enableTypeTrees
        this.assemblyName = asmName
        this.className = className
        this.nameSpace = nameSpace
    }

    get tree() {
        return getTreeFromReference(this)
    }
}
