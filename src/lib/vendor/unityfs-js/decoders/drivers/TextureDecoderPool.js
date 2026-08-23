// LumenTale imports MonoBehaviour text tables only. Avoid eagerly importing
// the optional texture worker: its Vite query module has no standard ESM
// default export, and this path never requests Texture2D decoding.
const TextureWorker = undefined

export class TextureDecoderPool {
    constructor(poolSize) {
        const defaultSize =
            typeof navigator !== 'undefined' && navigator.hardwareConcurrency
                ? navigator.hardwareConcurrency
                : 4
        this.poolSize = Math.max(1, Math.min(poolSize || defaultSize, 16))
        this.workers = []
        this.taskQueue = []
        this.pendingTasks = new Map()
        this.taskId = 0
        this.initPool()
    }

    initPool() {
        if (typeof Worker === 'undefined') {
            return
        }

        for (let i = 0; i < this.poolSize; i++) {
            try {
                let worker
                if (typeof TextureWorker === 'function') {
                    worker = new TextureWorker()
                } else {
                    worker = new Worker(
                        new URL('./textureDecoder.worker.js', import.meta.url),
                        { type: 'module' },
                    )
                }
                const workerItem = {
                    id: i,
                    worker,
                    busy: false,
                    currentTaskId: null,
                }

                worker.onmessage = (e) => {
                    const { id, result, error } = e.data
                    const task = this.pendingTasks.get(id)
                    if (task) {
                        this.pendingTasks.delete(id)
                        if (error) {
                            task.reject(new Error(error))
                        } else {
                            task.resolve(new Uint8Array(result))
                        }
                    }
                    workerItem.busy = false
                    workerItem.currentTaskId = null
                    this.dispatchNext()
                }

                worker.onerror = (err) => {
                    if (workerItem.currentTaskId !== null) {
                        const task = this.pendingTasks.get(workerItem.currentTaskId)
                        if (task) {
                            this.pendingTasks.delete(workerItem.currentTaskId)
                            task.reject(err)
                        }
                    }
                    workerItem.busy = false
                    workerItem.currentTaskId = null
                    this.dispatchNext()
                }

                this.workers.push(workerItem)
            } catch (err) {
                console.warn('[TextureDecoderPool] Failed to spawn worker:', err)
            }
        }
    }

    dispatchNext() {
        if (this.taskQueue.length === 0) return
        const availableWorker = this.workers.find((w) => !w.busy)
        if (!availableWorker) return

        const task = this.taskQueue.shift()
        availableWorker.busy = true
        availableWorker.currentTaskId = task.id

        const buffer = task.buffer
        availableWorker.worker.postMessage(
            {
                id: task.id,
                data: buffer,
                width: task.width,
                height: task.height,
                textureFormat: task.textureFormat,
                options: task.options,
            },
            [buffer],
        )
    }

    decode(data, width, height, textureFormat, options = {}) {
        if (this.workers.length === 0) {
            return null
        }

        return new Promise((resolve, reject) => {
            const id = this.taskId++
            const u8 = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data)
            // Clone buffer for transferable transfer to avoid detaching the caller's buffer
            const bufferCopy = u8.slice().buffer

            this.pendingTasks.set(id, { resolve, reject })
            this.taskQueue.push({
                id,
                buffer: bufferCopy,
                width,
                height,
                textureFormat,
                options,
            })

            this.dispatchNext()
        })
    }

    terminate() {
        for (const item of this.workers) {
            item.worker.terminate()
        }
        this.workers = []
        this.pendingTasks.clear()
        this.taskQueue = []
    }
}

let globalPool = null

export function getTextureDecoderPool() {
    if (!globalPool) {
        globalPool = new TextureDecoderPool()
    }
    return globalPool
}
