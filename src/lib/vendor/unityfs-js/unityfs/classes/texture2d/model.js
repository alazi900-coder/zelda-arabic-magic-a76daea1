import { Texture } from '../texture.js'
import { parseTypeTreeDirect } from '../../typeTree/index.js'
import { decodeTexture2DRgba, rgbaToPng } from './reader.js'
import { updateTexture2DImage, serializeTexture2D } from './writer.js'

export class StreamingInfo {
    static exposedAttributes = ['offset', 'size', 'path']

    constructor(reader) {
        if (reader.version[0] >= 2020) {
            this.offset = Number(reader.readInt64())
        } else {
            this.offset = reader.readUInt32()
        }
        this.size = reader.readUInt32()
        this.path = reader.readAlignedString()
    }
}

export class GLTextureSettings {
    static exposedAttributes = ['filterMode', 'anisotropicFiltering', 'mipBias', 'wrapMode']

    constructor(reader) {
        this.filterMode = reader.readInt32()
        this.anisotropicFiltering = reader.readInt32()
        this.mipBias = reader.readInt32()
        this.wrapMode = reader.readInt32()
        if (reader.version[0] >= 2017) {
            this.wrapV = reader.readInt32()
            this.wrapW = reader.readInt32()
        }
    }
}

export const TextureFormat = {
    1: 'Alpha8',
    2: 'ARGB4444',
    3: 'RGB24',
    4: 'RGBA32',
    5: 'ARGB32',
    6: 'ARGBFloat',
    7: 'RGB565',
    8: 'BGR24',
    9: 'R16',
    10: 'DXT1',
    11: 'DXT3',
    12: 'DXT5',
    13: 'RGBA4444',
    14: 'BGRA32',
    15: 'RHalf',
    16: 'RGHalf',
    17: 'RGBAHalf',
    18: 'RFloat',
    19: 'RGFloat',
    20: 'RGBAFloat',
    21: 'YUY2',
    22: 'RGB9e5Float',
    23: 'RGBFloat',
    24: 'BC6H',
    25: 'BC7',
    26: 'BC4',
    27: 'BC5',
    28: 'DXT1Crunched',
    29: 'DXT5Crunched',
    30: 'PVRTC_RGB2',
    31: 'PVRTC_RGBA2',
    32: 'PVRTC_RGB4',
    33: 'PVRTC_RGBA4',
    34: 'ETC_RGB4',
    35: 'ATC_RGB4',
    36: 'ATC_RGBA8',
    41: 'EAC_R',
    42: 'EAC_R_SIGNED',
    43: 'EAC_RG',
    44: 'EAC_RG_SIGNED',
    45: 'ETC2_RGB',
    46: 'ETC2_RGBA1',
    47: 'ETC2_RGBA8',
    48: 'ASTC_RGB_4x4',
    49: 'ASTC_RGB_5x5',
    50: 'ASTC_RGB_6x6',
    51: 'ASTC_RGB_8x8',
    52: 'ASTC_RGB_10x10',
    53: 'ASTC_RGB_12x12',
    54: 'ASTC_RGBA_4x4',
    55: 'ASTC_RGBA_5x5',
    56: 'ASTC_RGBA_6x6',
    57: 'ASTC_RGBA_8x8',
    58: 'ASTC_RGBA_10x10',
    59: 'ASTC_RGBA_12x12',
    60: 'ETC_RGB4_3DS',
    61: 'ETC_RGBA8_3DS',
    62: 'RG16',
    63: 'R8',
    64: 'ETC_RGB4Crunched',
    65: 'ETC2_RGBA8Crunched',
    66: 'ASTC_HDR_4x4',
    67: 'ASTC_HDR_5x5',
    68: 'ASTC_HDR_6x6',
    69: 'ASTC_HDR_8x8',
    70: 'ASTC_HDR_10x10',
    71: 'ASTC_HDR_12x12',
    72: 'RG32',
    73: 'RGB48',
    74: 'RGBA64',
}

export class Texture2D extends Texture {
    static exposedAttributes = [
        'name',
        'width',
        'height',
        'completeSize',
        'textureFormat',
        'mipCount',
        'isReadable',
        'imageCount',
        'textureDimension',
        'textureSettings',
        'lightmapFormat',
        'colorSpace',
        'streamData',
    ]

    constructor(reader) {
        super(reader)
        this.reader = reader

        this._version = reader.version
        this._platform = reader.platform

        this.cachedRaw = null

        this.width = reader.readInt32()
        this.height = reader.readInt32()
        this.completeSize = reader.readInt32()
        if (reader.version[0] >= 2020) {
            this.mipsStripped = reader.readInt32()
        }
        if (
            this._platform &&
            this._platform.includes('Tuanjie') &&
            (reader.version[0] > 2022 ||
                (reader.version[0] === 2022 && reader.version[1] > 3) ||
                (reader.version[0] === 2022 && reader.version[1] === 3 && reader.version[2] >= 2))
        ) {
            reader.readBool()
            reader.align(4)
            reader.readInt32()
            reader.readInt32()
            this.m_DataStreamData = new StreamingInfo(reader)
        }
        this.textureFormat = TextureFormat[reader.readInt32()]
        if (
            this._platform &&
            this._platform.includes('Tuanjie') &&
            (reader.version[0] > 2022 ||
                (reader.version[0] === 2022 && reader.version[1] > 3) ||
                (reader.version[0] === 2022 && reader.version[1] === 3 && reader.version[2] >= 62))
        ) {
            let m_TextureManagerMultiFormatSettingSize = reader.readInt32()
            reader.position += m_TextureManagerMultiFormatSettingSize
            reader.align(4)
        }
        if (reader.versionLT(5, 2)) {
            this.mipMap = reader.readBool()
        } else {
            this.mipCount = reader.readInt32()
        }
        if (reader.versionGTE(2, 6)) {
            this.isReadable = reader.readBool()
        }
        if (reader.version[0] >= 2020) {
            this.isPreProcessed = reader.readBool()
        }
        if (reader.versionGTE(2019, 3)) {
            this.ignoreMasterTextureLimit = reader.readBool()
        }
        if (reader.version[0] >= 2022 && reader.version[1] >= 2) {
            reader.readBool()
            reader.align(4)
            reader.readAlignedString()
        }
        if (reader.version[0] >= 3) {
            if (reader.versionLT(5, 5)) {
                this.readAllowed = reader.readBool()
            }
        }
        if (reader.versionGTE(2018, 2)) {
            this.streamingMipmaps = reader.readBool()
        }
        reader.align(4)
        if (reader.versionGTE(2018, 2)) {
            this.streamingMipmapsPriority = reader.readInt32()
        }
        this.imageCount = reader.readInt32()
        this.textureDimension = reader.readInt32()
        this.textureSettings = new GLTextureSettings(reader)
        if (reader.version[0] >= 3) {
            this.lightmapFormat = reader.readInt32()
        }
        if (reader.versionGTE(3, 5)) {
            this.colorSpace = reader.readInt32()
        }
        if (reader.versionGTE(2020, 2)) {
            this.platformBlob = reader.read(reader.readInt32())
            reader.align(4)
        }
        let imageDataSize = reader.readInt32()
        this.streamData = null
        if (imageDataSize === 0 && reader.versionGTE(5, 3)) {
            this.streamData = new StreamingInfo(reader)
            this.data = null
        } else {
            this.streamData = null
            this.data = reader.read(imageDataSize)
        }

        this.exportExtension = this.imageCount === 1 ? '.png' : '.zip'

        // Parse custom fields if type trees are enabled
        if (reader.assetFile && reader.assetFile.enableTypeTrees) {
            const currentOffset = reader.tell()
            reader.seek(0)
            const typeTree = reader.assetFile.types[reader.typeID].tree
            this.fields = parseTypeTreeDirect(reader.assetFile, typeTree, reader, { has_registry: false }, (v) => v)
            reader.seek(currentOffset)
        } else {
            this.fields = null
        }
    }

    get name() {
        if (this.fields && typeof this.fields.m_Name !== 'undefined') {
            return this.fields.m_Name
        }
        return this._name
    }
    set name(val) {
        if (this.fields) {
            this.fields.m_Name = val
        }
        this._name = val
        this.setDirty()
    }

    get width() {
        if (this.fields && typeof this.fields.m_Width !== 'undefined') {
            return this.fields.m_Width
        }
        return this._width
    }
    set width(val) {
        if (this.fields) {
            this.fields.m_Width = val
        }
        this._width = val
        this.setDirty()
    }

    get height() {
        if (this.fields && typeof this.fields.m_Height !== 'undefined') {
            return this.fields.m_Height
        }
        return this._height
    }
    set height(val) {
        if (this.fields) {
            this.fields.m_Height = val
        }
        this._height = val
        this.setDirty()
    }

    get completeSize() {
        if (this.fields && typeof this.fields.m_CompleteImageSize !== 'undefined') {
            return this.fields.m_CompleteImageSize
        }
        return this._completeSize
    }
    set completeSize(val) {
        if (this.fields) {
            this.fields.m_CompleteImageSize = val
        }
        this._completeSize = val
    }

    get textureFormat() {
        if (this.fields && typeof this.fields.m_TextureFormat !== 'undefined') {
            return TextureFormat[this.fields.m_TextureFormat]
        }
        return this._textureFormat
    }
    set textureFormat(val) {
        let formatId = typeof val === 'number' ? val : Object.keys(TextureFormat).find((k) => TextureFormat[k] === val)
        formatId = Number(formatId)
        if (this.fields) {
            this.fields.m_TextureFormat = formatId
        }
        this._textureFormat = TextureFormat[formatId]
        this.setDirty()
    }

    get data() {
        if (this.fields && typeof this.fields['image data'] !== 'undefined') {
            return this.fields['image data']
        }
        return this._data
    }
    set data(val) {
        if (this.fields) {
            this.fields['image data'] = val
        }
        this._data = val
    }

    get streamData() {
        if (this.fields && typeof this.fields.m_StreamData !== 'undefined') {
            return this.fields.m_StreamData
        }
        return this._streamData
    }
    set streamData(val) {
        if (this.fields) {
            this.fields.m_StreamData = val
        }
        this._streamData = val
    }

    updateImage(pngBytes) {
        updateTexture2DImage(this, pngBytes)
    }

    async decodeRgba(worker = true, assetFile, options = {}) {
        return decodeTexture2DRgba(this, worker, assetFile, options)
    }

    async createImg(userConfig, assetFile) {
        let { worker } = {
            ...{ type: 'arrayBuffer', fileType: 'png', worker: true },
            ...userConfig,
        }
        let rgba = await this.decodeRgba(worker, assetFile, userConfig)
        if (!rgba) {
            throw new Error(`Failed to decode Texture2D RGBA data for ${this.name}`)
        }
        let data = await rgbaToPng({
            name: this.name,
            rgbaData: rgba,
            width: this.width,
            height: this.height,
            ...userConfig,
        })
        return data
    }

    serialize() {
        return serializeTexture2D(this)
    }
}
