class WebData {
    static exposedAttributes = ['offset', 'size', 'path']

    constructor(reader) {
        this.offset = reader.readInt32()
        this.size = reader.readInt32()
        this.path = reader.readString()
    }
}

export class WebFile {
    static exposedAttributes = ['files']

    constructor(reader) {
        reader.endian = 'little'
        reader.readCString()
        const headLength = reader.readInt32()
        this.files = []
        this.fileMap = new Map()
        while (reader.tell() < headLength) {
            const file = new WebData(reader)
            this.files.push(file)
            this.fileMap.set(file.path, file)
        }
        this.reader = reader
    }

    get(path) {
        const file = this.fileMap.get(path)
        if (!file) return null
        this.reader.seek(file.offset)
        return this.reader.read(file.size)
    }

    parse() {
        // nothing to do here
    }
}
