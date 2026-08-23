import { PPtr } from './pptr.js'
import { NamedObject } from './namedObject.js'

export class AnimationClipOverride {
    static exposedAttributes = ['originalClip', 'overrideClip']

    constructor(reader) {
        this.originalClip = new PPtr(reader)
        this.overrideClip = new PPtr(reader)
    }
}

export class AnimatorOverrideController extends NamedObject {
    static exposedAttributes = ['name', 'controller', 'clips']

    constructor(reader) {
        super(reader)
        this.controller = new PPtr(reader)
        let numOverrides = reader.readInt32()
        this.clips = new Array(numOverrides)
        for (let i = 0; i < numOverrides; i++) {
            this.clips[i] = new AnimationClipOverride(reader)
        }
    }
}
