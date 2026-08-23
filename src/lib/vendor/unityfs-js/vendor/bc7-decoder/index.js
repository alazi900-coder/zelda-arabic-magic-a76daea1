import BitReader from './functions/BitReader.js'
import getMode from './functions/getMode.js'
import mode0 from './modes/mode0.js'
import mode1 from './modes/mode1.js'
import mode2 from './modes/mode2.js'
import mode3 from './modes/mode3.js'
import mode4 from './modes/mode4.js'
import mode5 from './modes/mode5.js'
import mode6 from './modes/mode6.js'
import mode7 from './modes/mode7.js'

const blockSize = 16 // Bytes

const modeFunctions = [mode0, mode1, mode2, mode3, mode4, mode5, mode6, mode7]

export default function decodeBC7(data, width, height) {
    const rgbaArray = new Uint8ClampedArray(width * height * 4)
    const dataView = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data)
    const blocksWide = Math.ceil(width / 4)
    const blocksHigh = Math.ceil(height / 4)

    for (let blockY = 0; blockY < blocksHigh; blockY++) {
        for (let blockX = 0; blockX < blocksWide; blockX++) {
            const byteOffset = (blockY * blocksWide + blockX) * blockSize
            if (byteOffset + blockSize > data.byteLength) break

            const reader = new BitReader(dataView, byteOffset)
            const mode = getMode(reader)

            if (mode >= 0 && mode <= 7) {
                const blockColors = modeFunctions[mode](reader)

                // Copy block colors to output array
                const startY = blockY * 4
                const startX = blockX * 4

                for (let y = 0; y < 4; y++) {
                    const currentY = startY + y
                    if (currentY >= height) break

                    for (let x = 0; x < 4; x++) {
                        const currentX = startX + x
                        if (currentX >= width) break

                        const pixelIdx = (currentY * width + currentX) * 4
                        const blockPixelIdx = (y * 4 + x) * 4

                        rgbaArray[pixelIdx] = blockColors[blockPixelIdx]
                        rgbaArray[pixelIdx + 1] = blockColors[blockPixelIdx + 1]
                        rgbaArray[pixelIdx + 2] = blockColors[blockPixelIdx + 2]
                        rgbaArray[pixelIdx + 3] = blockColors[blockPixelIdx + 3]
                    }
                }
            } else {
                // Invalid mode, fill with red as before
                fillErrorBlock(rgbaArray, blockX, blockY, width, height)
            }
        }
    }
    return rgbaArray
}

function fillErrorBlock(rgbaArray, blockX, blockY, width, height) {
    const startY = blockY * 4
    const startX = blockX * 4
    for (let y = 0; y < 4; y++) {
        if (startY + y >= height) break
        for (let x = 0; x < 4; x++) {
            if (startX + x >= width) break
            const pixelIdx = ((startY + y) * width + (startX + x)) * 4
            rgbaArray[pixelIdx] = 250
            rgbaArray[pixelIdx + 1] = 0
            rgbaArray[pixelIdx + 2] = 0
            rgbaArray[pixelIdx + 3] = 250
        }
    }
}
