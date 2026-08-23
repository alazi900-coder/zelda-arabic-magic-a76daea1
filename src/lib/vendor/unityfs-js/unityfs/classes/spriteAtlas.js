import { NamedObject } from './namedObject.js'
import { PPtr } from './pptr.js'
import { Rectf, SpriteSettings } from './sprite.js'
//import {cropImage,expandImage} from "../imageProcessing.js";
import { KVPair } from '../basicTypes.js'
class SpriteAtlasData {
    constructor(reader) {
        const version = reader.version
        this.texture = new PPtr(reader)
        this.alphaTexture = new PPtr(reader)
        this.textureRect = new Rectf(reader)
        this.textureRectOffset = reader.readVector2()

        if (version[0] > 2017 || (version[0] === 2017 && version[1] >= 2)) {
            // 2017.2 and up
            this.atlasRectOffset = reader.readVector2()
        }

        this.uvTransform = reader.readVector4()
        this.downscaleMultiplier = reader.readFloat32()
        this.settingsRaw = new SpriteSettings(reader)

        if (version[0] > 2020 || (version[0] === 2020 && version[1] >= 2)) {
            // 2020.2 and up
            const secondaryTexturesSize = reader.readInt32()
            this.secondaryTextures = new Array(secondaryTexturesSize)
            for (let i = 0; i < secondaryTexturesSize; i++) {
                this.secondaryTextures[i] = new SecondarySpriteTexture(reader)
            }
            reader.alignStream()
        }
    }
}
class SecondarySpriteTexture {
    constructor(reader) {
        ;(this.texture = new PPtr(reader)), (this.name = null) //reader.readStringToNull()
    }
}

export class SpriteAtlas extends NamedObject {
    constructor(reader) {
        super(reader)
        const m_PackedSpritesSize = reader.readInt32()
        this.packedSprites = new Array(m_PackedSpritesSize)
        for (let i = 0; i < m_PackedSpritesSize; i++) {
            this.packedSprites[i] = new PPtr(reader)
        }
        this.packedSpriteNamesToIndex = reader.readStringArray()
        const m_RenderDataMapSize = reader.readInt32()
        this.renderDatas = new Array(m_RenderDataMapSize)
        for (let i = 0; i < m_RenderDataMapSize; i++) {
            const first = reader.readGUID()
            const second = Number(reader.readInt64())
            const value = new SpriteAtlasData(reader)
            this.renderDatas[i] = {
                renderDataKey: new KVPair(first, second),
                spriteAtlasData: value,
            }
        }
        this.tag = reader.readAlignedString()
        this.isVariant = reader.readBool()
        reader.align()
    }
}
