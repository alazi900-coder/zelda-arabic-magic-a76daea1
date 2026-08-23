/**
 * 裁切 RGBA8888 图像数据
 * @param {Uint8Array} imageData - 原始图像数据 (RGBA8888格式)
 * @param {number} width - 原始图像宽度
 * @param {number} height - 原始图像高度
 * @param {Object} cropRect - 裁切区域 {x, y, width, height}
 * @returns {Uint8Array} 裁切后的新RGBA8888数据
 */
export function cropImage(imageData, width, height, cropRect) {
    // 参数校验
    if (imageData.length !== width * height * 4) {
        throw new Error('图像数据尺寸与宽高不匹配')
    }
    // 校验并修正裁切区域
    const rect = validateCropRect(width, height, cropRect)
    const x = rect.x
    const y = rect.y
    const cropWidth = rect.cropWidth
    const cropHeight = rect.cropHeight

    // 创建裁切后的数据容器
    const croppedData = new Uint8Array(cropWidth * cropHeight * 4)

    const rowBytes = cropWidth * 4
    // 逐行复制像素数据
    for (let row = 0; row < cropHeight; row++) {
        const sourceRow = y + row
        const targetRow = row

        // 计算起始位置
        const sourceStart = (sourceRow * width + x) * 4
        const targetStart = targetRow * rowBytes

        // 使用 subarray + set 原生块复制当前行数据
        croppedData.set(imageData.subarray(sourceStart, sourceStart + rowBytes), targetStart)
    }

    return croppedData
}

/**
 * 校验裁切区域参数
 */
function validateCropRect(imgWidth, imgHeight, rect) {
    var x = Math.max(0, Math.floor(rect.x || 0))
    var y = Math.max(0, Math.floor(rect.y || 0))
    var cropWidth = Math.min(rect.width, imgWidth - x)
    var cropHeight = Math.min(rect.height, imgHeight - y)

    if (cropWidth <= 0 || cropHeight <= 0) {
        throw new Error('裁切区域尺寸无效')
    }

    return {
        x: x,
        y: y,
        cropWidth: cropWidth,
        cropHeight: cropHeight,
    }
}

/**
 * 将对象中的所有数值向下取整
 * @param {Object} obj - 要处理的对象
 * @returns {Object} 处理后的新对象
 */
export function floorAllValues(obj) {
    // 如果是数组，处理每个元素
    if (Array.isArray(obj)) {
        return obj.map((item) => floorAllValues(item))
    }

    // 如果是对象，处理每个属性
    if (typeof obj === 'object' && obj !== null) {
        const result = {}
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                result[key] = floorAllValues(obj[key])
            }
        }
        return result
    }

    // 如果是数字，向下取整
    if (typeof obj === 'number') {
        return Math.floor(obj)
    }

    // 其他类型直接返回
    return obj
}

/**
 * 将图像扩展到指定画布大小
 * @param {Uint8Array} imageData - 原始图像RGBA8888数据
 * @param {Object} imageRect - 原始图像位置和尺寸 {x, y, width, height}
 * @param {number} canvasWidth - 目标画布宽度
 * @param {number} canvasHeight - 目标画布高度
 * @param {number} [fillColor=0x00000000] - 填充颜色(ARGB格式，默认透明黑)
 * @returns {Uint8Array} 扩展后的RGBA8888数据
 */
export function expandImage(imageData, imageRect, canvasWidth, canvasHeight, fillColor = 0x00000000) {
    // 解构参数
    const { x, y, width, height } = imageRect

    // 创建目标数组并填充背景色
    const expandedData = new Uint8Array(canvasWidth * canvasHeight * 4)

    // 仅在非透明背景色时进行填充操作
    if (fillColor !== 0) {
        const a = (fillColor >>> 24) & 0xff
        const r = (fillColor >>> 16) & 0xff
        const g = (fillColor >>> 8) & 0xff
        const b = fillColor & 0xff

        if (r === g && g === b && b === a) {
            expandedData.fill(r)
        } else {
            for (let i = 0; i < expandedData.length; i += 4) {
                expandedData[i] = r
                expandedData[i + 1] = g
                expandedData[i + 2] = b
                expandedData[i + 3] = a
            }
        }
    }

    // 计算图像在画布中的边界
    const imgLeft = Math.max(0, x)
    const imgTop = Math.max(0, y)
    const imgRight = Math.min(canvasWidth, x + width)
    const imgBottom = Math.min(canvasHeight, y + height)

    // 边界合理性检查，防止重叠区域为空
    if (imgLeft < imgRight && imgTop < imgBottom) {
        // 考虑负数偏移量的起始行与终止行
        const rowStart = Math.max(0, -y)
        const rowEnd = Math.min(height, canvasHeight - y)
        const srcColStart = Math.max(0, -x)
        const copyWidth = imgRight - imgLeft
        const rowBytes = copyWidth * 4

        for (let row = rowStart; row < rowEnd; row++) {
            const canvasRow = y + row
            if (canvasRow >= imgBottom) break

            const srcStart = (row * width + srcColStart) * 4
            const dstStart = (canvasRow * canvasWidth + imgLeft) * 4

            // 使用 subarray + set 高性能行级批量块复制
            expandedData.set(imageData.subarray(srcStart, srcStart + rowBytes), dstStart)
        }
    }

    return expandedData
}
