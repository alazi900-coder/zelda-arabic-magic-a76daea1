import UPNG from '../../../vendor/upng/UPNG.js'
import { BinaryWriter } from '../../../core/binaryStream.js'
import { writeTypeTreeDirect } from '../../typeTree/index.js'
import { flipImageVertical } from './reader.js'

export function updateTexture2DImage(texture, pngBytes) {
    if (!texture.fields) {
        throw new Error('TypeTree must be enabled to edit Texture2D assets')
    }
    const img = UPNG.decode(pngBytes)
    const rgba = new Uint8Array(UPNG.toRGBA8(img)[0])
    const width = img.width
    const height = img.height

    const flipped = flipImageVertical(rgba, width, height)

    texture.fields.m_Width = width
    texture.fields.m_Height = height
    texture.fields.m_CompleteImageSize = flipped.length
    texture.fields.m_TextureFormat = 4 // RGBA32
    texture.fields.m_MipCount = 1
    texture.fields['image data'] = flipped

    if (texture.fields.m_StreamData) {
        texture.fields.m_StreamData.offset = BigInt(0)
        texture.fields.m_StreamData.size = 0
        texture.fields.m_StreamData.path = ''
    }

    texture.cachedRaw = rgba
    texture._data = flipped
    texture.setDirty()
}

export function serializeTexture2D(texture) {
    if (!texture._isDirty) {
        return texture._raw
    }
    if (texture.fields) {
        const writer = new BinaryWriter(0, texture.reader.endian)
        const typeTree = texture.reader.assetFile.types[texture.typeID].tree
        writeTypeTreeDirect(texture.reader.assetFile, typeTree, writer, texture.fields)
        return writer.getData()
    }
    return texture._raw
}
