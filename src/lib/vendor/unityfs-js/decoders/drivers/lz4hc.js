// LZ4HC-style block compressor for UnityFS. It emits standard LZ4 blocks,
// but searches a bounded hash chain for longer matches than the fast encoder.
const MIN_MATCH = 4
const LAST_LITERALS = 5
const HASH_SIZE = 1 << 16
const MAX_DISTANCE = 0xffff
const CHAIN_LIMIT = 4096

function hashAt(src, index) {
    const value =
        src[index] |
        (src[index + 1] << 8) |
        (src[index + 2] << 16) |
        (src[index + 3] << 24)
    return (Math.imul(value, 2654435761) >>> 16) & 0xffff
}

function sameFour(src, a, b) {
    return src[a] === src[b] && src[a + 1] === src[b + 1] && src[a + 2] === src[b + 2] && src[a + 3] === src[b + 3]
}

function writeExtendedLength(dst, index, length) {
    while (length >= 0xff) {
        dst[index++] = 0xff
        length -= 0xff
    }
    dst[index++] = length
    return index
}

function writeSequence(dst, index, src, anchor, position, candidate, matchLength) {
    const literalLength = position - anchor
    const matchExtra = matchLength - MIN_MATCH
    dst[index++] = (Math.min(literalLength, 15) << 4) | Math.min(matchExtra, 15)

    if (literalLength >= 15) {
        index = writeExtendedLength(dst, index, literalLength - 15)
    }
    dst.set(src.subarray(anchor, position), index)
    index += literalLength

    const offset = position - candidate
    dst[index++] = offset & 0xff
    dst[index++] = offset >>> 8

    if (matchExtra >= 15) {
        index = writeExtendedLength(dst, index, matchExtra - 15)
    }
    return index
}

function writeLastLiterals(dst, index, src, anchor, end) {
    const literalLength = end - anchor
    dst[index++] = Math.min(literalLength, 15) << 4
    if (literalLength >= 15) {
        index = writeExtendedLength(dst, index, literalLength - 15)
    }
    dst.set(src.subarray(anchor, end), index)
    return index + literalLength
}

/**
 * Compress a raw LZ4 block with a deeper match search suitable for UnityFS
 * blocks marked as CompressionType.LZ4HC. The wire format remains ordinary
 * LZ4, so Unity's existing LZ4 decompressor can read it safely.
 */
export function compressBlockHC(src, dst, start, length) {
    const end = start + length
    const matchLimit = end - LAST_LITERALS
    const heads = new Int32Array(HASH_SIZE)
    const chains = new Int32Array(length)
    heads.fill(-1)
    chains.fill(-1)

    const insert = (position) => {
        if (position + MIN_MATCH > end) return
        const hash = hashAt(src, position)
        chains[position - start] = heads[hash]
        heads[hash] = position
    }

    const findBest = (position) => {
        if (position + MIN_MATCH > matchLimit) return null
        let candidate = heads[hashAt(src, position)]
        let best = null
        let bestLength = MIN_MATCH - 1
        let probes = 0

        while (candidate >= start && position - candidate <= MAX_DISTANCE && probes++ < CHAIN_LIMIT) {
            if (sameFour(src, position, candidate)) {
                let candidateLength = MIN_MATCH
                while (position + candidateLength < matchLimit && src[position + candidateLength] === src[candidate + candidateLength]) {
                    candidateLength++
                }
                if (candidateLength > bestLength) {
                    best = candidate
                    bestLength = candidateLength
                    if (position + candidateLength >= matchLimit) break
                }
            }
            candidate = chains[candidate - start]
        }

        return best === null ? null : { candidate: best, length: bestLength }
    }

    let position = start
    let anchor = start
    let output = 0

    while (position + MIN_MATCH <= matchLimit) {
        const best = findBest(position)
        insert(position)

        if (!best) {
            position++
            continue
        }

        const next = findBest(position + 1)
        if (next && next.length > best.length) {
            position++
            continue
        }

        output = writeSequence(dst, output, src, anchor, position, best.candidate, best.length)
        const matchEnd = position + best.length
        for (let inserted = position + 1; inserted < matchEnd; inserted++) {
            insert(inserted)
        }
        position = matchEnd
        anchor = position
    }

    return writeLastLiterals(dst, output, src, anchor, end)
}
