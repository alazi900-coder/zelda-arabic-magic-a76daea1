import { NamedObject } from './namedObject.js'
import { parseTypeTreeDirect, writeTypeTreeDirect } from '../typeTree/index.js'
import { BinaryWriter } from '../../core/binaryStream.js'

const utf8Decoder = new TextDecoder('utf-8')

export class TextAsset extends NamedObject {
    static exposedAttributes = ['text', 'name']
    exportExtension = '.txt'
    _text = null

    constructor(reader) {
        super(reader)
        this.data = reader.read(reader.readUInt32())
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

    get name() {
        if (this.fields && typeof this.fields.m_Name !== 'undefined') {
            return this.fields.m_Name
        }
        return this._name
    }

    set name(val) {
        if (this.fields) {
            this.fields.m_Name = val
        }
        this._name = val
        this.setDirty()
    }

    get text() {
        if (this.fields && typeof this.fields.m_Script !== 'undefined') {
            return this.fields.m_Script
        }
        if (!this._text) {
            this._text = utf8Decoder.decode(this.data)
        }
        return this._text
    }

    set text(val) {
        if (this.fields) {
            this.fields.m_Script = val
        } else {
            console.warn(
                'TypeTree not enabled for editing text on this TextAsset. Direct data modification not supported.',
            )
        }
        this._text = val
        this.setDirty()
    }

    getExport() {
        return this.text
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
