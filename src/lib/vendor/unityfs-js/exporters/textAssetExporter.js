const DEFAULT_CONFIGS = {
    TextAsset: { type: 'text' },
}

/**
 * 解析并提取 TextAsset 文字内容数据
 */
export async function processTextAsset(objectInfo, options) {
    const config = { ...DEFAULT_CONFIGS.TextAsset, ...options }

    let dataR
    if (config.type === 'arrayBuffer') {
        dataR = objectInfo.object.data
    } else {
        dataR =
            objectInfo.object && typeof objectInfo.object.getExport === 'function' ? objectInfo.object.getExport() : ''
    }

    return { data: { raw: dataR } }
}
