import decodeChannel from '../functions/decodeChannel.js'
import getRGB from '../functions/getRGB.js'
import getIndex from '../functions/getIndex.js'
import rotateRGBA from '../functions/rotateRGBA.js'

const BIT_PRECISION = {
    ROTATION: 2,
    INDEX_MODE: 1,
    COLOR: 5,
    ALPHA: 6,
    INDEX_PRIMARY: 2,
    INDEX_SECONDARY: 3,
}
const OFFSET = {
    ROTATION: 5,
    INDEX_MODE: 7,
    COLOR: 8,
    ALPHA: 38,
    INDEX_PRIMARY: 50,
    INDEX_SECONDARY: 81,
}

export default function mode4(reader) {
    const blockColors = new Uint8ClampedArray(64)

    const endpoints = [new Uint8ClampedArray(4), new Uint8ClampedArray(4)]
    for (let i = 0; i < 2; i++) {
        const rgb = getRGB(reader, i, BIT_PRECISION.COLOR, OFFSET.COLOR)
        endpoints[i].set(rgb)
        endpoints[i][3] = reader.read(OFFSET.ALPHA + i * BIT_PRECISION.ALPHA, BIT_PRECISION.ALPHA)
    }

    const indexMode = reader.read(OFFSET.INDEX_MODE, BIT_PRECISION.INDEX_MODE)
    const rotation = reader.read(OFFSET.ROTATION, BIT_PRECISION.ROTATION)

    for (let i = 0; i < 16; i++) {
        let indexColor, indexColorPrecision
        let indexAlpha, indexAlphaPrecision

        if (indexMode === 0) {
            indexColor = getIndex(reader, i, OFFSET.INDEX_PRIMARY, BIT_PRECISION.INDEX_PRIMARY)
            indexColorPrecision = BIT_PRECISION.INDEX_PRIMARY
            indexAlpha = getIndex(reader, i, OFFSET.INDEX_SECONDARY, BIT_PRECISION.INDEX_SECONDARY)
            indexAlphaPrecision = BIT_PRECISION.INDEX_SECONDARY
        } else {
            indexAlpha = getIndex(reader, i, OFFSET.INDEX_PRIMARY, BIT_PRECISION.INDEX_PRIMARY)
            indexAlphaPrecision = BIT_PRECISION.INDEX_PRIMARY
            indexColor = getIndex(reader, i, OFFSET.INDEX_SECONDARY, BIT_PRECISION.INDEX_SECONDARY)
            indexColorPrecision = BIT_PRECISION.INDEX_SECONDARY
        }

        const pixelIdx = i * 4
        const rgba = new Uint8ClampedArray(4)
        for (let color = 0; color < 3; color++) {
            rgba[color] = decodeChannel(
                endpoints[0][color],
                endpoints[1][color],
                BIT_PRECISION.COLOR,
                indexColor,
                indexColorPrecision,
            )
        }
        rgba[3] = decodeChannel(endpoints[0][3], endpoints[1][3], BIT_PRECISION.ALPHA, indexAlpha, indexAlphaPrecision)

        if (rotation > 0) {
            rotateRGBA(rgba, rotation)
        }
        blockColors.set(rgba, pixelIdx)
    }
    return blockColors
}
