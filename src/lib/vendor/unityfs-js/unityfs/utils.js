import { ObjectRegistry } from '../core/registry.js'

export async function requestExternalData(streamingInfo) {
    return new Promise((resolve, reject) => {
        const listener = (result) => {
            document.body.removeEventListener('bundle-resolve-response', listener)
            if (result.detail.status) {
                let outData = result.detail.data.slice(
                    streamingInfo.offset,
                    streamingInfo.offset + (streamingInfo.size === -1 ? result.detail.data.length : streamingInfo.size),
                )
                resolve(outData)
            } else {
                reject('Failed to resolve external image data')
            }
        }
        document.body.addEventListener('bundle-resolve-response', listener)
        document.body.dispatchEvent(new CustomEvent('bundle-resolve-request', { detail: streamingInfo.path }))
    })
}

export function getClassName(classID) {
    return ObjectRegistry.getClassName(classID)
}

export function globalDestroy() {
    console.log(`Destroying ${globalThis._global__destroyable?.length || 0} objects`)
    if (globalThis._global__destroyable) {
        globalThis._global__destroyable.forEach((o) => {
            if (typeof o == 'function') o()
        })
        globalThis._global__destroyable = []
    }
}
