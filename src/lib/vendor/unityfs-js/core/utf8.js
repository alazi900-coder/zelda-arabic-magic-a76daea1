const utf8Decoder = new TextDecoder('utf-8', { ignoreBOM: true })

// 阈值定义：1KB 以下的字符串采用纯 JS 解码以避免 JS-to-C++ 调用壁垒开销
const PURE_JS_THRESHOLD = 1024

export function decodeUTF8(buffer) {
    const bytes = new Uint8Array(buffer)
    const len = bytes.length

    // 大数据量情况下，直接回退至原生的 TextDecoder (底层 C++ 级别执行，最高效率)
    if (len > PURE_JS_THRESHOLD) {
        return utf8Decoder.decode(bytes)
    }

    // 小数据量字符串（如资产路径、名称等），纯 JS 解码速度最快
    let i = 0

    // 自动跳过 UTF-8 BOM 头 (EF BB BF)
    if (len >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        i = 3
    }

    const chunk = new Array(len)
    let chunkIdx = 0

    while (i < len) {
        let c = bytes[i++]
        if (c < 0x80) {
            // 单字节 ASCII (0xxxxxxx)
            chunk[chunkIdx++] = c
        } else if (c < 0xc0) {
            // 忽略无效连续字节
        } else if (c < 0xe0) {
            // 双字节 (110xxxxx 10xxxxxx)
            if (i < len) {
                chunk[chunkIdx++] = ((c & 0x1f) << 6) | (bytes[i++] & 0x3f)
            }
        } else if (c < 0xf0) {
            // 三字节 (1110xxxx 10xxxxxx 10xxxxxx)
            if (i + 1 < len) {
                chunk[chunkIdx++] = ((c & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)
            }
        } else if (c < 0xf8) {
            // 四字节 (11110xxx 10xxxxxx 10xxxxxx 10xxxxxx)
            if (i + 2 < len) {
                const cp =
                    ((c & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)
                if (cp < 0x10000) {
                    chunk[chunkIdx++] = cp
                } else {
                    const adjusted = cp - 0x10000
                    chunk[chunkIdx++] = ((adjusted >> 10) & 0x3ff) | 0xd800
                    chunk[chunkIdx++] = (adjusted & 0x3ff) | 0xdc00
                }
            }
        }
    }

    if (chunkIdx === 0) {
        return ''
    }

    return String.fromCharCode.apply(null, chunk.slice(0, chunkIdx))
}
