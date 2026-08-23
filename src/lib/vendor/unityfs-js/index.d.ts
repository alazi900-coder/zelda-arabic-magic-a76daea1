export class ObjectInfo {
    _reader: any
    _version: number
    _unityRevision: string
    _targetPlatform: number
    assetFile: AssetFile | null
    enableCaching: boolean
    internalID: string
    hasRenderedOn: any[]
    classID: number
    typeID: number
    pathID: bigint
    offset: number
    size: number
    cachedObject?: any
    cachedName?: string

    constructor(
        reader: any,
        version: number,
        unityRevision: string,
        targetPlatform: number,
        assetFile?: AssetFile | null,
    )
    getClassName(): string
    get className(): string
    _createReader(): any
    _tryGetClass(): any
    setCaching(enabled: boolean): void
    get object(): any
    get name(): string
    get exportExtension(): string
    serialize(): Uint8Array
}

export class AssetFile {
    reader: any
    fileID: number
    options: any
    unityRevision?: string
    types: any[]
    objects: ObjectInfo[]
    scriptTypes: any[]
    externals: any[]
    refTypes: any[]
    userInformation: any

    constructor(reader: any, fileID?: number, options?: any)
    parse(): void
    getClass(classID: number): any
    getObjectByPathID(pathId: bigint): ObjectInfo | null
    getTypeFromReference(typeRef: any): any
    getObjectUsingTreeJSON(obj: ObjectInfo): any
    getLocalTypeRegistryAsJSON(): string
    serialize(): Uint8Array
}

export class AssetManager {
    static activeManagers: Set<WeakRef<AssetManager>>
    options: any
    unityFile: UnityFS | null
    bundleFile: any | null
    assetFiles: AssetFile[]
    resourceFiles: Map<string, Uint8Array>
    cache: Map<string, any>
    unityRevision?: string

    constructor(assetFileOrOptions?: any, options?: any)
    bindContainer(unityFile: UnityFS): void
    bindBundle(bundleFile: any): void
    getMetadata(): {
        targetPlatform: number | null
        unityRevision: string | null
        unityVersion: string | null
        version: number | null
        fileSize: number | null
        endianness: number | null
    }
    dispose(): void
    get primaryAssetFile(): AssetFile | null
    registerAssetFile(assetFile: AssetFile): void
    registerResourceFile(path: string, data: Uint8Array): void
    resolveResource(resourcePath: string, offset: number | bigint, size: number | bigint): Uint8Array | null
    getObjectInfoIndex(objectInfo: ObjectInfo): number
    getObjectInfos(filterFun?: (obj: ObjectInfo) => boolean): ObjectInfo[]
    getObjectInfosByClass(classNames?: string | string[]): ObjectInfo[]
    getObjectInfoByPathId(pathId: bigint): ObjectInfo | null
    getContainer(objectInfo: ObjectInfo): ObjectInfo | null
    getObjectPathInfo(objectInfo: ObjectInfo): {
        path: string
        name: string
        exportExtension: string
    } | null
    getObjectInfoByName(name: string): ObjectInfo | null
    findObjectInfosByName(pattern: string | RegExp): ObjectInfo[]
    exportFileByName(name: string, options?: any): Promise<any>
    exportFileByPathId(pathId: bigint, options?: any): Promise<any>
    exportFilesByType(type: string, options?: any): Promise<any[]>
    getStats(): Record<string, number>
    forEachFile(
        type: string,
        callback: (
            objectInfo: ObjectInfo,
            exportFileFunc: (options?: any) => Promise<any>,
            list: ObjectInfo[],
            index: number,
        ) => any,
    ): Promise<void>
    forEachAllFiles(
        callback: (
            objectInfo: ObjectInfo,
            exportFileFunc: (options?: any) => Promise<any>,
            index: number,
            total: number,
        ) => any,
    ): Promise<void>
    getSpriteAtlasData(sprite: ObjectInfo): any | null
    processTextureRect(
        rect: { x: number; y: number; width: number; height: number },
        height: number,
        invertY?: boolean,
    ): { x: number; y: number; width: number; height: number }
    exportSprite(sprite: ObjectInfo, options?: any): Promise<any>
    exportFile(objectInfo: ObjectInfo, options?: any): Promise<any>
}

export class UnityFS {
    options: LoadOptions
    reader: any
    fileType: number
    parser: any
    assetManager: AssetManager

    constructor(data: ArrayBuffer | Uint8Array, options?: LoadOptions)
    parseHeader(): void
    isAsset(): boolean
    parse(): void
    sliceBeforeSecondUnityFS(arrayBuffer: ArrayBuffer | Uint8Array): ArrayBuffer | Uint8Array
}

export interface LoadOptions {
    unityRevision?: string
    sliceBeforeSecondUnityFS?: boolean
    [key: string]: any
}

export function load(source: string | ArrayBuffer | Uint8Array, options?: LoadOptions): Promise<AssetManager>

export function registerClass(classId: number, className: string, parserClass: any): void

export function setDependencies(deps: Record<string, any>): void

// Decalrations for exporters subpaths so TypeScript can resolve them when imported directly
declare module 'unityfs-js/exporters/index.js' {
    import { AssetManager, ObjectInfo } from 'unityfs-js'

    export function processAudioClip(
        objectInfo: ObjectInfo,
        options: any,
        filePath: any,
        manager: AssetManager,
    ): Promise<{
        data: { raw: any }
        fileType: string
        type: string
        src: string
    } | null>

    export function processTextAsset(
        objectInfo: ObjectInfo,
        options: any,
    ): Promise<{ data: { raw: string | Uint8Array } }>

    export function processTexture2D(
        objectInfo: ObjectInfo,
        options: any,
        manager: AssetManager,
    ): Promise<{ data: any }>

    export function processMonoBehaviour(
        objectInfo: ObjectInfo,
        options: any,
        manager: AssetManager,
    ): Promise<{ data: { raw: any } }>

    export function exportSprite(
        sprite: ObjectInfo,
        options: any,
        manager: AssetManager,
    ): Promise<{
        data: {
            rect: any
            cutting: boolean
            [key: string]: any
        }
    } | null>

    export function processMesh(objectInfo: ObjectInfo, options?: any): Promise<{ data: { raw: string | ArrayBuffer } }>

    export function processLive2DModel(
        cubismModelObjInfo: ObjectInfo,
        manager: AssetManager,
    ): Promise<{
        name: string
        files: Record<string, Uint8Array | string>
    }>
}

declare module 'unityfs-js/exporters/live2dExporter.js' {
    import { AssetManager, ObjectInfo } from 'unityfs-js'
    export function processLive2DModel(
        cubismModelObjInfo: ObjectInfo,
        manager: AssetManager,
    ): Promise<{
        name: string
        files: Record<string, Uint8Array | string>
    }>
}

declare module 'unityfs-js/exporters/audioClipExporter.js' {
    import { AssetManager, ObjectInfo } from 'unityfs-js'
    export function processAudioClip(
        objectInfo: ObjectInfo,
        options: any,
        filePath: any,
        manager: AssetManager,
    ): Promise<{
        data: { raw: any }
        fileType: string
        type: string
        src: string
    } | null>
}

declare module 'unityfs-js/exporters/textAssetExporter.js' {
    import { ObjectInfo } from 'unityfs-js'
    export function processTextAsset(
        objectInfo: ObjectInfo,
        options: any,
    ): Promise<{ data: { raw: string | Uint8Array } }>
}

declare module 'unityfs-js/exporters/texture2DExporter.js' {
    import { AssetManager, ObjectInfo } from 'unityfs-js'
    export function processTexture2D(
        objectInfo: ObjectInfo,
        options: any,
        manager: AssetManager,
    ): Promise<{ data: any }>
}

declare module 'unityfs-js/exporters/monoBehaviourExporter.js' {
    import { AssetManager, ObjectInfo } from 'unityfs-js'
    export function processMonoBehaviour(
        objectInfo: ObjectInfo,
        options: any,
        manager: AssetManager,
    ): Promise<{ data: { raw: any } }>
}

declare module 'unityfs-js/exporters/spriteExporter.js' {
    import { AssetManager, ObjectInfo } from 'unityfs-js'
    export function exportSprite(
        sprite: ObjectInfo,
        options: any,
        manager: AssetManager,
    ): Promise<{
        data: {
            rect: any
            cutting: boolean
            [key: string]: any
        }
    } | null>
    export function rotateAndFlipRGBA(
        data: Uint8Array,
        width: number,
        height: number,
        rotation: string,
    ): { data: Uint8Array; width: number; height: number }
}

declare module 'unityfs-js/exporters/meshExporter.js' {
    import { ObjectInfo } from 'unityfs-js'
    export function processMesh(objectInfo: ObjectInfo, options?: any): Promise<{ data: { raw: string | ArrayBuffer } }>
}
