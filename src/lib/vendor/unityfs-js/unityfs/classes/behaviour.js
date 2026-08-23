import { Component } from './component.js'

export class Behaviour extends Component {
    static exposedAttributes = ['gameObject', 'enabled']

    constructor(reader) {
        super(reader)
        this.enabled = reader.readBool()
        reader.align(4)
    }
}
