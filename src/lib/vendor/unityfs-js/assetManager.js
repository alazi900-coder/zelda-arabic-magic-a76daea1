import { floorAllValues } from './unityfs/imageProcessing.js'
import { ObjectRegistry } from './core/registry.js'
import { processLive2DModel, exportSprite } from './exporters/index.js'

/**
 * Unity 资源管理器中介者类 (AssetManager Facade)
 * 统一管理 UnityFS 物理容器、BundleFile 文件树、AssetFile 以及内存生命周期，并向外提供统一接口。
 */
export class AssetManager {
    static activeManagers = new Set()

    /**
     * 构造函数
     * @param {Object} [assetFileOrOptions={}] 初始 AssetFile 实例或配置选项
     * @param {Object} [options={}] 配置选项（当第一个参数为 AssetFile 时有效）
     */
    constructor(assetFileOrOptions = {}, options = {}) {
        let actualOptions = options
        let initialAssetFile = null

        if (assetFileOrOptions && typeof assetFileOrOptions.parse === 'function') {
            initialAssetFile = assetFileOrOptions
        } else {
            actualOptions = assetFileOrOptions || {}
        }

        /** @type {Object} 管理器全局配置 */
        this.options = actualOptions
        /** @type {Object|null} 关联的物理容器实例 (UnityFS) */
        this.unityFile = null
        /** @type {Object|null} 关联的资源包实例 (BundleFile) */
        this.bundleFile = null
        /** @type {Array<Object>} 关联的所有资源文件树数组 (AssetFile) */
        this.assetFiles = []
        /** @type {Map<string, Uint8Array>} 关联的原始资源数据文件流集合 */
        this.resourceFiles = new Map()
        /** @type {Map<string, Object>} 内部缓存字典，用于高频加速读取 */
        this.cache = new Map()

        if (actualOptions.unityRevision) {
            /** @type {string} Unity 修正版本号 */
            this.unityRevision = actualOptions.unityRevision
        }

        if (initialAssetFile) {
            this.registerAssetFile(initialAssetFile)
        }

        AssetManager.activeManagers.add(new WeakRef(this))
    }

    /**
     * 绑定物理容器 (UnityFS)
     * @param {Object} unityFile UnityFS 物理文件实例
     */
    bindContainer(unityFile) {
        this.unityFile = unityFile
    }

    /**
     * 绑定资源包 (BundleFile)
     * @param {Object} bundleFile BundleFile 资源包实例
     */
    bindBundle(bundleFile) {
        this.bundleFile = bundleFile
    }

    /**
     * 获取容器和资源包的元数据
     * @returns {Object} 聚合后的元数据对象，包含平台、版本、文件大小等信息
     */
    getMetadata() {
        const firstAsset = this.assetFiles[0]
        return {
            targetPlatform: firstAsset?.targetPlatform || null,
            unityRevision: this.bundleFile?.unityRevision || firstAsset?.unityRevision || null,
            unityVersion: this.bundleFile?.unityVersion || firstAsset?.unityVersion || null,
            version: firstAsset?.version || null,
            fileSize: firstAsset?.fileSize || this.unityFile?.reader?.data?.length || null,
            endianness: firstAsset?.endianness || null,
        }
    }

    /**
     * 释放与清理所有内存 and 对象引用，防止 WASM 及 TypedArray 引起的内存泄漏
     */
    dispose() {
        this.cache.clear()
        this.resourceFiles.clear()

        if (this.unityFile) {
            this.unityFile.reader = null
            this.unityFile = null
        }
        if (this.bundleFile) {
            this.bundleFile.reader = null
            this.bundleFile.blockData = null
            this.bundleFile.files = null
            this.bundleFile = null
        }
        for (const file of this.assetFiles) {
            if (file) {
                file.reader = null
                file.objects = null
                file.types = null
                file.externals = null
                file._pathIdMap = null
            }
        }
        this.assetFiles = []

        for (const ref of AssetManager.activeManagers) {
            const manager = ref.deref()
            if (manager === this || !manager) {
                AssetManager.activeManagers.delete(ref)
            }
        }
    }

    /**
     * 获取首个/主资源文件实例 (AssetFile)
     * @returns {Object|null} 首个 AssetFile 实例或 null
     */
    get primaryAssetFile() {
        return this.assetFiles[0] || null
    }

    /**
     * 注册资源文件树实例 (AssetFile)
     * @param {Object} assetFile AssetFile 实例
     */
    registerAssetFile(assetFile) {
        if (assetFile && !this.assetFiles.includes(assetFile)) {
            this.assetFiles.push(assetFile)
            assetFile.context = this
        }
    }

    /**
     * 注册原始数据资源流 (.resource/.resS)
     * @param {string} path 资源文件路径
     * @param {Uint8Array} data 文件二进制数据
     */
    registerResourceFile(path, data) {
        if (path && data) {
            const normPath = path.replace(/\\/g, '/').toLowerCase()
            this.resourceFiles.set(normPath, data)
        }
    }

    /**
     * 解析外部数据流片段（根据文件名路径、偏移量和大小）
     * @param {string} resourcePath 目标资源文件路径
     * @param {number} offset 二进制流中的偏移量
     * @param {number} size 截取的大小
     * @returns {Uint8Array|null} 对应的字节数组片段，找不到则返回 null
     */
    resolveResource(resourcePath, offset, size) {
        if (!resourcePath) return null
        const normPath = resourcePath.replace(/\\/g, '/').toLowerCase()

        const numOffset = Number(offset)
        const numSize = Number(size)

        for (let [key, data] of this.resourceFiles.entries()) {
            if (key.includes(normPath) || normPath.includes(key)) {
                if (data && typeof data.resolveRange === 'function') {
                    return data.resolveRange(numOffset, numSize)
                }
                return data.subarray(numOffset, numOffset + numSize)
            }
        }
        return null
    }

    /**
     * 获取指定对象信息在 AssetFile 的 objects 列表中的索引
     * @param {Object} objectInfo 对象元数据信息
     * @returns {number} 对应的索引位置，若未找到则返回 -1
     */
    getObjectInfoIndex(objectInfo) {
        if (!objectInfo) return -1
        if (typeof objectInfo._index !== 'undefined') return objectInfo._index
        const file = objectInfo.assetFile || objectInfo._reader?.assetFile || this.primaryAssetFile
        if (!file) return -1
        const idx = file.objects.findIndex((e) => e == objectInfo)
        if (idx !== -1) {
            objectInfo._index = idx
        }
        return idx
    }

    /**
     * 获取管理器中所有的文件对象信息 (ObjectInfo)
     * @param {Function} [filterFun] 筛选回调函数
     * @returns {Array<Object>} 匹配的对象信息数组
     */
    getObjectInfos(filterFun) {
        let list = []
        for (const file of this.assetFiles) {
            const objects = file.objects
            if (!filterFun) {
                list = list.concat(objects)
            } else {
                for (let i = 0; i < objects.length; i++) {
                    const obj = objects[i]
                    if (filterFun(obj)) {
                        list.push(obj)
                    }
                }
            }
        }
        return list
    }

    /**
     * 根据类名筛选文件对象信息 (ObjectInfo)
     * @param {string|string[]} classNames Unity类名或类名数组 (如 "Texture2D", "TextAsset")
     * @returns {Array<Object>} 匹配的对象信息数组
     */
    getObjectInfosByClass(classNames) {
        if (!classNames) return this.getObjectInfos()

        const classNameList = Array.isArray(classNames) ? classNames : [classNames]
        const classNameSet = new Set(classNameList)
        let list = []
        for (const file of this.assetFiles) {
            const objects = file.objects
            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i]
                if (classNameSet.has(obj.getClassName())) {
                    list.push(obj)
                }
            }
        }
        return list
    }

    /**
     * 根据 PathID 查找并获取单个对象信息
     * @param {BigInt} pathId 对象的唯一 PathID
     * @returns {Object|null} 匹配的对象信息或 null
     */
    getObjectInfoByPathId(pathId) {
        const cached = this.cache.get(`obj_${pathId}`)
        if (cached) return cached

        for (const file of this.assetFiles) {
            const obj = file.getObjectByPathID
                ? file.getObjectByPathID(pathId)
                : file.objects.find((o) => o.pathID === pathId)
            if (obj) {
                this.cache.set(`obj_${pathId}`, obj)
                return obj
            }
        }

        // Cross-manager fallback
        for (const ref of AssetManager.activeManagers) {
            const manager = ref.deref()
            if (!manager) {
                AssetManager.activeManagers.delete(ref)
                continue
            }
            if (manager === this) continue
            for (const file of manager.assetFiles) {
                const obj = file.getObjectByPathID
                    ? file.getObjectByPathID(pathId)
                    : file.objects.find((o) => o.pathID === pathId)
                if (obj) {
                    return obj
                }
            }
        }

        return null
    }

    /**
     * 获取对象信息对应的 Asset 容器引用对象
     * @param {Object} objectInfo 对象信息
     * @returns {Object|null} 匹配的容器实例，如没有则返回 null
     */
    getContainer(objectInfo) {
        const file = objectInfo?.assetFile || objectInfo?._reader?.assetFile || this.primaryAssetFile
        if (!file) return null
        if (typeof file._cachedContainer === 'undefined') {
            file._cachedContainer = file.objects.find((obj) => obj.pathID === 1n) || null
        }
        const container = file._cachedContainer
        if (container && container.object && typeof container.object.getContainer === 'function') {
            return container.object.getContainer(objectInfo)
        }
        return null
    }

    /**
     * 计算并获取对象在虚拟目录系统中的完整路径和扩展名
     * @param {Object} objectInfo 对象信息
     * @returns {Object|null} 包含虚拟路径、文件名、默认导出扩展名的信息对象
     */
    getObjectPathInfo(objectInfo) {
        if (!objectInfo) return null
        const name = objectInfo.name || 'unnamed'

        const container = this.getContainer(objectInfo)
        if (!container) {
            return {
                path: '',
                name: name,
                exportExtension: objectInfo.exportExtension || '',
            }
        }

        const path = container.key || ''
        const dirMatch = path.match(/(.*)\/(.*)/)

        return {
            path: dirMatch ? dirMatch[1] : path,
            name: name,
            exportExtension: objectInfo.exportExtension || '',
        }
    }

    /**
     * 根据对象精确名称获取单个对象信息 (ObjectInfo)
     * @param {string} name 对象的精确名称
     * @returns {Object|null} 匹配的对象信息或 null
     */
    getObjectInfoByName(name) {
        if (!name) return null
        for (const file of this.assetFiles) {
            const obj = file.objects.find((o) => o.name === name)
            if (obj) return obj
        }
        return null
    }

    /**
     * 根据名称匹配规则模糊查询所有满足条件的对象信息列表 (ObjectInfo)
     * @param {string|RegExp} pattern 字符串子串或正则表达式
     * @returns {Array<Object>} 匹配的对象信息数组
     */
    findObjectInfosByName(pattern) {
        if (!pattern) return []
        const isRegex = pattern instanceof RegExp
        return this.getObjectInfos((obj) => {
            return isRegex ? pattern.test(obj.name) : obj.name.includes(pattern)
        })
    }

    /**
     * 根据精确名称直接处理并导出文件
     * @param {string} name 对象的精确名称
     * @param {Object} [options={}] 导出配置参数
     * @returns {Promise<Object|null>} 包含导出文件的数据、路径与类型，未匹配到返回 null
     */
    async exportFileByName(name, options = {}) {
        const obj = this.getObjectInfoByName(name)
        return obj ? this.exportFile(obj, options) : null
    }

    /**
     * 根据 PathID 直接处理并导出文件
     * @param {BigInt} pathId 唯一 PathID
     * @param {Object} [options={}] 导出配置参数
     * @returns {Promise<Object|null>} 包含导出文件的数据、路径与类型，未匹配到返回 null
     */
    async exportFileByPathId(pathId, options = {}) {
        const obj = this.getObjectInfoByPathId(pathId)
        return obj ? this.exportFile(obj, options) : null
    }

    /**
     * 获取符合特定类的所有文件对象并直接完整导出
     * @param {string} type 导出类别 (如 'Texture2D', 'TextAsset')
     * @param {Object} [options={}] 导出配置参数
     * @returns {Promise<Array<Object>>} 已导出的格式化文件对象数组
     */
    async exportFilesByType(type, options = {}) {
        const results = []
        await this.forEachFile(type, async (objectInfo, exportFile) => {
            const file = await exportFile(options)
            if (file) results.push(file)
        })
        return results
    }

    /**
     * 收集当前管理器所关联的各种 Unity 对象类型的统计信息
     * @returns {Object} 键为对象类名，值为数量的统计字典
     */
    getStats() {
        const stats = {}
        for (const file of this.assetFiles) {
            for (const obj of file.objects) {
                const className = obj.getClassName() || 'Unknown'
                stats[className] = (stats[className] || 0) + 1
            }
        }
        return stats
    }

    /**
     * 遍历并回调处理匹配特定文件类型的对象
     * @param {string} type 遍历的对象类别
     * @param {Function} callback 异步回调函数 (objectInfo, exportFileFunc, list, index)
     */
    async forEachFile(type, callback) {
        const typeMap = {
            AudioClip: 'AudioClip',
            Audio: 'AudioClip',
            TextAsset: 'TextAsset',
            Text: 'TextAsset',
            Texture2D: 'Texture2D',
            Json: 'MonoBehaviour',
            MonoBehaviour: 'MonoBehaviour',
            Sprite: 'Sprite',
        }

        const className = typeMap[type]
        if (!className) return

        const files = this.getObjectInfosByClass(className)
        if (!files.length) return

        for (let i = 0; i < files.length; i++) {
            try {
                await callback(files[i], (options) => this.exportFile(files[i], options), files, i)
            } catch (error) {
                console.error(`Error processing file ${files[i]?.name}:`, error)
            }
        }
    }

    /**
     * 遍历并回调处理所有类型的对象信息 (不分类别)
     * @param {Function} callback 异步回调函数 (objectInfo, exportFileFunc, index, length)
     */
    async forEachAllFiles(callback) {
        const files = this.getObjectInfos()
        if (!files.length) return

        for (let i = 0; i < files.length; i++) {
            try {
                await callback(files[i], (options) => this.exportFile(files[i], options), i, files.length)
            } catch (error) {
                console.error(`Error processing file ${files[i]?.name}:`, error)
            }
        }
    }

    /**
     * 查询 Sprite 对应的精灵图集相关数据
     * @param {Object} sprite Sprite 对象
     * @returns {Object|null} 精灵图集元数据信息，若无则返回 null
     */
    getSpriteAtlasData(sprite) {
        if (!sprite?.object?.spriteAtlas?.pathID) return null

        const spriteAtlas = this.getObjectInfoByPathId(sprite.object.spriteAtlas.pathID)
        if (!spriteAtlas?.object?.renderDatas) return null

        const { renderDataKey } = sprite.object
        return (
            spriteAtlas.object.renderDatas.find(
                (e) => e.renderDataKey?.key === renderDataKey?.key && e.renderDataKey?.value === renderDataKey?.value,
            )?.spriteAtlasData || null
        )
    }

    /**
     * 转换与翻转纹理的二维坐标矩形信息
     * @param {Object} rect 矩形框数据 {x, y, width, height}
     * @param {number} height 参考底图的总高度
     * @param {boolean} [invertY=true] 是否对Y轴执行反向镜像翻转
     * @returns {Object} 修正坐标后的矩形信息
     */
    processTextureRect(rect, height, invertY = true) {
        const processed = floorAllValues({ ...rect })
        if (invertY) {
            processed.y = height - processed.y - processed.height
        }
        return processed
    }
    /**
     * 导出并处理 Sprite 裁剪图像数据
     * @param {Object} sprite Sprite 类型对象信息
     * @param {Object} [options={}] 精灵裁剪及图片导出配置
     * @returns {Promise<Object|null>} Sprite 图像信息及坐标信息，解析失败返回 null
     */
    async exportSprite(sprite, options = {}) {
        return exportSprite(sprite, options, this)
    }

    /**
     * 处理并生成导出的格式化物理文件实体数据
     * @param {Object} objectInfo 目标对象元数据 (ObjectInfo)
     * @param {Object} [options={}] 导出格式配置
     * @returns {Promise<Object|null>} 格式化导出的物理文件结构，发生异常则回退并返回错误消息
     */
    async exportFile(objectInfo, options = {}) {
        if (!objectInfo) return null

        const className = objectInfo.getClassName()
        if (!className) return null

        const filePath = this.getObjectPathInfo(objectInfo)
        if (!filePath) return null

        const baseResult = {
            object: objectInfo,
            src: this._buildFilePath(filePath, objectInfo),
        }

        try {
            const exporterFn = ObjectRegistry.getExporter(className)
            if (exporterFn) {
                if (className === 'MonoBehaviour') {
                    let isCubism = false
                    try {
                        const mono = objectInfo.object
                        if (mono && mono.script) {
                            const scriptPathID = mono.script.pathID
                            if (scriptPathID) {
                                const scriptObjInfo = this.getObjectInfoByPathId(BigInt(scriptPathID))
                                if (
                                    scriptObjInfo &&
                                    scriptObjInfo.object &&
                                    scriptObjInfo.object.className === 'CubismModel'
                                ) {
                                    isCubism = true
                                }
                            }
                        }

                        if (!isCubism) {
                            const monoData = objectInfo.assetFile?.getObjectUsingTreeJSON(objectInfo)
                            if (monoData && (monoData._moc !== undefined || monoData.m_Moc !== undefined)) {
                                isCubism = true
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to check MonoBehaviour script class', e)
                    }

                    if (isCubism) {
                        const l2dResult = await processLive2DModel(objectInfo, this)
                        return {
                            isFolder: true,
                            name: l2dResult.name,
                            files: l2dResult.files,
                        }
                    }

                    baseResult.src = baseResult.src.replace('.dat', '') + '.json'
                } else if (className === 'Sprite') {
                    baseResult.src = baseResult.src.replace('.dat', '.png')
                }

                let exportResult
                if (className === 'AudioClip') {
                    exportResult = await exporterFn(objectInfo, options, filePath, this)
                } else {
                    exportResult = await exporterFn(objectInfo, options, this, filePath)
                }

                return {
                    ...baseResult,
                    ...exportResult,
                }
            }

            return baseResult
        } catch (error) {
            console.error(`Error processing ${className} file:`, error)
            return { ...baseResult, error: error.message }
        }
    }

    /**
     * 过滤移除非法文件名特殊字符以满足各种操作系统的要求
     * @private
     */
    _removeSpecialCharacters(name) {
        return name.replace(/[*<>"?:]/g, '')
    }

    /**
     * 组装完整的导出物理路径字符串
     * @private
     */
    _buildFilePath(filePath, objectInfo) {
        const name = filePath.name || 'unnamed'
        let src = filePath.path ? `${filePath.path}/${name}` : name
        if (!name.includes('.') && objectInfo.object.exportExtension) {
            src += objectInfo.object.exportExtension
        }
        return this._removeSpecialCharacters(src)
    }
}
