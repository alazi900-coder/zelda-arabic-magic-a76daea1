import { EditorExtension } from './editorExtension.js'
import { PPtr } from './pptr.js'

export class Component extends EditorExtension {
    static exposedAttributes = ['gameObject']

    constructor(reader) {
        super(reader)
        this.gameObject = new PPtr(reader)
    }
}
