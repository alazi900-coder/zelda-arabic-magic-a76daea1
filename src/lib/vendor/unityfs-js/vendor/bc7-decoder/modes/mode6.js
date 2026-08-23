import addPbits from '../functions/addPbits.js'
import decodeChannel from '../functions/decodeChannel.js'
import getIndex from '../functions/getIndex.js'
import getRGB from '../functions/getRGB.js'

const MODE = 6
const PBITS = true
const BIT_PRECISION = {
    COLOR: 7,
    ALPHA: 7,
    INDEX: 4,
}
const OFFSET = {
    COLOR: 7,
    ALPHA: 49,
    INDEX: 65,
}

export default function mode6(reader) {
    const blockColors = new Uint8ClampedArray(64)

    const endpoints = [new Uint8ClampedArray(4), new Uint8ClampedArray(4)]
    for (let i = 0; i < 2; i++) {
        const rgb = getRGB(reader, i, BIT_PRECISION.COLOR, OFFSET.COLOR)
        endpoints[i].set(rgb)
        endpoints[i][3] = reader.read(OFFSET.ALPHA + i * BIT_PRECISION.ALPHA, BIT_PRECISION.ALPHA)
    }
    addPbits(reader, MODE, endpoints)

    for (let i = 0; i < 16; i++) {
        const index = getIndex(reader, i, OFFSET.INDEX, BIT_PRECISION.INDEX)

        const pixelIdx = i * 4
        for (let color = 0; color < 3; color++) {
            blockColors[pixelIdx + color] = decodeChannel(
                endpoints[0][color],
                endpoints[1][color],
                BIT_PRECISION.COLOR,
                index,
                BIT_PRECISION.INDEX,
                PBITS,
            )
        }
        blockColors[pixelIdx + 3] = decodeChannel(
            endpoints[0][3],
            endpoints[1][3],
            BIT_PRECISION.ALPHA,
            index,
            BIT_PRECISION.INDEX,
            PBITS,
        )
    }
    return blockColors
}
