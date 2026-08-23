import { EditorExtension } from './editorExtension.js'

export class NamedObject extends EditorExtension {
    static exposedAttributes = ['name']

    constructor(reader) {
        super(reader)
        this._name = reader.readAlignedString()
    }

    get name() {
        return this._name
    }

    set name(val) {
        this._name = val
        this.setDirty()
    }

    static getName(reader) {
        reader.seek(0)
        let name = reader.readAlignedString()
        reader.seek(0)
        return name
    }
}
