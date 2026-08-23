/**
 * Live2D Asset Exporter for UnityJs
 */

import {
    getMonoBehaviourClassName,
    getGameObjectName,
    getDisplayName,
    findComponentByClassName,
    findRendererTextures,
    isAssetBelongsToModel,
    unwrapArray,
} from './live2d/utils.js'
import { convertToMotion3, buildCrcMap } from './live2d/motion.js'
import { exportPhysicsSettings } from './live2d/physics.js'
import { convertExpression } from './live2d/expression.js'

export async function processLive2DModel(cubismModelObjInfo, manager) {
    const assetFile = cubismModelObjInfo.assetFile || manager.primaryAssetFile
    const modelData = assetFile.getObjectUsingTreeJSON(cubismModelObjInfo)
    if (!modelData) {
        throw new Error('Failed to parse CubismModel fields (TypeTree missing or invalid)')
    }

    let modelName = 'Live2DModel'
    let mocBytes = null
    let mocContainerPath = ''

    // 1. Resolve model name from .moc3 asset name
    const mocPtr = modelData._moc
    if (mocPtr) {
        const mocPathID = mocPtr.m_PathID || mocPtr.value?.m_PathID || mocPtr.pathID
        if (mocPathID) {
            const mocObjInfo = manager.getObjectInfoByPathId(BigInt(mocPathID))
            if (mocObjInfo) {
                if (mocObjInfo.name) {
                    modelName = mocObjInfo.name
                } else if (mocObjInfo.object && (mocObjInfo.object.name || mocObjInfo.object.m_Name)) {
                    modelName = mocObjInfo.object.name || mocObjInfo.object.m_Name
                }
                const mocData = (mocObjInfo.assetFile || assetFile).getObjectUsingTreeJSON(mocObjInfo)
                if (mocData && mocData._bytes) {
                    const rawBytes = unwrapArray(mocData._bytes)
                    mocBytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes)
                }
                const mocContainer = manager.getContainer(mocObjInfo)
                if (mocContainer && mocContainer.key) {
                    mocContainerPath = mocContainer.key
                }
            }
        }
    }

    if (!mocContainerPath) {
        const modelContainer = manager.getContainer(cubismModelObjInfo)
        if (modelContainer && modelContainer.key) {
            mocContainerPath = modelContainer.key
        }
    }

    if (modelName === 'Live2DModel' && cubismModelObjInfo.name) {
        // Fallback to Prefab name but strip the .prefab suffix if it exists
        modelName = cubismModelObjInfo.name.replace(/\.prefab$/i, '')
    }

    const result = {
        name: modelName,
        files: {}, // Filename -> Uint8Array or String
    }

    if (mocBytes) {
        result.files[`${modelName}.moc3`] = mocBytes
    }

    // 2. Extract Textures
    const textures = []
    const gameObjectPtr = modelData.m_GameObject
    if (gameObjectPtr) {
        const gameObjPathID = gameObjectPtr.m_PathID || gameObjectPtr.value?.m_PathID || gameObjectPtr.pathID
        if (gameObjPathID) {
            const gameObjInfo = manager.getObjectInfoByPathId(BigInt(gameObjPathID))
            if (gameObjInfo && gameObjInfo.object) {
                const rendererTextures = await findRendererTextures(gameObjInfo.object, manager)
                rendererTextures.sort((a, b) => {
                    const nameA = a.name || ''
                    const nameB = b.name || ''
                    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' })
                })
                for (let i = 0; i < rendererTextures.length; i++) {
                    const texInfo = rendererTextures[i]
                    const exportedTex = await manager.exportFile(texInfo)
                    if (exportedTex && exportedTex.data) {
                        const texRaw = exportedTex.data.raw
                        if (texRaw) {
                            const texName = `Textures/${texInfo.name}.png`
                            result.files[texName] = texRaw instanceof Uint8Array ? texRaw : new Uint8Array(texRaw)
                            textures.push(texName)
                        }
                    }
                }
            }
        }
    }

    // 3. Extract Physics (.physics3.json)
    if (gameObjectPtr) {
        const gameObjPathID = gameObjectPtr.m_PathID || gameObjectPtr.value?.m_PathID || gameObjectPtr.pathID
        if (gameObjPathID) {
            const gameObjInfo = manager.getObjectInfoByPathId(BigInt(gameObjPathID))
            if (gameObjInfo && gameObjInfo.object) {
                const physicsController = await findComponentByClassName(
                    gameObjInfo.object,
                    'CubismPhysicsController',
                    manager,
                )
                if (physicsController) {
                    const physicsData = (physicsController.assetFile || assetFile).getObjectUsingTreeJSON(
                        physicsController,
                    )
                    if (physicsData) {
                        const physicsJson = exportPhysicsSettings(physicsData)
                        result.files[`${modelName}.physics3.json`] = JSON.stringify(physicsJson, null, 4)
                    }
                }
            }
        }
    }

    // 4. Categorize assets in a single-pass loop to maximize efficiency
    const animationClips = []
    const poseParts = []
    const parametersCdi = []
    const partsCdi = []
    const eyeBlinkParameters = new Set()
    const lipSyncParameters = new Set()
    const parameterNames = new Set()
    const expressionAssetsFallback = []

    const lowerModelName = modelName ? modelName.toLowerCase() : ''
    const mocDir = mocContainerPath ? mocContainerPath.substring(0, mocContainerPath.lastIndexOf('/')) : ''

    const processObject = async (info) => {
        if (!isAssetBelongsToModel(info, assetFile, lowerModelName, mocDir, manager)) {
            return
        }

        const type = info.getClassName()
        if (type === 'AnimationClip') {
            animationClips.push(info)
            return
        }
        if (type === 'MonoBehaviour') {
            const className = await getMonoBehaviourClassName(info, manager)
            if (!className) return

            if (className === 'CubismPosePart') {
                poseParts.push(info)
            } else if (className === 'CubismDisplayInfoParameterName') {
                parametersCdi.push(info)
            } else if (className === 'CubismDisplayInfoPartName') {
                partsCdi.push(info)
            } else if (className === 'CubismDisplayInfo') {
                const gameObjName = await getGameObjectName(info, manager, assetFile)
                if (gameObjName.toLowerCase().includes('param')) {
                    parametersCdi.push(info)
                } else {
                    partsCdi.push(info)
                }
            } else if (className === 'CubismEyeBlinkParameter') {
                const gameObjName = await getGameObjectName(info, manager, assetFile)
                if (gameObjName) eyeBlinkParameters.add(gameObjName)
            } else if (className === 'CubismMouthParameter') {
                const gameObjName = await getGameObjectName(info, manager, assetFile)
                if (gameObjName) lipSyncParameters.add(gameObjName)
            } else if (className === 'CubismParameter') {
                const gameObjName = await getGameObjectName(info, manager, assetFile)
                if (gameObjName) parameterNames.add(gameObjName)
            } else if (className === 'CubismExpressionData') {
                expressionAssetsFallback.push(info)
            }
        }
    }

    if (typeof manager.constructor.activeManagers !== 'undefined') {
        for (const ref of manager.constructor.activeManagers) {
            const m = ref.deref()
            if (m) {
                const infos = m.getObjectInfos()
                for (let i = 0; i < infos.length; i++) {
                    await processObject(infos[i])
                }
            }
        }
    } else {
        const infos = manager.getObjectInfos()
        for (let i = 0; i < infos.length; i++) {
            await processObject(infos[i])
        }
    }

    // 4.1. Extract Animations (.motion3.json)
    const motions = []
    if (gameObjectPtr && animationClips.length > 0) {
        const gameObjPathID = gameObjectPtr.m_PathID || gameObjectPtr.value?.m_PathID || gameObjectPtr.pathID
        if (gameObjPathID) {
            const gameObjInfo = manager.getObjectInfoByPathId(BigInt(gameObjPathID))
            if (gameObjInfo && gameObjInfo.object) {
                const crcMap = new Map()
                await buildCrcMap(gameObjInfo.object, manager, crcMap)

                for (const clipInfo of animationClips) {
                    try {
                        const clip = (clipInfo.assetFile || assetFile).getObjectUsingTreeJSON(clipInfo)
                        if (clip) {
                            const motionJson = convertToMotion3(clip, crcMap)
                            if (motionJson && motionJson.Curves && motionJson.Curves.length > 0) {
                                const clipName = clip.m_Name || clipInfo.name || `motion_${motions.length}`
                                const motionFileName = `motions/${clipName}.motion3.json`
                                result.files[motionFileName] = JSON.stringify(motionJson, null, 4)
                                motions.push({
                                    File: motionFileName,
                                })
                            }
                        }
                    } catch (e) {
                        console.warn(`Failed to export AnimationClip ${clipInfo.name}:`, e)
                    }
                }
            }
        }
    }

    // 4.5. Extract Expressions (.exp3.json)
    const expressionsList = []
    if (gameObjectPtr) {
        const gameObjPathID = gameObjectPtr.m_PathID || gameObjectPtr.value?.m_PathID || gameObjectPtr.pathID
        if (gameObjPathID) {
            const gameObjInfo = manager.getObjectInfoByPathId(BigInt(gameObjPathID))
            if (gameObjInfo && gameObjInfo.object) {
                const expressionController = await findComponentByClassName(
                    gameObjInfo.object,
                    'CubismExpressionController',
                    manager,
                )
                let expressionAssets = []

                // Try finding expressions via the controller first
                if (expressionController) {
                    try {
                        const expControllerData = (expressionController.assetFile || assetFile).getObjectUsingTreeJSON(
                            expressionController,
                        )
                        if (expControllerData) {
                            const expListPtr =
                                expControllerData.ExpressionsList ||
                                expControllerData._expressionsList ||
                                expControllerData.expressionsList
                            if (expListPtr) {
                                const expListPathID =
                                    expListPtr.m_PathID || expListPtr.value?.m_PathID || expListPtr.pathID
                                if (expListPathID) {
                                    const expListObjInfo = manager.getObjectInfoByPathId(BigInt(expListPathID))
                                    if (expListObjInfo) {
                                        const expListData = (
                                            expListObjInfo.assetFile || assetFile
                                        ).getObjectUsingTreeJSON(expListObjInfo)
                                        if (expListData) {
                                            const expObjects =
                                                expListData.CubismExpressionObjects ||
                                                expListData._cubismExpressionObjects ||
                                                expListData.cubismExpressionObjects ||
                                                []
                                            for (const expPtr of expObjects) {
                                                const expPathID =
                                                    expPtr.m_PathID || expPtr.value?.m_PathID || expPtr.pathID
                                                if (expPathID) {
                                                    const expObjInfo = manager.getObjectInfoByPathId(BigInt(expPathID))
                                                    if (expObjInfo) {
                                                        expressionAssets.push(expObjInfo)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.warn(`Failed to parse CubismExpressionController expressions:`, e)
                    }
                }

                // Fallback: If no expressions resolved via controller, use scanned fallback expression list
                if (expressionAssets.length === 0) {
                    expressionAssets = expressionAssetsFallback
                }

                // Export each expression
                for (const expInfo of expressionAssets) {
                    try {
                        const expData = (expInfo.assetFile || assetFile).getObjectUsingTreeJSON(expInfo)
                        if (expData) {
                            const expressionJson = convertExpression(expData)
                            const rawName = expInfo.name || expData.m_Name || `expression_${expressionsList.length}`
                            const expressionName = rawName.replace(/\.exp3$/i, '')
                            const expressionFileName = `expressions/${expressionName}.exp3.json`

                            result.files[expressionFileName] = JSON.stringify(expressionJson, null, 4)
                            expressionsList.push({
                                Name: expressionName,
                                File: expressionFileName,
                            })
                        }
                    } catch (e) {
                        console.warn(`Failed to export CubismExpressionData ${expInfo.name}:`, e)
                    }
                }
            }
        }
    }

    // 4.6. Extract Pose (.pose3.json), CDI (.cdi3.json) and Groups (EyeBlink, LipSync)
    let groupsList = undefined
    if (gameObjectPtr) {
        const gameObjPathID = gameObjectPtr.m_PathID || gameObjectPtr.value?.m_PathID || gameObjectPtr.pathID
        if (gameObjPathID) {
            const gameObjInfo = manager.getObjectInfoByPathId(BigInt(gameObjPathID))
            if (gameObjInfo && gameObjInfo.object) {
                // Pose parts
                if (poseParts.length > 0) {
                    const groupDict = {}
                    for (const posePartInfo of poseParts) {
                        try {
                            const posePartData = (posePartInfo.assetFile || assetFile).getObjectUsingTreeJSON(
                                posePartInfo,
                            )
                            if (posePartData) {
                                const gameObjName = await getGameObjectName(posePartInfo, manager, assetFile)
                                if (gameObjName) {
                                    const groupIndex =
                                        posePartData.GroupIndex !== undefined
                                            ? posePartData.GroupIndex
                                            : posePartData._groupIndex !== undefined
                                              ? posePartData._groupIndex
                                              : 0
                                    const rawLink = posePartData.Link || posePartData._link || []
                                    const link = rawLink.map((x) => (x ? x.toString() : ''))

                                    const node = {
                                        Id: gameObjName,
                                        Link: link,
                                    }

                                    if (!groupDict[groupIndex]) {
                                        groupDict[groupIndex] = []
                                    }
                                    groupDict[groupIndex].push(node)
                                }
                            }
                        } catch (e) {
                            console.warn(`Failed to parse CubismPosePart:`, e)
                        }
                    }

                    const groups = Object.keys(groupDict)
                        .sort((a, b) => Number(a) - Number(b))
                        .map((k) => groupDict[k])
                    if (groups.length > 0) {
                        const poseJson = {
                            Type: 'Live2D Pose',
                            Groups: groups,
                        }
                        result.files[`${modelName}.pose3.json`] = JSON.stringify(poseJson, null, 4)
                    }
                }

                // CDI (Display Info)
                if (parametersCdi.length > 0 || partsCdi.length > 0) {
                    const parametersList = []
                    for (const info of parametersCdi) {
                        try {
                            const cdiData = (info.assetFile || assetFile).getObjectUsingTreeJSON(info)
                            if (cdiData) {
                                const gameObjName = await getGameObjectName(info, manager, assetFile)
                                if (gameObjName) {
                                    const name = getDisplayName(cdiData)
                                    parametersList.push({
                                        Id: gameObjName,
                                        GroupId: '',
                                        Name: name,
                                    })
                                }
                            }
                        } catch (e) {
                            console.warn(`Failed to parse parameters cdi:`, e)
                        }
                    }

                    const partsList = []
                    for (const info of partsCdi) {
                        try {
                            const cdiData = (info.assetFile || assetFile).getObjectUsingTreeJSON(info)
                            if (cdiData) {
                                const gameObjName = await getGameObjectName(info, manager, assetFile)
                                if (gameObjName) {
                                    const name = getDisplayName(cdiData)
                                    partsList.push({
                                        Id: gameObjName,
                                        Name: name,
                                    })
                                }
                            }
                        } catch (e) {
                            console.warn(`Failed to parse parts cdi:`, e)
                        }
                    }

                    parametersList.sort((a, b) => a.Id.localeCompare(b.Id, undefined, { sensitivity: 'accent' }))
                    partsList.sort((a, b) => a.Id.localeCompare(b.Id, undefined, { sensitivity: 'accent' }))

                    const cdiJson = {
                        Version: 3,
                        Parameters: parametersList,
                        ParameterGroups: [],
                        Parts: partsList,
                    }
                    result.files[`${modelName}.cdi3.json`] = JSON.stringify(cdiJson, null, 4)
                }

                // Groups (EyeBlink, LipSync)
                if (eyeBlinkParameters.size === 0) {
                    for (const name of parameterNames) {
                        const lower = name.toLowerCase()
                        if (
                            lower.includes('eye') &&
                            lower.includes('open') &&
                            (lower.includes('l') || lower.includes('r'))
                        ) {
                            eyeBlinkParameters.add(name)
                        }
                    }
                }
                if (lipSyncParameters.size === 0) {
                    for (const name of parameterNames) {
                        const lower = name.toLowerCase()
                        if (lower.includes('mouth') && lower.includes('open') && lower.includes('y')) {
                            lipSyncParameters.add(name)
                        }
                    }
                }

                if (eyeBlinkParameters.size > 0 || lipSyncParameters.size > 0) {
                    groupsList = [
                        {
                            Target: 'Parameter',
                            Name: 'EyeBlink',
                            Ids: Array.from(eyeBlinkParameters),
                        },
                        {
                            Target: 'Parameter',
                            Name: 'LipSync',
                            Ids: Array.from(lipSyncParameters),
                        },
                    ]
                }
            }
        }
    }

    // 5. Generate .model3.json metadata
    const motionReferences = {}
    if (motions.length > 0) {
        const idleMotions = motions.filter(
            (m) => m.File.toLowerCase().includes('idle') || m.File.toLowerCase().includes('loop'),
        )
        const remaining = motions.filter(
            (m) => !m.File.toLowerCase().includes('idle') && !m.File.toLowerCase().includes('loop'),
        )

        if (idleMotions.length > 0) {
            motionReferences['Idle'] = idleMotions
        }
        if (remaining.length > 0) {
            motionReferences['All'] = remaining
        }
        if (!motionReferences['Idle'] && motions.length > 0) {
            motionReferences['Idle'] = motions
        }
    }

    const model3Json = {
        Version: 3,
        FileReferences: {
            Moc: `${modelName}.moc3`,
            Textures: textures,
            Physics: result.files[`${modelName}.physics3.json`] ? `${modelName}.physics3.json` : undefined,
            Pose: result.files[`${modelName}.pose3.json`] ? `${modelName}.pose3.json` : undefined,
            DisplayInfo: result.files[`${modelName}.cdi3.json`] ? `${modelName}.cdi3.json` : undefined,
            Motions: motions.length > 0 ? motionReferences : undefined,
            Expressions: expressionsList.length > 0 ? expressionsList : undefined,
        },
        Groups: groupsList,
    }
    result.files[`${modelName}.model3.json`] = JSON.stringify(model3Json, null, 4)

    return result
}
