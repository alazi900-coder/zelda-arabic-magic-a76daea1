// Helper: Unwrap Array values from TypeTree JSON formats
export function unwrapArray(arr) {
    if (!arr) return []
    if (Array.isArray(arr)) return arr
    if (arr.Array) return arr.Array
    return arr
}

// Helper: Resolve MonoBehaviour C# class name via MonoScript PPtr
export async function getMonoBehaviourClassName(objInfo, manager) {
    if (!objInfo) return null
    if (objInfo._resolvedClassName !== undefined) {
        return objInfo._resolvedClassName
    }
    if (objInfo.getClassName() !== 'MonoBehaviour') {
        objInfo._resolvedClassName = null
        return null
    }
    const monoBehaviour = objInfo.object
    if (monoBehaviour && monoBehaviour.script) {
        const scriptPathID = monoBehaviour.script.pathID
        if (scriptPathID) {
            const scriptObjInfo = manager.getObjectInfoByPathId(BigInt(scriptPathID))
            if (scriptObjInfo && scriptObjInfo.object) {
                const className = scriptObjInfo.object.className
                objInfo._resolvedClassName = className
                return className
            }
        }
    }

    // TypeTree-based fallback resolution for Cubism components
    try {
        const fields = (objInfo.assetFile || manager.primaryAssetFile).getObjectUsingTreeJSON(objInfo)
        if (fields) {
            let className = null
            if (fields._mainTexture !== undefined || fields.m_MainTexture !== undefined) {
                className = 'CubismRenderer'
            } else if (fields._physicsRig !== undefined) {
                className = 'CubismPhysicsController'
            } else if (
                (fields.Parameters !== undefined || fields._parameters !== undefined) &&
                (fields.FadeInTime !== undefined || fields._fadeInTime !== undefined)
            ) {
                className = 'CubismExpressionData'
            } else if (
                fields.ExpressionsList !== undefined ||
                fields._expressionsList !== undefined ||
                fields.CurrentExpressionIndex !== undefined
            ) {
                className = 'CubismExpressionController'
            } else if (fields.GroupIndex !== undefined && fields.PartIndex !== undefined) {
                className = 'CubismPosePart'
            } else if (fields.DisplayName !== undefined && fields.Name !== undefined) {
                className = 'CubismDisplayInfo'
            }
            if (className) {
                objInfo._resolvedClassName = className
                return className
            }
        }
    } catch {
        // ignore
    }
    objInfo._resolvedClassName = null
    return null
}

// Helper: Resolve GameObject name from MonoBehaviour object info
export async function getGameObjectName(monoInfo, manager, assetFile) {
    const mono = monoInfo.object || monoInfo
    if (monoInfo._resolvedGameObjectName !== undefined) {
        return monoInfo._resolvedGameObjectName
    }
    const gameObjPtr = mono.m_GameObject || mono._gameObject || mono.gameObject
    if (gameObjPtr) {
        const gameObjPathID = gameObjPtr.m_PathID || gameObjPtr.value?.m_PathID || gameObjPtr.pathID
        if (gameObjPathID) {
            const gameObjInfo = manager.getObjectInfoByPathId(BigInt(gameObjPathID))
            if (gameObjInfo) {
                if (gameObjInfo._resolvedGameObjectName !== undefined) {
                    monoInfo._resolvedGameObjectName = gameObjInfo._resolvedGameObjectName
                    return gameObjInfo._resolvedGameObjectName
                }
                try {
                    const gameObj = (gameObjInfo.assetFile || assetFile).getObjectUsingTreeJSON(gameObjInfo)
                    if (gameObj) {
                        const name = gameObj.m_Name || gameObj.name || ''
                        gameObjInfo._resolvedGameObjectName = name
                        monoInfo._resolvedGameObjectName = name
                        return name
                    }
                } catch {
                    // ignore
                }
            }
        }
    }
    monoInfo._resolvedGameObjectName = ''
    return ''
}

// Helper: Resolve display name from CubismDisplayInfo MonoBehaviour data
export function getDisplayName(cdiData) {
    let name = cdiData.Name || cdiData._name || ''
    const displayName = cdiData.DisplayName || cdiData._displayName || ''
    if (displayName !== '') {
        name = displayName
    }
    return name
}

// Helper: Find Component by C# ClassName in GameObject components
export async function findComponentByClassName(gameObject, className, manager) {
    if (!gameObject) return null
    const components = gameObject.components || gameObject.m_Components || []
    for (const compPtr of components) {
        const pathID = compPtr.pathID || compPtr.m_PathID || compPtr.value?.m_PathID
        if (!pathID) continue
        const compObjInfo = manager.getObjectInfoByPathId(BigInt(pathID))
        if (!compObjInfo) continue
        const name = await getMonoBehaviourClassName(compObjInfo, manager)
        if (name === className) {
            return compObjInfo
        }
    }
    return null
}

// Helper: Traverse GameObject components and children recursively to find Textures
export async function findRendererTextures(gameObject, manager, textures = new Set(), visited = new Set()) {
    if (!gameObject) return []

    // Prevent infinite recursion
    if (visited.has(gameObject)) return []
    visited.add(gameObject)

    const components = gameObject.components || gameObject.m_Components || []
    let transformComponent = null

    for (const compPtr of components) {
        const pathID = compPtr.pathID || compPtr.m_PathID || compPtr.value?.m_PathID
        if (!pathID) continue
        const compObjInfo = manager.getObjectInfoByPathId(BigInt(pathID))
        if (!compObjInfo) continue

        // Keep track of the Transform component
        const classID = compObjInfo.classID
        if (classID === 4 || classID === 224) {
            transformComponent = compObjInfo.object
        }

        // Resolve script to check for CubismRenderer
        const className = await getMonoBehaviourClassName(compObjInfo, manager)
        if (className === 'CubismRenderer') {
            const rendererData = compObjInfo.assetFile.getObjectUsingTreeJSON(compObjInfo)
            if (rendererData && rendererData._mainTexture) {
                const texPathID =
                    rendererData._mainTexture.m_PathID ||
                    rendererData._mainTexture.value?.m_PathID ||
                    rendererData._mainTexture.pathID
                if (texPathID) {
                    const texObjInfo = manager.getObjectInfoByPathId(BigInt(texPathID))
                    if (texObjInfo) textures.add(texObjInfo)
                }
            }
        }
    }

    // Traverse children via the Transform component
    if (transformComponent) {
        const children = transformComponent.children || transformComponent.m_Children || []
        for (const childPtr of children) {
            const childPathID = childPtr.pathID || childPtr.m_PathID || childPtr.value?.m_PathID
            if (!childPathID) continue
            const childTransformObj = manager.getObjectInfoByPathId(BigInt(childPathID))
            const childTransform = childTransformObj?.object
            if (childTransform && childTransform.gameObject) {
                const childGameObjPathID =
                    childTransform.gameObject.pathID ||
                    childTransform.gameObject.m_PathID ||
                    childTransform.gameObject.value?.m_PathID
                if (childGameObjPathID) {
                    const childGameObj = manager.getObjectInfoByPathId(BigInt(childGameObjPathID))?.object
                    if (childGameObj) {
                        await findRendererTextures(childGameObj, manager, textures, visited)
                    }
                }
            }
        }
    }

    return Array.from(textures)
}

// Helper: Check if an asset belongs to the target model
export function isAssetBelongsToModel(info, modelAssetFile, lowerModelName, mocDir, manager) {
    if (!info) return false

    // 1. If it's in the same AssetFile, it belongs to the model
    if (info.assetFile === modelAssetFile) {
        return true
    }

    // 2. Compare container paths
    const container = manager.getContainer(info)
    const containerPath = container ? container.key : ''

    if (containerPath && mocDir) {
        if (containerPath.startsWith(mocDir + '/')) {
            return true
        }
    }

    // 3. Fallback matching (case-insensitive name or container path matching model name)
    if (lowerModelName && lowerModelName.length > 2) {
        if (info.name) {
            const lowerName = info._lowerName || (info._lowerName = info.name.toLowerCase())
            if (lowerName.includes(lowerModelName)) {
                return true
            }
        }

        if (containerPath) {
            const lowerContainerPath =
                info._lowerContainerPath || (info._lowerContainerPath = containerPath.toLowerCase())
            if (lowerContainerPath.includes(lowerModelName)) {
                return true
            }
        }
    }

    return false
}
