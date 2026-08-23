/**
 *
 * @param {BitReader} reader
 * @param {Number} endpointNumber 0-5
 * @param {Number} bitPrecision Number of bits per color
 * @param {Number} colorBitsStart Offset to r0
 * @param {Number} numberOfSubsets Optional
 * @returns {Uint8ClampedArray} Three uninterpolated color values in rgb order
 */
export default function getRGB(reader, endpointNumber, bitPrecision, colorBitsStart, numberOfSubsets = 1) {
    const endpointsTotal = numberOfSubsets * 2
    let offset = colorBitsStart
    // Offset to first red bit of chosen endpoint
    offset += bitPrecision * endpointNumber

    const rgb = new Uint8ClampedArray(3)
    for (let color = 0; color < 3; color++) {
        rgb[color] = reader.read(offset, bitPrecision)
        offset += bitPrecision * endpointsTotal
    }

    return rgb
}
