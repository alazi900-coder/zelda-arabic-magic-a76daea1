const DEFAULT_CONFIGS = {
    MonoBehaviour: { type: 'object' },
}

const sharedEncoder = new TextEncoder()

/**
 * 解析提取并根据导出配置反序列化 MonoBehaviour 数据
 */
export async function processMonoBehaviour(objectInfo, options, manager) {
    const config = { ...DEFAULT_CONFIGS.MonoBehaviour, ...options }

    const assetFile = objectInfo.assetFile || manager.primaryAssetFile
    const jsonData = assetFile ? assetFile.getObjectUsingTreeJSON(objectInfo) : null
    let dataR

    switch (config.type) {
        case 'object':
            dataR = jsonData
            break
        case 'arrayBuffer':
            dataR = sharedEncoder.encode(JSON.stringify(jsonData)).buffer
            break
        case 'text':
            dataR = JSON.stringify(jsonData)
            break
        default:
            dataR = jsonData
    }

    return { data: { raw: dataR } }
}
