const DEFAULT_CONFIGS = {
    AudioClip: { type: 'arrayBuffer' },
}

/**
 * 将 ArrayBuffer 快速转换为 Base64 编码 of DataURL 字符串
 * @param {ArrayBuffer} buffer 输入的二进制缓冲区
 * @param {string} [mimeType='application/octet-stream'] MIME 媒体格式类型
 * @returns {string} Base64 格式的 DataURL 字符串
 */
function arrayBufferToDataURL(buffer, mimeType = 'application/octet-stream') {
    if (!buffer) return ''

    const bytes = new Uint8Array(buffer)
    const len = bytes.length
    const chunks = []
    const chunkSize = 16384

    for (let i = 0; i < len; i += chunkSize) {
        chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)))
    }

    return `data:${mimeType};base64,${btoa(chunks.join(''))}`
}

/**
 * 解析并生成 AudioClip 声音数据的物理文件流
 */
export async function processAudioClip(objectInfo, options, filePath, manager) {
    const config = { ...DEFAULT_CONFIGS.AudioClip, ...options }
    const assetFile = objectInfo.assetFile || manager.primaryAssetFile
    const audioData = await objectInfo.object.createAudioData(assetFile)
    if (!audioData) return null

    let mimeType = `audio/${audioData.fileType}`
    if (audioData.fileType === 'm4a') mimeType = 'audio/mp4'

    let dataR
    switch (config.type) {
        case 'arrayBuffer':
            dataR = audioData.data
            break
        case 'blob':
            dataR = new Blob([audioData.data], { type: mimeType })
            break
        case 'blobURL':
            dataR = URL.createObjectURL(new Blob([audioData.data], { type: mimeType }))
            break
        case 'dataURL':
            dataR = arrayBufferToDataURL(audioData.data, mimeType)
            break
        default:
            dataR = audioData.data
    }

    return {
        data: { raw: dataR },
        fileType: audioData.fileType,
        type: config.type,
        src: filePath.path
            ? `${filePath.path}/${objectInfo.name}.${audioData.fileType}`
            : `${objectInfo.name}.${audioData.fileType}`,
    }
}
