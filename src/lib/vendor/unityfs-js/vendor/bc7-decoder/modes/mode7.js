import addPbits from '../functions/addPbits.js'
import decodeChannel from '../functions/decodeChannel.js'
import getIndex from '../functions/getIndex.js'
import getRGB from '../functions/getRGB.js'
import getSubsetNumber from '../functions/getSubsetNumber.js'

const MODE = 7
const NUM_SUBSETS = 2
const PBITS = true
const BIT_PRECISION = {
    PARTITION: 6,
    COLOR: 5,
    ALPHA: 5,
    INDEX: 2,
}
const OFFSET = {
    PARTITION: 8,
    COLOR: 14,
    ALPHA: 74,
    INDEX: 98,
}

export default function mode7(reader) {
    const blockColors = new Uint8ClampedArray(64)
    const partitionNumber = reader.read(OFFSET.PARTITION, BIT_PRECISION.PARTITION)

    const subsetEndpoints = []
    for (let s = 0; s < NUM_SUBSETS; s++) {
        let endpointNumber = s * 2
        const endpoints = [new Uint8ClampedArray(4), new Uint8ClampedArray(4)]
        for (let i = 0; i < 2; i++) {
            const epIdx = endpointNumber + i
            const rgb = getRGB(reader, epIdx, BIT_PRECISION.COLOR, OFFSET.COLOR, NUM_SUBSETS)
            endpoints[i].set(rgb)
            endpoints[i][3] = reader.read(OFFSET.ALPHA + epIdx * BIT_PRECISION.ALPHA, BIT_PRECISION.ALPHA)
        }
        addPbits(reader, MODE, endpoints, s)
        subsetEndpoints.push(endpoints)
    }

    for (let i = 0; i < 16; i++) {
        const subsetNumber = getSubsetNumber(i, NUM_SUBSETS, partitionNumber)
        const endpoints = subsetEndpoints[subsetNumber]
        const index = getIndex(reader, i, OFFSET.INDEX, BIT_PRECISION.INDEX, NUM_SUBSETS, partitionNumber)

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
