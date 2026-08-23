import { NamedObject } from './namedObject.js'

export class Texture extends NamedObject {
    constructor(reader) {
        super(reader)

        if (reader.versionGTE(2017, 3)) {
            if (reader.versionLT(2023, 2)) {
                //2023.2 down
                this.forcedFallbackFormat = reader.readInt32()
                this.downscaleFallback = reader.readBool()
            }

            if (reader.versionGTE(2020, 2)) {
                this.isAlphaChannelOptional = reader.readBool()
            }

            reader.align(4)
        }
    }
}
