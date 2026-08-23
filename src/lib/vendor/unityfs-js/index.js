import { UnityFS } from './unityfs/unityFile.js'
import { registerDefaultClasses } from './core/registerDefaultClasses.js'
import { ObjectRegistry } from './core/registry.js'

// Automatically register default asset classes on load
registerDefaultClasses()

export { UnityFS }
export { AssetManager } from './assetManager.js'

/**
 * Register a custom parser class dynamically (Pluggable API)
 * @param {number} classId Unity ClassID
 * @param {string} className Unity ClassName
 * @param {Function} parserClass Parser class definition
 */
export function registerClass(classId, className, parserClass) {
    ObjectRegistry.register(classId, className, parserClass)
}

/**
 * Set external runtime dependencies (e.g. THREE, GLTFExporter)
 * @param {Object} deps
 */
export function setDependencies(deps) {
    if (deps) {
        Object.assign(ObjectRegistry.dependencies, deps)
    }
}

/**
 * Internal parsing logic wrapper
 * @private
 */
function _parse(buffer, options = {}) {
    const instance = new UnityFS(new Uint8Array(buffer), options)
    instance.parse()
    return instance.assetManager
}

/**
 * Load and parse Unity Bundle
 * @param {string | ArrayBuffer} source
 * @param {Object} options Load options
 * @param {string} options.unityRevision Unity version
 * @param {Boolean} options.sliceBeforeSecondUnityFS slice off duplicate UnityFS headers
 * @returns {Promise<import('./assetManager.js').AssetManager>}
 */
export function load(source, options = {}) {
    if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
        const buf = source instanceof Uint8Array ? source.buffer : source
        return Promise.resolve(_parse(buf, options))
    }

    if (typeof source === 'string') {
        return _request(source, options)
    }

    return Promise.reject(new TypeError('Unsupported source type'))
}

/**
 * Fetch URL wrapper (XMLHTTPRequest for browser context)
 * @private
 */
function _request(url, options = {}) {
    // 优先使用 XMLHttpRequest（主流浏览器环境）
    if (typeof XMLHttpRequest !== 'undefined') {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open('GET', url, true)
            xhr.responseType = 'arraybuffer'

            xhr.onload = () => {
                if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
                    try {
                        const instance = _parse(xhr.response, options)
                        resolve(instance)
                    } catch (err) {
                        reject(`Parse Error: ${err.message}`)
                    }
                } else {
                    reject(`HTTP Error: ${xhr.status} ${xhr.statusText}`)
                }
            }

            xhr.onerror = () => reject('Network Error')
            xhr.send()
        })
    }

    // 降级使用 fetch API（支持 Node.js 18+ 或无 XMLHttpRequest 的运行环境）
    if (typeof fetch === 'function') {
        return fetch(url)
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`HTTP Error: ${res.status} ${res.statusText}`)
                }
                return res.arrayBuffer()
            })
            .then((buffer) => _parse(buffer, options))
            .catch((err) => Promise.reject(err.message || err))
    }

    return Promise.reject(new Error('No XMLHttpRequest or fetch implementation found in this environment.'))
}
