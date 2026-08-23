import getIndex from '../functions/getIndex.js'
import decodeChannel from '../functions/decodeChannel.js'
import rotateRGBA from '../functions/rotateRGBA.js'
import getRGB from '../functions/getRGB.js'

const BIT_PRECISION = {
    ROTATION: 2,
    COLOR: 7,
    ALPHA: 8,
    INDEX: 2,
}
const OFFSET = {
    ROTATION: 6,
    COLOR: 8,
    ALPHA: 50,
    INDEX_COLOR: 66,
    INDEX_ALPHA: 97,
}

export default function mode5(reader) {
    const blockColors = new Uint8ClampedArray(64)

    const endpoints = [new Uint8ClampedArray(4), new Uint8ClampedArray(4)]
    for (let i = 0; i < 2; i++) {
        const rgb = getRGB(reader, i, BIT_PRECISION.COLOR, OFFSET.COLOR)
        endpoints[i].set(rgb)
        endpoints[i][3] = reader.read(OFFSET.ALPHA + i * BIT_PRECISION.ALPHA, BIT_PRECISION.ALPHA)
    }

    const rotation = reader.read(OFFSET.ROTATION, BIT_PRECISION.ROTATION)

    for (let i = 0; i < 16; i++) {
        const indexColor = getIndex(reader, i, OFFSET.INDEX_COLOR, BIT_PRECISION.INDEX)
        const indexAlpha = getIndex(reader, i, OFFSET.INDEX_ALPHA, BIT_PRECISION.INDEX)

        const pixelIdx = i * 4
        const rgba = new Uint8ClampedArray(4)
        for (let color = 0; color < 3; color++) {
            rgba[color] = decodeChannel(
                endpoints[0][color],
                endpoints[1][color],
                BIT_PRECISION.COLOR,
                indexColor,
                BIT_PRECISION.INDEX,
            )
        }
        rgba[3] = decodeChannel(endpoints[0][3], endpoints[1][3], BIT_PRECISION.ALPHA, indexAlpha, BIT_PRECISION.INDEX)

        if (rotation > 0) {
            rotateRGBA(rgba, rotation)
        }
        blockColors.set(rgba, pixelIdx)
    }
    return blockColors
}
