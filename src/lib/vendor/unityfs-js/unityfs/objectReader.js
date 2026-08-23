import { BinaryReader } from '../core/binaryStream.js'

const versionCache = new Map()

export class ObjectReader extends BinaryReader {
    constructor(data, version, unityVersion, platform, pathID, offset, length, classID, typeID) {
        super(data)
        this.fileVersion = version
        this.rawVersion = unityVersion
        this.platform = platform
        this.pathID = pathID
        this.origOffset = offset
        this.length = length
        this.classID = classID
        this.typeID = typeID

        let cached = versionCache.get(unityVersion)
        if (!cached) {
            const parsedVersion = unityVersion.replaceAll(/\D/g, '.').split('.').map(Number)
            const isPatch = unityVersion.includes('p')
            cached = { version: parsedVersion, isPatch }
            versionCache.set(unityVersion, cached)
        }
        this.version = cached.version
        this.isPatch = cached.isPatch
    }

    reset() {
        this.seek(0)
    }

    versionGT(major, minor) {
        return this.version[0] > major || (this.version[0] === major && this.version[1] > minor)
    }

    versionGTE(major, minor) {
        return this.version[0] > major || (this.version[0] === major && this.version[1] >= minor)
    }

    versionLT(major, minor) {
        return this.version[0] < major || (this.version[0] === major && this.version[1] < minor)
    }

    versionLTE(major, minor) {
        return this.version[0] < major || (this.version[0] === major && this.version[1] <= minor)
    }
}
