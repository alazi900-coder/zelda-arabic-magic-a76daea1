import decodeChannel from '../functions/decodeChannel.js'
import getIndex from '../functions/getIndex.js'
import getRGB from '../functions/getRGB.js'
import getSubsetNumber from '../functions/getSubsetNumber.js'

const MODE = 2
const NUM_SUBSETS = 3
const BIT_PRECISION = {
    PARTITION: 6,
    COLOR: 5,
    INDEX: 2,
}
const OFFSET = {
    PARTITION: 3,
    COLOR: 9,
    INDEX: 99,
}

export default function mode2(reader) {
    const blockColors = new Uint8ClampedArray(64)
    const partitionNumber = reader.read(OFFSET.PARTITION, BIT_PRECISION.PARTITION)

    const subsetEndpoints = []
    for (let s = 0; s < NUM_SUBSETS; s++) {
        let endpointNumber = s * 2
        const rgb = [
            getRGB(reader, endpointNumber, BIT_PRECISION.COLOR, OFFSET.COLOR, NUM_SUBSETS),
            getRGB(reader, ++endpointNumber, BIT_PRECISION.COLOR, OFFSET.COLOR, NUM_SUBSETS),
        ]
        subsetEndpoints.push(rgb)
    }

    for (let i = 0; i < 16; i++) {
        const subsetNumber = getSubsetNumber(i, NUM_SUBSETS, partitionNumber)
        const rgb = subsetEndpoints[subsetNumber]
        const index = getIndex(reader, i, OFFSET.INDEX, BIT_PRECISION.INDEX, NUM_SUBSETS, partitionNumber)

        const pixelIdx = i * 4
        for (let color = 0; color < 3; color++) {
            blockColors[pixelIdx + color] = decodeChannel(
                rgb[0][color],
                rgb[1][color],
                BIT_PRECISION.COLOR,
                index,
                BIT_PRECISION.INDEX,
            )
        }
        blockColors[pixelIdx + 3] = 255
    }
    return blockColors
}
