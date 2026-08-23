import { ObjectReader } from '../objectReader.js'
import { UnityObject } from '../classes/object.js'
import { ObjectRegistry } from '../../core/registry.js'
import { getObjectUsingTreeJSON } from '../typeTree/index.js'
import { parseAssetFile } from './reader.js'
import { serializeAssetFile } from './writer.js'

const warnedClasses = new Set()

export class ObjectInfo {
    constructor(reader, version, unityRevision, targetPlatform, assetFile = null) {
        this._reader = reader
        this._version = version
        this._unityRevision = unityRevision
        this._targetPlatform = targetPlatform
        this.assetFile = assetFile

        this.enableCaching = true

        this.internalID = 'xxxxxxxxxxxxxxxx'.replaceAll(/x/g, () => Math.random().toString(16)[2])

        this.hasRenderedOn = []
    }

    getClassName() {
        return ObjectRegistry.getClassName(this.classID)
    }

    get className() {
        return this.getClassName()
    }

    _createReader() {
        this._reader.seek(this.offset)
        const objReader = new ObjectReader(
            this._reader.read(this.size).slice(),
            this._version,
            this._unityRevision,
            this._targetPlatform,
            this.pathID,
            this.offset,
            this.size,
            this.classID,
            this.typeID,
        )
        objReader.endian = this._reader.endian
        objReader.assetFile = this.assetFile
        return objReader
    }

    _tryGetClass() {
        let cls = ObjectRegistry.getParser(this.classID)
        if (!cls) {
            if (!warnedClasses.has(this.classID)) {
                warnedClasses.add(this.classID)
                console.warn('unknown class ID:', this.classID)
            }
            return UnityObject
        }
        return cls
    }

    setCaching(enabled) {
        this.enableCaching = enabled
    }

    get object() {
        if (!this.enableCaching) {
            let cls = this._tryGetClass()
            if (cls) {
                return new cls(this._createReader())
            } else {
                return {}
            }
        }
        if (typeof this.cachedObject == 'undefined') {
            let cls = this._tryGetClass()
            if (cls) {
                try {
                    this.cachedObject = new cls(this._createReader())
                } catch (e) {
                    console.error(`While parsing type ${this.getClassName()}:`)
                    console.error(e)
                    this.cachedObject = {}
                }
            } else {
                this.cachedObject = {}
            }
        }
        return this.cachedObject
    }

    get name() {
        if (typeof this.cachedName == 'undefined') {
            let cls = this._tryGetClass()
            if (!cls) {
                this.cachedName = '<unknown>'
            } else {
                this.cachedName = cls.getName(this._createReader())
            }
            if (this.cachedName === '') {
                this.cachedName = '<empty>'
            }
        }
        return this.cachedName
    }

    get exportExtension() {
        let cls = this._tryGetClass()
        if (cls) {
            if (cls.prototype && typeof cls.prototype.exportExtension !== 'undefined') {
                return cls.prototype.exportExtension
            }
            const extMap = {
                Texture2D: '.png',
                Sprite: '.png',
                AudioClip: '.wav',
                Shader: '.shader',
                TextAsset: '.txt',
                Font: '.font',
                VideoClip: '.mp4',
                Mesh: '.obj',
            }
            if (extMap[cls.name]) {
                return extMap[cls.name]
            }
        }
        return '.dat'
    }

    serialize() {
        if (this.cachedObject && this.cachedObject._isDirty) {
            return this.cachedObject.serialize()
        }
        this._reader.seek(this.offset)
        return this._reader.read(this.size)
    }
}

export class LocalObjectIdentifier {
    static exposedAttributes = ['localFileIndex', 'localIdentifier']
    constructor() {}
}

export class FileIdentifier {
    static exposedAttributes = ['guid', 'type', 'path']
    constructor() {}
}

export class AssetFile {
    static exposedAttributes = [
        'version',
        'metadataSize',
        'fileSize',
        'dataOffset',
        'endianness',
        'unityVersion',
        'targetPlatform',
        'enableTypeTrees',
        'types',
        'objects',
        'scriptTypes',
        'externals',
        'refTypes',
        'userInformation',
    ]

    constructor(reader, fileID = 0, options = {}) {
        this.reader = reader
        this.fileID = fileID
        this.options = options

        if (options.unityRevision) {
            this.unityRevision = options.unityRevision
        }
    }

    parse() {
        parseAssetFile(this)
    }

    getClass(classID) {
        if (!this._classMap) {
            this._classMap = new Map()
            for (let i = 0; i < this.types.length; i++) {
                const t = this.types[i]
                this._classMap.set(t.classID, t)
            }
        }
        return this._classMap.get(classID) || null
    }

    getObjectByPathID(pathId) {
        if (!this._pathIdMap) {
            this._pathIdMap = new Map()
            for (let i = 0; i < this.objects.length; i++) {
                const obj = this.objects[i]
                this._pathIdMap.set(obj.pathID, obj)
            }
        }
        return this._pathIdMap.get(pathId) || null
    }

    getTypeFromReference(typeRef) {
        return typeRef.tree
    }

    getObjectUsingTreeJSON(obj) {
        if (obj.object && obj.object._isDirty && obj.object.fields) {
            return obj.object.fields
        }
        return getObjectUsingTreeJSON(this, obj)
    }

    getLocalTypeRegistryAsJSON() {
        let types = {}
        for (let type of this.types) {
            types[type.classID] = this.getTypeFromReference(type)
        }
        return JSON.stringify(types)
    }

    serialize() {
        return serializeAssetFile(this)
    }
}
