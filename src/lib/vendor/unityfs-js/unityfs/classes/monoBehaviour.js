import { Behaviour } from './behaviour.js'
import { PPtr } from './pptr.js'
import { parseTypeTreeDirect } from '../typeTree/index.js'
import { BinaryWriter } from '../../core/binaryStream.js'
import { writeTypeTreeDirect } from '../typeTree/index.js'

export class MonoBehaviour extends Behaviour {
    static exposedAttributes = ['gameObject', 'enabled', 'script', 'name']

    constructor(reader) {
        super(reader)
        this.script = new PPtr(reader)
        this._name = reader.readAlignedString()
        this.endOffset = reader.offset
        this.reader = reader

        // Parse custom fields if type trees are enabled
        if (reader.assetFile && reader.assetFile.enableTypeTrees) {
            const currentOffset = reader.tell()
            reader.seek(0)
            const typeTree = reader.assetFile.types[reader.typeID].tree
            this.fields = parseTypeTreeDirect(reader.assetFile, typeTree, reader, { has_registry: false }, (v) => v)
            reader.seek(currentOffset)
        } else {
            this.fields = null
        }
    }

    get enabled() {
        if (this.fields && typeof this.fields.m_Enabled !== 'undefined') {
            return this.fields.m_Enabled === 1 || this.fields.m_Enabled === true
        }
        return this._enabled
    }

    set enabled(value) {
        const val = typeof value === 'boolean' ? (value ? 1 : 0) : value
        this._enabled = value
        if (this.fields) {
            if (typeof this.fields.m_Enabled === 'boolean') {
                this.fields.m_Enabled = !!value
            } else {
                this.fields.m_Enabled = val
            }
            this.setDirty()
        }
    }

    get name() {
        if (this.fields && typeof this.fields.m_Name !== 'undefined') {
            return this.fields.m_Name
        }
        return this._name
    }

    set name(value) {
        this._name = value
        if (this.fields) {
            this.fields.m_Name = value
            this.setDirty()
        }
    }

    getField(fieldName) {
        if (!this.fields) return undefined
        return this.fields[fieldName]
    }

    setField(fieldName, value) {
        if (!this.fields) {
            throw new Error('TypeTree not enabled or parsed for this MonoBehaviour')
        }
        this.fields[fieldName] = value
        this.setDirty()
    }

    getExport() {
        if (this.fields) {
            return this.fields
        }
        let currentOffset = this.reader.offset
        this.reader.seek(this.endOffset)
        let length = this.reader.readInt32()
        let data = this.reader.read(length)
        this.reader.seek(currentOffset)

        const script = {
            fileID: this.script.fileID,
            pathID: this.script.pathID.toString(),
        }
        return { script, name: this.name, _bytes: data }
    }

    serialize() {
        if (!this._isDirty) {
            return this._raw
        }
        if (this.fields) {
            const writer = new BinaryWriter(0, this.reader.endian)
            const typeTree = this.reader.assetFile.types[this.typeID].tree
            writeTypeTreeDirect(this.reader.assetFile, typeTree, writer, this.fields)
            return writer.getData()
        }
        return super.serialize()
    }
}
