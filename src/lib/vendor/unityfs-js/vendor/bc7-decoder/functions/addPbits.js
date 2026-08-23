export default function addPbits(reader, mode, endpointPair, subsetNumber = 0) {
    leftShiftChannels(endpointPair)
    const pbitPair = getPbits(reader, mode, subsetNumber)
    insertPbits(endpointPair, pbitPair)
}

function leftShiftChannels(endpointPair) {
    for (let i = 0; i < endpointPair.length; i++) {
        const endpoint = endpointPair[i]
        for (let j = 0; j < endpoint.length; j++) {
            endpoint[j] <<= 1
        }
    }
}
function insertPbits(endpointPair, pbits) {
    for (let i = 0; i < endpointPair.length; i++) {
        const endpoint = endpointPair[i]
        for (let j = 0; j < endpoint.length; j++) {
            endpoint[j] |= pbits[i]
        }
    }
}
function getPbits(reader, mode, subsetNumber) {
    let offset = subsetNumber * 2
    let sharedPbits = false

    switch (mode) {
        case 0:
            offset += 77
            break
        case 1:
            offset += 80
            sharedPbits = true
            break
        case 3:
            offset += 94
            break
        case 6:
            offset += 63
            break
        case 7:
            offset += 94
            break
    }

    let pbits = new Uint8Array(2)
    if (sharedPbits) {
        const pbit = reader.read(offset, 1)
        pbits[0] = pbit
        pbits[1] = pbit
    } else {
        pbits[0] = reader.read(offset, 1)
        pbits[1] = reader.read(offset + 1, 1)
    }

    return pbits
}
