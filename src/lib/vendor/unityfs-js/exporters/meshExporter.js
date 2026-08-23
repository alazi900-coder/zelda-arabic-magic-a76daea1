const textEncoder = new TextEncoder()

/**
 * 解析并提取 Mesh 3D 网格数据，生成标准 OBJ 格式文件
 */
export async function processMesh(objectInfo, options = {}) {
    const mesh = objectInfo.object
    if (!mesh._has_processed) {
        await mesh.process()
    }

    const vertCount = mesh.vertices ? mesh.vertices.length : 0
    const uvCount = mesh.uv0 ? mesh.uv0.length : 0
    const normCount = mesh.normals ? mesh.normals.length : 0
    const faceCount = mesh.indices ? (mesh.indices.length / 3) | 0 : 0

    const totalLines =
        2 + (vertCount ? vertCount + 1 : 0) + (uvCount ? uvCount + 1 : 0) + (normCount ? normCount + 1 : 0) + faceCount

    const lines = new Array(totalLines)
    let lineIdx = 0

    lines[lineIdx++] = `# Exported by UnityJs`
    lines[lineIdx++] = `g ${objectInfo.name}\n`

    // 1. 顶点位置 (Vertices)
    if (vertCount > 0) {
        for (let i = 0; i < vertCount; i++) {
            const v = mesh.vertices[i]
            lines[lineIdx++] = `v ${-v[0]} ${v[1]} ${v[2]}`
        }
        lines[lineIdx++] = ''
    }

    // 2. 纹理坐标 (UVs)
    const hasUV = uvCount > 0
    if (hasUV) {
        for (let i = 0; i < uvCount; i++) {
            const uv = mesh.uv0[i]
            lines[lineIdx++] = `vt ${uv[0]} ${uv[1]}`
        }
        lines[lineIdx++] = ''
    }

    // 3. 法线方向 (Normals)
    const hasNormals = normCount > 0
    if (hasNormals) {
        for (let i = 0; i < normCount; i++) {
            const n = mesh.normals[i]
            lines[lineIdx++] = `vn ${-n[0]} ${n[1]} ${n[2]}`
        }
        lines[lineIdx++] = ''
    }

    // 4. 面索引 (Faces/Triangles)
    if (faceCount > 0) {
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const i1 = mesh.indices[i] + 1
            const i2 = mesh.indices[i + 1] + 1
            const i3 = mesh.indices[i + 2] + 1

            if (hasUV && hasNormals) {
                lines[lineIdx++] = `f ${i3}/${i3}/${i3} ${i2}/${i2}/${i2} ${i1}/${i1}/${i1}`
            } else if (hasUV) {
                lines[lineIdx++] = `f ${i3}/${i3} ${i2}/${i2} ${i1}/${i1}`
            } else if (hasNormals) {
                lines[lineIdx++] = `f ${i3}//${i3} ${i2}//${i2} ${i1}//${i1}`
            } else {
                lines[lineIdx++] = `f ${i3} ${i2} ${i1}`
            }
        }
    }

    const objText = lines.join('\n') + '\n'

    let dataR = objText
    if (options.type === 'arrayBuffer') {
        dataR = textEncoder.encode(objText).buffer
    }

    return {
        data: {
            raw: dataR,
        },
    }
}
