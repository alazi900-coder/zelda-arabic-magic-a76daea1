import { cropImage, expandImage } from '../unityfs/imageProcessing.js'
import { rgbaToPng } from '../unityfs/classes/texture2d.js'
import { BinaryReader } from '../core/binaryStream.js'

// Helper to check if a point is inside a triangle (Barycentric coordinate method)
function pointInTriangle(px, py, a, b, c) {
    const v0x = c[0] - a[0],
        v0y = c[1] - a[1]
    const v1x = b[0] - a[0],
        v1y = b[1] - a[1]
    const v2x = px - a[0],
        v2y = py - a[1]

    const dot00 = v0x * v0x + v0y * v0y
    const dot01 = v0x * v1x + v0y * v1y
    const dot02 = v0x * v2x + v0y * v2y
    const dot11 = v1x * v1x + v1y * v1y
    const dot12 = v1x * v2x + v1y * v2y

    const invDenom = 1 / (dot00 * dot11 - dot01 * dot01)
    if (!isFinite(invDenom)) return false

    const u = (dot11 * dot02 - dot01 * dot12) * invDenom
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom

    return u >= 0 && v >= 0 && u + v <= 1.00001
}

// Helper to check if a point is inside a triangle using precomputed barycentric coefficients
function pointInTrianglePrecomputed(px, py, pre) {
    const v2x = px - pre.a[0]
    const v2y = py - pre.a[1]

    const dot02 = pre.v0x * v2x + pre.v0y * v2y
    const dot12 = pre.v1x * v2x + pre.v1y * v2y

    const u = (pre.dot11 * dot02 - pre.dot01 * dot12) * pre.invDenom
    const v = (pre.dot00 * dot12 - pre.dot01 * dot02) * pre.invDenom

    return u >= 0 && v >= 0 && u + v <= 1.00001
}

// Helper to extract mesh triangles from SpriteRenderData
function getTriangles(rd, reader) {
    if (rd.vertices && rd.vertices.length > 0) {
        // 5.6 down
        const vertices = rd.vertices.map((v) => v.pos)
        const triangleCount = Math.floor(rd.indexBuffer.length / 3)
        const triangles = []
        for (let i = 0; i < triangleCount; i++) {
            const first = rd.indexBuffer[i * 3]
            const second = rd.indexBuffer[i * 3 + 1]
            const third = rd.indexBuffer[i * 3 + 2]
            triangles.push([vertices[first], vertices[second], vertices[third]])
        }
        return triangles
    } else {
        // 5.6 and up
        const triangles = []
        const vertexData = rd.vertexData
        if (!vertexData || !vertexData.channels || !vertexData.streams || !vertexData.data) {
            return []
        }
        const channel = vertexData.channels[0] // kShaderChannelVertex
        const stream = vertexData.streams[channel.stream]
        const version = reader.version
        const endian = reader.endian

        const vertexReader = new BinaryReader(vertexData.data)
        vertexReader.version = version
        vertexReader.endian = endian

        const indexReader = new BinaryReader(rd.indexBuffer)
        indexReader.version = version
        indexReader.endian = endian

        for (const subMesh of rd.subMeshes) {
            vertexReader.seek(stream.offset + subMesh.firstVertex * stream.stride + channel.offset)
            const vertices = new Array(subMesh.vertexCount)
            for (let v = 0; v < subMesh.vertexCount; v++) {
                vertices[v] = vertexReader.readVector3()
                vertexReader.seek(vertexReader.offset + stream.stride - 12)
            }

            indexReader.seek(subMesh.firstByte)
            const triangleCount = Math.floor(subMesh.indexCount / 3)
            for (let i = 0; i < triangleCount; i++) {
                const first = indexReader.readUInt16() - subMesh.firstVertex
                const second = indexReader.readUInt16() - subMesh.firstVertex
                const third = indexReader.readUInt16() - subMesh.firstVertex
                triangles.push([vertices[first], vertices[second], vertices[third]])
            }
        }
        return triangles
    }
}

/**
 * 旋转与翻转 RGBA 像素数据以恢复原始朝向
 */
export function rotateAndFlipRGBA(data, width, height, rotation) {
    let newWidth = width
    let newHeight = height
    if (rotation === 'Rotate90' || rotation === 'Rotate270') {
        newWidth = height
        newHeight = width
    }

    const newData = new Uint8Array(newWidth * newHeight * 4)

    if (rotation === 'FlipHorizontal') {
        for (let y = 0; y < height; y++) {
            const rowOffset = y * width * 4
            const destRowOffset = y * newWidth * 4
            const wMinusOne = width - 1
            for (let x = 0; x < width; x++) {
                const srcIdx = rowOffset + x * 4
                const destIdx = destRowOffset + (wMinusOne - x) * 4
                newData[destIdx] = data[srcIdx]
                newData[destIdx + 1] = data[srcIdx + 1]
                newData[destIdx + 2] = data[srcIdx + 2]
                newData[destIdx + 3] = data[srcIdx + 3]
            }
        }
    } else if (rotation === 'FlipVertical') {
        const hMinusOne = height - 1
        for (let y = 0; y < height; y++) {
            const srcRowOffset = y * width * 4
            const destRowOffset = (hMinusOne - y) * newWidth * 4
            for (let x = 0; x < width; x++) {
                const srcIdx = srcRowOffset + x * 4
                const destIdx = destRowOffset + x * 4
                newData[destIdx] = data[srcIdx]
                newData[destIdx + 1] = data[srcIdx + 1]
                newData[destIdx + 2] = data[srcIdx + 2]
                newData[destIdx + 3] = data[srcIdx + 3]
            }
        }
    } else if (rotation === 'Rotate180') {
        const hMinusOne = height - 1
        const wMinusOne = width - 1
        for (let y = 0; y < height; y++) {
            const srcRowOffset = y * width * 4
            const destRowOffset = (hMinusOne - y) * newWidth * 4
            for (let x = 0; x < width; x++) {
                const srcIdx = srcRowOffset + x * 4
                const destIdx = destRowOffset + (wMinusOne - x) * 4
                newData[destIdx] = data[srcIdx]
                newData[destIdx + 1] = data[srcIdx + 1]
                newData[destIdx + 2] = data[srcIdx + 2]
                newData[destIdx + 3] = data[srcIdx + 3]
            }
        }
    } else if (rotation === 'Rotate90') {
        // 逆时针旋转 90 度 (在左下角坐标系中，对应：nx = height - 1 - y, ny = x)
        const hMinusOne = height - 1
        for (let y = 0; y < height; y++) {
            const srcRowOffset = y * width * 4
            const hMinusOneMinusY = hMinusOne - y
            for (let x = 0; x < width; x++) {
                const srcIdx = srcRowOffset + x * 4
                const destIdx = (x * newWidth + hMinusOneMinusY) * 4
                newData[destIdx] = data[srcIdx]
                newData[destIdx + 1] = data[srcIdx + 1]
                newData[destIdx + 2] = data[srcIdx + 2]
                newData[destIdx + 3] = data[srcIdx + 3]
            }
        }
    } else if (rotation === 'Rotate270') {
        // 顺时针旋转 90 度 / 逆时针旋转 270 度 (在左下角坐标系中，对应：nx = y, ny = width - 1 - x)
        const wMinusOne = width - 1
        for (let y = 0; y < height; y++) {
            const srcRowOffset = y * width * 4
            for (let x = 0; x < width; x++) {
                const srcIdx = srcRowOffset + x * 4
                const nx = y
                const ny = wMinusOne - x
                const destIdx = (ny * newWidth + nx) * 4
                newData[destIdx] = data[srcIdx]
                newData[destIdx + 1] = data[srcIdx + 1]
                newData[destIdx + 2] = data[srcIdx + 2]
                newData[destIdx + 3] = data[srcIdx + 3]
            }
        }
    } else {
        newData.set(data)
    }

    return { data: newData, width: newWidth, height: newHeight }
}

/**
 * 打包并生成 PNG 二进制数据格式 of Sprite 处理结果
 */
async function createSpriteResult(rgbaData, rect, cutting, width, height, outputType) {
    const imageData = await rgbaToPng({ rgbaData, width, height, type: outputType })
    return {
        data: {
            rect,
            cutting,
            ...imageData,
        },
    }
}

/**
 * 导出并处理 Sprite 裁剪图像数据
 */
export async function exportSprite(sprite, options = {}, manager) {
    const config = {
        cutting: false,
        type: 'arrayBuffer',
        worker: false,
        ...options,
    }

    const renderData = sprite.object.renderData
    if (!renderData) return null

    const _spriteAtlasData = manager.getSpriteAtlasData(sprite)
    const spriteAtlasData = _spriteAtlasData || renderData

    if (!spriteAtlasData) return null

    const texture2d = manager.getObjectInfoByPathId(spriteAtlasData.texture.pathID)
    if (!texture2d?.object) return null

    // 1. 获取裁剪区域 (并应用 downscaleMultiplier 进行缩放，解决 75% 等压缩贴图下的完全错位问题)
    const ds =
        spriteAtlasData.downscaleMultiplier && spriteAtlasData.downscaleMultiplier > 0
            ? spriteAtlasData.downscaleMultiplier
            : 1.0

    const textureRect = {
        x: spriteAtlasData.textureRect.x * ds,
        y: spriteAtlasData.textureRect.y * ds,
        width: spriteAtlasData.textureRect.width * ds,
        height: spriteAtlasData.textureRect.height * ds,
    }
    const textureRectOffset = {
        x: spriteAtlasData.textureRectOffset.x * ds,
        y: spriteAtlasData.textureRectOffset.y * ds,
    }
    const spriteRect = {
        x: sprite.object.rect.x * ds,
        y: sprite.object.rect.y * ds,
        width: sprite.object.rect.width * ds,
        height: sprite.object.rect.height * ds,
    }

    const rectX = Math.floor(textureRect.x)
    const rectY = Math.floor(textureRect.y)
    const rectRight = Math.ceil(textureRect.x + textureRect.width)
    const rectBottom = Math.ceil(textureRect.y + textureRect.height)

    const texWidth = texture2d.object.width
    const texHeight = texture2d.object.height
    const cropRect = {
        x: Math.max(0, rectX),
        y: Math.max(0, rectY),
        width: Math.min(rectRight, texWidth) - Math.max(0, rectX),
        height: Math.min(rectBottom, texHeight) - Math.max(0, rectY),
    }

    // 2. 解码并裁剪图像
    const textureU38 = await texture2d.object.decodeRgba(config.worker)
    if (!textureU38) return null // 增加空校验，防止解码失败时闪退
    let corpU38 = cropImage(textureU38, texWidth, texHeight, cropRect)
    let corpWidth = cropRect.width
    let corpHeight = cropRect.height

    // 3. 处理打包旋转
    const settings = _spriteAtlasData?.settingsRaw || renderData.settings
    if (settings?.packed && settings.packingRotation && settings.packingRotation !== 'None') {
        const rotated = rotateAndFlipRGBA(corpU38, corpWidth, corpHeight, settings.packingRotation)
        corpU38 = rotated.data
        corpWidth = rotated.width
        corpHeight = rotated.height
    }

    // 3.5 Apply Tight mask if tight packing mode is used (在旋转后应用，确保在 upright 空间对齐)
    const isTight = settings && settings.packingMode === 'Tight'
    if (isTight) {
        const triangles = getTriangles(spriteAtlasData, sprite.assetFile.reader)
        if (triangles.length > 0) {
            const scale = sprite.object.pixelsToUnits * ds
            const pivotX = sprite.object.pivot ? sprite.object.pivot.x : 0.5
            const pivotY = sprite.object.pivot ? sprite.object.pivot.y : 0.5

            // 考虑 sub-pixel 亚像素偏移的精确变换公式 (基于缩放后的坐标空间)
            const tx = spriteRect.width * pivotX - textureRectOffset.x + (textureRect.x - rectX)
            const ty = spriteRect.height * pivotY - textureRectOffset.y + (textureRect.y - rectY)

            const transformedTriangles = triangles.map((t) => {
                return t.map((v) => {
                    return [v.x * scale + tx, v.y * scale + ty]
                })
            })

            // Calculate overall bounding box of all triangles
            let minX = Infinity,
                maxX = -Infinity,
                minY = Infinity,
                maxY = -Infinity
            const precomputed = transformedTriangles.map((t) => {
                const [a, b, c] = t
                const tMinX = Math.min(a[0], b[0], c[0])
                const tMaxX = Math.max(a[0], b[0], c[0])
                const tMinY = Math.min(a[1], b[1], c[1])
                const tMaxY = Math.max(a[1], b[1], c[1])

                if (tMinX < minX) minX = tMinX
                if (tMaxX > maxX) maxX = tMaxX
                if (tMinY < minY) minY = tMinY
                if (tMaxY > maxY) maxY = tMaxY

                // Precompute pointInTriangle constants
                const v0x = c[0] - a[0],
                    v0y = c[1] - a[1]
                const v1x = b[0] - a[0],
                    v1y = b[1] - a[1]
                const dot00 = v0x * v0x + v0y * v0y
                const dot01 = v0x * v1x + v0y * v1y
                const dot11 = v1x * v1x + v1y * v1y
                const invDenom = 1 / (dot00 * dot11 - dot01 * dot01)

                return {
                    a,
                    v0x,
                    v0y,
                    v1x,
                    v1y,
                    dot00,
                    dot01,
                    dot11,
                    invDenom,
                    minX: tMinX,
                    maxX: tMaxX,
                    minY: tMinY,
                    maxY: tMaxY,
                }
            })

            // Optimization 3: Check if tight mask is redundant (covers full rect with simple quad)
            const isFullRect =
                transformedTriangles.length <= 2 &&
                minX <= 0.5 &&
                minY <= 0.5 &&
                maxX >= corpWidth - 0.5 &&
                maxY >= corpHeight - 0.5

            if (!isFullRect) {
                // Optimization 1: Initialize mask to 0 (default transparent)
                const mask = new Uint8Array(corpWidth * corpHeight)

                // Loop over triangles and only mark pixels within their AABB
                for (let i = 0; i < precomputed.length; i++) {
                    const pre = precomputed[i]
                    if (!isFinite(pre.invDenom)) continue

                    // Clamp bounding box to crop rect coordinates
                    const startX = Math.max(0, Math.floor(pre.minX))
                    const endX = Math.min(corpWidth - 1, Math.ceil(pre.maxX))
                    const startY = Math.max(0, Math.floor(pre.minY))
                    const endY = Math.min(corpHeight - 1, Math.ceil(pre.maxY))

                    for (let y = startY; y <= endY; y++) {
                        const rowOffset = y * corpWidth
                        for (let x = startX; x <= endX; x++) {
                            const idx = rowOffset + x
                            if (mask[idx] === 1) continue

                            const px = x + 0.5
                            const py = y + 0.5
                            if (pointInTrianglePrecomputed(px, py, pre)) {
                                mask[idx] = 1
                            }
                        }
                    }
                }

                // Clear alpha channel of pixels that are outside all triangles
                for (let y = 0; y < corpHeight; y++) {
                    const rowOffset = y * corpWidth
                    for (let x = 0; x < corpWidth; x++) {
                        if (mask[rowOffset + x] === 0) {
                            corpU38[(rowOffset + x) * 4 + 3] = 0 // Clear alpha channel
                        }
                    }
                }
            }
        }
    }

    // 4. 计算在 Sprite Canvas 上的目标位置 (考虑 sub-pixel 相对偏移)
    const targetRect = {
        x: Math.floor(textureRectOffset.x - (textureRect.x - rectX)),
        y: Math.floor(textureRectOffset.y - (textureRect.y - rectY)),
        width: corpWidth,
        height: corpHeight,
    }

    // 5. 根据 cutting 执行导出
    if (config.cutting) {
        return createSpriteResult(corpU38, targetRect, true, corpWidth, corpHeight, config.type)
    } else {
        const expanded = expandImage(corpU38, targetRect, Math.floor(spriteRect.width), Math.floor(spriteRect.height))
        return createSpriteResult(
            expanded,
            targetRect,
            false,
            Math.floor(spriteRect.width),
            Math.floor(spriteRect.height),
            config.type,
        )
    }
}
