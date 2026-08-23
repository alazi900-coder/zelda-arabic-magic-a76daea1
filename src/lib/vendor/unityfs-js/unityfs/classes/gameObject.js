import { EditorExtension } from './editorExtension.js'
import { PPtr } from './pptr.js'

export class GameObject extends EditorExtension {
    static exposedAttributes = ['components', 'layer', 'name']

    constructor(reader) {
        super(reader)
        let numComponents = reader.readInt32()
        this.components = new Array(numComponents)
        for (let i = 0; i < numComponents; i++) {
            if (reader.versionLT(5, 5)) {
                reader.readInt32()
            }
            this.components[i] = new PPtr(reader)
        }
        this.layer = reader.readInt32()
        this.name = reader.readAlignedString()
    }
}
