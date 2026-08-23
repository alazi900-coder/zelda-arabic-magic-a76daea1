export class PPtr {
    constructor(reader) {
        this.fileID = reader.readInt32()
        this.pathID = reader.fileVersion < 14 ? BigInt(reader.readInt32()) : reader.readInt64()
        this._object = null
        this.info = null
    }

    get object() {
        this.resolve()
        return this._object
    }

    resolve() {
        if (this.fileID !== 0) {
            console.error('cross-file externals unsupported')
            return
        }
        if (this._object != null) return
        document.body.dispatchEvent(
            new CustomEvent('pptr-resolve-request', { detail: { fileID: this.fileID, pathID: this.pathID } }),
        )
    }
}
