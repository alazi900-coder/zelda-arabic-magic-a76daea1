import { Component } from './component.js'
import { PPtr } from './pptr.js'
import { GameObject } from './gameObject.js'

export class Transform extends Component {
    static exposedAttributes = ['gameObject', 'localPosition', 'localRotation', 'localScale', 'children', 'father']

    constructor(reader) {
        super(reader)
        this.localRotation = reader.readQuaternion()
        this.localPosition = reader.readVector3()
        this.localScale = reader.readVector3()

        let numChildren = reader.readInt32()
        this.children = new Array(numChildren)
        for (let i = 0; i < numChildren; i++) {
            this.children[i] = new PPtr(reader)
        }
        this.father = new PPtr(reader)
    }

    mapChildren() {
        const len = this.children.length
        const tempChildren = []
        for (let i = 0; i < len; i++) {
            const child = this.children[i]
            child.resolve()
            if (child.object) {
                if (child.object instanceof Transform) {
                    child.object.mapChildren()
                    tempChildren.push(child.object)
                } else if (child.object instanceof GameObject) {
                    const comps = child.object.components
                    const compsLen = comps.length
                    const c = new Array(compsLen)
                    for (let j = 0; j < compsLen; j++) {
                        c[j] = comps[j].object
                    }
                    tempChildren.push(c)
                }
            }
        }
        this.realChildren = tempChildren
    }

    getFather() {
        this.father.resolve()
        return this.father.object
    }
}
