import { NamedObject } from './namedObject.js'
import { PPtr } from './pptr.js'
import { KVPair } from '../basicTypes.js'

export class AssetInfo {
    static exposedAttributes = ['preloadIndex', 'preloadSize', 'asset']

    constructor(reader) {
        this.preloadIndex = reader.readInt32()
        this.preloadSize = reader.readInt32()
        this.asset = new PPtr(reader)
    }
}

export class AssetBundle extends NamedObject {
    static exposedAttributes = ['name', 'preloadTable', 'container']
    constructor(reader) {
        super(reader)
        let preloadTableSize = reader.readInt32()
        this.preloadTable = new Array(preloadTableSize)
        for (let i = 0; i < preloadTableSize; i++) {
            this.preloadTable[i] = new PPtr(reader)
        }
        let containerSize = reader.readInt32()
        this.container = new Array(containerSize)
        for (let i = 0; i < containerSize; i++) {
            let key = reader.readAlignedString()
            this.container[i] = new KVPair(key, new AssetInfo(reader))
        }
        this.containerMap = null
        this.preloadIndexMap = null
    }
    getContainer = function (objectInfo) {
        let pathID = objectInfo.pathID
        if (!this.containerMap) {
            this.containerMap = new Map()
            for (let i = 0; i < this.container.length; i++) {
                const container = this.container[i]
                if (container.value.asset) {
                    this.containerMap.set(container.value.asset.pathID, container)
                }
            }
            this.preloadIndexMap = new Map()
            for (let i = 0; i < this.preloadTable.length; i++) {
                this.preloadIndexMap.set(this.preloadTable[i].pathID, i)
            }
        }

        let container = this.containerMap.get(pathID)
        if (container) {
            return container
        }

        let index = this.preloadIndexMap.get(pathID)
        if (index !== undefined) {
            for (let i = 0; i < this.container.length; i++) {
                let container = this.container[i]
                if (
                    index >= container.value.preloadIndex &&
                    index <= container.value.preloadIndex + container.value.preloadSize
                ) {
                    return container
                }
            }
        }
    }
}

export const PreloadData = AssetBundle
