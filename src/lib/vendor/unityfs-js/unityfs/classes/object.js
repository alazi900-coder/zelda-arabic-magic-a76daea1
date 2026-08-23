import { BinaryWriter } from '../../core/binaryStream.js'
import { writeTypeTreeDirect } from '../typeTree/index.js'

function getAttrs(p) {
    if (p != null && p.constructor.exposedAttributes && p.constructor.exposedAttributes.length > 0) {
        const j = {}
        const attrs = p.constructor.exposedAttributes
        const len = attrs.length
        for (let i = 0; i < len; i++) {
            const prop = attrs[i]
            j[prop] = getAttrs(p[prop])
        }
        return j
    } else if (Array.isArray(p)) {
        const len = p.length
        const j = new Array(len)
        for (let i = 0; i < len; i++) {
            j[i] = getAttrs(p[i])
        }
        return j
    } else {
        return p
    }
}

export class UnityObject {
    static exposedAttributes = []
    exportExtension = '.dat'

    constructor(reader) {
        this.reader = reader
        this.pathID = reader.pathID
        this.classID = reader.classID
        this.typeID = reader.typeID
        this._isDirty = false

        reader.seek(0) // ObjectReaders are expected to have a relative offset - this should not be a regular BinaryReader
        if (reader.platform === 'No Target') {
            this.objectHideFlags = reader.readUInt32()
        }
        this._raw = reader.read(typeof this.objectHideFlags == 'undefined' ? reader.length : reader.length - 4)
        if (this.constructor.name === 'UnityObject') {
            // not overridden
            this._noOverride = true
        }
        reader.seek(0)
    }

    static getName(reader) {
        try {
            if (this.exposedAttributes.indexOf('name') > -1) {
                return new this(reader).name
            }
            let length = reader.readUInt32()
            if (length < 1024) {
                // max length for a non-overridden name - we don't know if this is actually named
                try {
                    return reader.readChars(length)
                } catch {
                    return '<unnamed>'
                }
            }
        } catch {
            return '<unnamed>'
        }
        return '<unnamed>'
    }

    async getInfo() {
        return getAttrs(this)
    }

    async saveInfo(zip, baseName) {
        if (typeof this.constructor.exposedAttributes == 'undefined') {
            zip.file(baseName + '.txt', 'Class unsupported')
            return
        }

        zip.file(
            baseName + '.json',
            JSON.stringify(await this.getInfo(), (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
        )
    }

    async getExport() {
        // Fallback for objects that are not supported
        if (this._noOverride) {
            return this._raw
        }
    }

    async getAnyExport() {
        if (Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(this), 'getExport')) {
            return this.getExport() // if this is overridden, use it
        } else {
            return this._raw // otherwise, return the data of the object
        }
    }

    async saveObject(zip, baseName) {
        let data = await this.getExport()
        if (typeof data != 'undefined') {
            zip.file(baseName + this.exportExtension, data)
        }
    }

    setDirty() {
        this._isDirty = true
    }

    serialize() {
        if (!this._isDirty) {
            // Default -- return raw data
            return this._raw
        }
        const writer = new BinaryWriter(0, this.reader.endian)
        const typeTree = this.reader.assetFile.types[this.typeID].tree
        writeTypeTreeDirect(this.reader.assetFile, typeTree, writer, this)
        return writer.getData()
    }
}
