import { Component } from './component.js'
import { PPtr } from './pptr.js'

export class MeshFilter extends Component {
    static exposedAttributes = ['gameObject', 'mesh']

    constructor(reader) {
        super(reader)
        this.mesh = new PPtr(reader)
    }
}
