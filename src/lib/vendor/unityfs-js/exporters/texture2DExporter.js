const DEFAULT_CONFIGS = {
    Texture2D: { type: 'arrayBuffer' },
}

/**
 * 解析并提取 Texture2D 图像数据
 */
export async function processTexture2D(objectInfo, options, manager) {
    const config = { ...DEFAULT_CONFIGS.Texture2D, ...options }
    const assetFile = objectInfo.assetFile || manager.primaryAssetFile
    return {
        data: await objectInfo.object.createImg(config, assetFile),
    }
}
