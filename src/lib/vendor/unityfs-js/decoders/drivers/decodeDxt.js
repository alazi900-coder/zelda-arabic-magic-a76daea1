'use strict'

export function decodeBC1(imageData, width, height) {
    const rgba = new Uint8Array(width * height * 4)
    const height_4 = height >> 2
    const width_4 = width >> 2
    let offset = 0

    const colorDiv31 = 255 / 31
    const colorDiv63 = 255 / 63

    for (let h = 0; h < height_4; h++) {
        for (let w = 0; w < width_4; w++) {
            const color0 = imageData[offset] | (imageData[offset + 1] << 8)
            const color1 = imageData[offset + 2] | (imageData[offset + 3] << 8)

            const color0_r = (((color0 >>> 11) & 31) * colorDiv31) | 0
            const color0_g = (((color0 >>> 5) & 63) * colorDiv63) | 0
            const color0_b = ((color0 & 31) * colorDiv31) | 0

            const color1_r = (((color1 >>> 11) & 31) * colorDiv31) | 0
            const color1_g = (((color1 >>> 5) & 63) * colorDiv63) | 0
            const color1_b = ((color1 & 31) * colorDiv31) | 0

            let c0_r = color0_r,
                c0_g = color0_g,
                c0_b = color0_b,
                c0_a = 255
            let c1_r = color1_r,
                c1_g = color1_g,
                c1_b = color1_b,
                c1_a = 255
            let c2_r, c2_g, c2_b, c2_a
            let c3_r, c3_g, c3_b, c3_a

            if (color0 > color1) {
                c2_r = ((color0_r * 2 + color1_r) / 3) | 0
                c2_g = ((color0_g * 2 + color1_g) / 3) | 0
                c2_b = ((color0_b * 2 + color1_b) / 3) | 0
                c2_a = 255

                c3_r = ((color0_r + color1_r * 2) / 3) | 0
                c3_g = ((color0_g + color1_g * 2) / 3) | 0
                c3_b = ((color0_b + color1_b * 2) / 3) | 0
                c3_a = 255
            } else {
                c2_r = ((color0_r + color1_r) / 2) | 0
                c2_g = ((color0_g + color1_g) / 2) | 0
                c2_b = ((color0_b + color1_b) / 2) | 0
                c2_a = 255

                c3_r = 0
                c3_g = 0
                c3_b = 0
                c3_a = 0
            }

            const colorIndices =
                imageData[offset + 4] |
                (imageData[offset + 5] << 8) |
                (imageData[offset + 6] << 16) |
                (imageData[offset + 7] << 24)

            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    const pixelIndex = 3 - x + y * 4
                    const rgbaIndex = ((h * 4 + 3 - y) * width + (w * 4 + x)) * 4

                    const colorIndex = (colorIndices >>> (2 * (15 - pixelIndex))) & 0x03

                    if (colorIndex === 0) {
                        rgba[rgbaIndex] = c0_r
                        rgba[rgbaIndex + 1] = c0_g
                        rgba[rgbaIndex + 2] = c0_b
                        rgba[rgbaIndex + 3] = c0_a
                    } else if (colorIndex === 1) {
                        rgba[rgbaIndex] = c1_r
                        rgba[rgbaIndex + 1] = c1_g
                        rgba[rgbaIndex + 2] = c1_b
                        rgba[rgbaIndex + 3] = c1_a
                    } else if (colorIndex === 2) {
                        rgba[rgbaIndex] = c2_r
                        rgba[rgbaIndex + 1] = c2_g
                        rgba[rgbaIndex + 2] = c2_b
                        rgba[rgbaIndex + 3] = c2_a
                    } else {
                        rgba[rgbaIndex] = c3_r
                        rgba[rgbaIndex + 1] = c3_g
                        rgba[rgbaIndex + 2] = c3_b
                        rgba[rgbaIndex + 3] = c3_a
                    }
                }
            }

            offset += 8
        }
    }

    return rgba
}

export function decodeBC2(imageData, width, height, premultiplied) {
    const rgba = new Uint8Array(width * height * 4)
    const height_4 = height >> 2
    const width_4 = width >> 2
    let offset = 0

    const colorDiv31 = 255 / 31
    const colorDiv63 = 255 / 63

    for (let h = 0; h < height_4; h++) {
        for (let w = 0; w < width_4; w++) {
            const a0 = imageData[offset] | (imageData[offset + 1] << 8)
            const a1 = imageData[offset + 2] | (imageData[offset + 3] << 8)
            const a2 = imageData[offset + 4] | (imageData[offset + 5] << 8)
            const a3 = imageData[offset + 6] | (imageData[offset + 7] << 8)

            const color0 = imageData[offset + 8] | (imageData[offset + 9] << 8)
            const color1 = imageData[offset + 10] | (imageData[offset + 11] << 8)

            const color0_r = (((color0 >>> 11) & 31) * colorDiv31) | 0
            const color0_g = (((color0 >>> 5) & 63) * colorDiv63) | 0
            const color0_b = ((color0 & 31) * colorDiv31) | 0

            const color1_r = (((color1 >>> 11) & 31) * colorDiv31) | 0
            const color1_g = (((color1 >>> 5) & 63) * colorDiv63) | 0
            const color1_b = ((color1 & 31) * colorDiv31) | 0

            const c0_r = color0_r,
                c0_g = color0_g,
                c0_b = color0_b
            const c1_r = color1_r,
                c1_g = color1_g,
                c1_b = color1_b
            let c2_r, c2_g, c2_b
            let c3_r, c3_g, c3_b

            if (color0 > color1) {
                c2_r = ((color0_r * 2 + color1_r) / 3) | 0
                c2_g = ((color0_g * 2 + color1_g) / 3) | 0
                c2_b = ((color0_b * 2 + color1_b) / 3) | 0

                c3_r = ((color0_r + color1_r * 2) / 3) | 0
                c3_g = ((color0_g + color1_g * 2) / 3) | 0
                c3_b = ((color0_b + color1_b * 2) / 3) | 0
            } else {
                c2_r = ((color0_r + color1_r) / 2) | 0
                c2_g = ((color0_g + color1_g) / 2) | 0
                c2_b = ((color0_b + color1_b) / 2) | 0

                c3_r = 0
                c3_g = 0
                c3_b = 0
            }

            const colorIndices =
                imageData[offset + 12] |
                (imageData[offset + 13] << 8) |
                (imageData[offset + 14] << 16) |
                (imageData[offset + 15] << 24)

            const alphaWords = [a3, a2, a1, a0]

            for (let y = 0; y < 4; y++) {
                const alphaWord = alphaWords[y]
                for (let x = 0; x < 4; x++) {
                    const pixelIndex = 3 - x + y * 4
                    const rgbaIndex = ((h * 4 + 3 - y) * width + (w * 4 + x)) * 4
                    const colorIndex = (colorIndices >>> (2 * (15 - pixelIndex))) & 0x03
                    const alphaValue = ((alphaWord >>> (x << 2)) & 0x0f) * 17

                    const multiplier = premultiplied ? 255 / alphaValue : 1

                    let r, g, b
                    if (colorIndex === 0) {
                        r = c0_r
                        g = c0_g
                        b = c0_b
                    } else if (colorIndex === 1) {
                        r = c1_r
                        g = c1_g
                        b = c1_b
                    } else if (colorIndex === 2) {
                        r = c2_r
                        g = c2_g
                        b = c2_b
                    } else {
                        r = c3_r
                        g = c3_g
                        b = c3_b
                    }

                    if (premultiplied) {
                        rgba[rgbaIndex] = (r * multiplier) | 0
                        rgba[rgbaIndex + 1] = (g * multiplier) | 0
                        rgba[rgbaIndex + 2] = (b * multiplier) | 0
                    } else {
                        rgba[rgbaIndex] = r
                        rgba[rgbaIndex + 1] = g
                        rgba[rgbaIndex + 2] = b
                    }
                    rgba[rgbaIndex + 3] = alphaValue
                }
            }

            offset += 16
        }
    }

    return rgba
}

export function decodeBC3(imageData, width, height, premultiplied) {
    const rgba = new Uint8Array(width * height * 4)
    const height_4 = height >> 2
    const width_4 = width >> 2
    let offset = 0

    const colorDiv31 = 255 / 31
    const colorDiv63 = 255 / 63
    const alphaValues = new Uint8Array(8)

    for (let h = 0; h < height_4; h++) {
        for (let w = 0; w < width_4; w++) {
            const alpha0 = imageData[offset]
            const alpha1 = imageData[offset + 1]
            alphaValues[0] = alpha0
            alphaValues[1] = alpha1

            if (alpha0 > alpha1) {
                alphaValues[2] = ((alpha0 * 6 + alpha1 * 1) / 7) | 0
                alphaValues[3] = ((alpha0 * 5 + alpha1 * 2) / 7) | 0
                alphaValues[4] = ((alpha0 * 4 + alpha1 * 3) / 7) | 0
                alphaValues[5] = ((alpha0 * 3 + alpha1 * 4) / 7) | 0
                alphaValues[6] = ((alpha0 * 2 + alpha1 * 5) / 7) | 0
                alphaValues[7] = ((alpha0 * 1 + alpha1 * 6) / 7) | 0
            } else {
                alphaValues[2] = ((alpha0 * 4 + alpha1 * 1) / 5) | 0
                alphaValues[3] = ((alpha0 * 3 + alpha1 * 2) / 5) | 0
                alphaValues[4] = ((alpha0 * 2 + alpha1 * 3) / 5) | 0
                alphaValues[5] = ((alpha0 * 1 + alpha1 * 4) / 5) | 0
                alphaValues[6] = 0
                alphaValues[7] = 255
            }

            const alphaIndices0 = imageData[offset + 6] | (imageData[offset + 7] << 8)
            const alphaIndices1 = imageData[offset + 4] | (imageData[offset + 5] << 8)
            const alphaIndices2 = imageData[offset + 2] | (imageData[offset + 3] << 8)

            const color0 = imageData[offset + 8] | (imageData[offset + 9] << 8)
            const color1 = imageData[offset + 10] | (imageData[offset + 11] << 8)

            const color0_r = (((color0 >>> 11) & 31) * colorDiv31) | 0
            const color0_g = (((color0 >>> 5) & 63) * colorDiv63) | 0
            const color0_b = ((color0 & 31) * colorDiv31) | 0

            const color1_r = (((color1 >>> 11) & 31) * colorDiv31) | 0
            const color1_g = (((color1 >>> 5) & 63) * colorDiv63) | 0
            const color1_b = ((color1 & 31) * colorDiv31) | 0

            const c0_r = color0_r,
                c0_g = color0_g,
                c0_b = color0_b
            const c1_r = color1_r,
                c1_g = color1_g,
                c1_b = color1_b
            const c2_r = ((color0_r * 2 + color1_r) / 3) | 0
            const c2_g = ((color0_g * 2 + color1_g) / 3) | 0
            const c2_b = ((color0_b * 2 + color1_b) / 3) | 0
            const c3_r = ((color0_r + color1_r * 2) / 3) | 0
            const c3_g = ((color0_g + color1_g * 2) / 3) | 0
            const c3_b = ((color0_b + color1_b * 2) / 3) | 0

            const colorIndices =
                imageData[offset + 12] |
                (imageData[offset + 13] << 8) |
                (imageData[offset + 14] << 16) |
                (imageData[offset + 15] << 24)

            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    const pixelIndex = 3 - x + y * 4
                    const rgbaIndex = ((h * 4 + 3 - y) * width + (w * 4 + x)) * 4

                    const colorIndex = (colorIndices >>> (2 * (15 - pixelIndex))) & 0x03

                    const alphaShift = 3 * (15 - pixelIndex)
                    const alphaRow = (alphaShift / 16) | 0
                    const alphaBit = alphaShift % 16
                    let alphaIndex

                    let targetAlphaIndices = alphaIndices2
                    if (alphaRow === 1) {
                        targetAlphaIndices = alphaIndices1
                    } else if (alphaRow === 2) {
                        targetAlphaIndices = alphaIndices0
                    }

                    if (alphaBit <= 13) {
                        alphaIndex = (targetAlphaIndices >>> alphaBit) & 0x07
                    } else {
                        let nextAlphaIndices = alphaIndices1
                        if (alphaRow === 1) {
                            nextAlphaIndices = alphaIndices0
                        }
                        alphaIndex =
                            ((targetAlphaIndices >>> alphaBit) |
                                ((nextAlphaIndices & ((1 << (alphaBit - 13)) - 1)) << (16 - alphaBit))) &
                            0x07
                    }

                    const alphaValue = alphaValues[alphaIndex]
                    const multiplier = premultiplied ? 255 / alphaValue : 1

                    let r, g, b
                    if (colorIndex === 0) {
                        r = c0_r
                        g = c0_g
                        b = c0_b
                    } else if (colorIndex === 1) {
                        r = c1_r
                        g = c1_g
                        b = c1_b
                    } else if (colorIndex === 2) {
                        r = c2_r
                        g = c2_g
                        b = c2_b
                    } else {
                        r = c3_r
                        g = c3_g
                        b = c3_b
                    }

                    if (premultiplied) {
                        rgba[rgbaIndex] = (r * multiplier) | 0
                        rgba[rgbaIndex + 1] = (g * multiplier) | 0
                        rgba[rgbaIndex + 2] = (b * multiplier) | 0
                    } else {
                        rgba[rgbaIndex] = r
                        rgba[rgbaIndex + 1] = g
                        rgba[rgbaIndex + 2] = b
                    }
                    rgba[rgbaIndex + 3] = alphaValue
                }
            }

            offset += 16
        }
    }

    return rgba
}

export function decode(imageDataView, width, height, format) {
    var result

    format = format ? format.toLowerCase() : 'dxt1'

    const uint8Arr =
        imageDataView instanceof Uint8Array
            ? imageDataView
            : new Uint8Array(imageDataView.buffer, imageDataView.byteOffset, imageDataView.byteLength)

    if (format === decode.dxt1) {
        result = decodeBC1(uint8Arr, width, height)
    } else if (format === decode.dxt2) {
        result = decodeBC2(uint8Arr, width, height, true)
    } else if (format === decode.dxt3) {
        result = decodeBC2(uint8Arr, width, height, false)
    } else if (format === decode.dxt4) {
        result = decodeBC3(uint8Arr, width, height, true)
    } else if (format === decode.dxt5) {
        result = decodeBC3(uint8Arr, width, height, false)
    } else {
        throw new Error("Unknown DXT format : '" + format + "'")
    }
    return result
}

decode.dxt1 = 'dxt1'
decode.dxt2 = 'dxt2'
decode.dxt3 = 'dxt3'
decode.dxt4 = 'dxt4'
decode.dxt5 = 'dxt5'
