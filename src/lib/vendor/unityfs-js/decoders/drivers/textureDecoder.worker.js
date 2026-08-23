import { decodeTexture2D } from './Texture2DDecoder.js'

self.onmessage = async (e) => {
    const { id, data, width, height, textureFormat, options } = e.data
    try {
        const u8Data = new Uint8Array(data)
        // Pass worker: false to ensure the decoding executes locally in this worker thread
        const result = await decodeTexture2D(u8Data, width, height, textureFormat, {
            ...options,
            worker: false,
        })

        const buffer = result.buffer
        // Transferable return
        self.postMessage(
            {
                id,
                result: buffer,
            },
            [buffer],
        )
    } catch (err) {
        self.postMessage({
            id,
            error: err.message || String(err),
        })
    }
}
