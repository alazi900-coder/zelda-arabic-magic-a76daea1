import { LZ4_WASM_BASE64, LZMA_WASM_BASE64, PNG_WASM_BASE64 } from './wasmBase64.js'

// Helper to convert base64 to Uint8Array
function base64ToUint8Array(base64) {
    if (typeof atob === 'function') {
        const binaryString = atob(base64)
        const len = binaryString.length
        const bytes = new Uint8Array(len)
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i)
        }
        return bytes
    } else if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(base64, 'base64'))
    }
    throw new Error('atob or Buffer is required to decode base64 WASM')
}

// 1. Initialize LZ4 WASM
let lz4Instance = null
try {
    const lz4Bytes = base64ToUint8Array(LZ4_WASM_BASE64)
    const lz4Module = new WebAssembly.Module(lz4Bytes)
    lz4Instance = new WebAssembly.Instance(lz4Module)
} catch (err) {
    console.warn('[unityfs-js] Failed to compile LZ4 WebAssembly:', err)
}

// Memory growth helper for LZ4
function growLz4MemoryTo(instance, byteLength) {
    const exports = instance.exports
    const needed = exports.getLinearMemoryOffset() + byteLength
    const pageCountBefore = exports.memory.buffer.byteLength >>> 16
    const pageCountAfter = (needed + 65535) >>> 16
    if (pageCountAfter > pageCountBefore) {
        exports.memory.grow(pageCountAfter - pageCountBefore)
    }
    return exports.memory.buffer
}

export const lz4BlockWASM = lz4Instance
    ? {
          decodeBlock(input, inputOffset, outputSize) {
              if (input instanceof ArrayBuffer) {
                  input = new Uint8Array(input)
              }
              const inputSize = input.byteLength
              const exports = lz4Instance.exports
              const mem0 = exports.getLinearMemoryOffset()
              const memBuffer = growLz4MemoryTo(lz4Instance, inputSize + outputSize)

              const inputArea = new Uint8Array(memBuffer, mem0, inputSize)
              inputArea.set(input)

              const decodedSize = exports.lz4BlockDecode(mem0 + inputOffset, inputSize - inputOffset, mem0 + inputSize)
              if (decodedSize === 0) {
                  return null
              }
              return new Uint8Array(memBuffer, mem0 + inputSize, decodedSize)
          },
      }
    : null

// 2. Initialize LZMA WASM
let lzmaInstance = null
try {
    const lzmaBytes = base64ToUint8Array(LZMA_WASM_BASE64)
    const lzmaModule = new WebAssembly.Module(lzmaBytes)
    lzmaInstance = new WebAssembly.Instance(lzmaModule)
} catch (err) {
    console.warn('[unityfs-js] Failed to compile LZMA WebAssembly:', err)
}

// Memory growth helper for LZMA
function growLzmaMemoryTo(instance, byteLength) {
    const exports = instance.exports
    const needed = exports.getLinearMemoryOffset() + byteLength
    const pageCountBefore = exports.memory.buffer.byteLength >>> 16
    const pageCountAfter = (needed + 65535) >>> 16
    if (pageCountAfter > pageCountBefore) {
        exports.memory.grow(pageCountAfter - pageCountBefore)
    }
    return exports.memory.buffer
}

export const lzmaBlockWASM = lzmaInstance
    ? {
          decodeBlock(input, outputSize) {
              if (input instanceof ArrayBuffer) {
                  input = new Uint8Array(input)
              }
              const inputSize = input.byteLength
              const exports = lzmaInstance.exports
              const mem0 = exports.getLinearMemoryOffset()
              const memBuffer = growLzmaMemoryTo(lzmaInstance, inputSize + outputSize)

              const inputArea = new Uint8Array(memBuffer, mem0, inputSize)
              inputArea.set(input)

              const decodedSize = exports.lzmaBlockDecode(mem0, inputSize, mem0 + inputSize, outputSize)
              if (decodedSize === 0) {
                  return null
              }
              return new Uint8Array(memBuffer, mem0 + inputSize, decodedSize)
          },
      }
    : null

// 3. Initialize PNG Encoder WASM (LodePNG WASM)
let pngInstance = null
try {
    if (typeof WebAssembly !== 'undefined' && PNG_WASM_BASE64) {
        const pngBytes = base64ToUint8Array(PNG_WASM_BASE64)
        const pngModule = new WebAssembly.Module(pngBytes)
        pngInstance = new WebAssembly.Instance(pngModule)
    }
} catch (err) {
    console.warn('[unityfs-js] Failed to compile PNG WebAssembly (LodePNG):', err)
}

export const pngEncoderWASM = pngInstance
    ? {
          encode(rgbaData, width, height) {
              if (rgbaData instanceof ArrayBuffer) {
                  rgbaData = new Uint8Array(rgbaData)
              }
              const rgbaSize = rgbaData.byteLength
              const exports = pngInstance.exports

              // Allocate memory for input RGBA data
              const inputPointer = exports.malloc(rgbaSize)
              if (!inputPointer) {
                  return null
              }
              const targetView = new Uint8Array(exports.memory.buffer, inputPointer, rgbaSize)
              targetView.set(rgbaData)

              // Allocate metadata pointers (outPointer at offset 0, outSize at offset 4)
              const metadataPointer = exports.malloc(8)
              if (!metadataPointer) {
                  exports.free(inputPointer)
                  return null
              }

              // Encode RGBA to PNG via LodePNG
              const error = exports.lodepng_encode32(
                  metadataPointer,
                  metadataPointer + 4,
                  inputPointer,
                  width,
                  height
              )

              // Free input buffer
              exports.free(inputPointer)

              if (error !== 0) {
                  exports.free(metadataPointer)
                  console.warn('[unityfs-js] lodepng_encode32 returned error code:', error)
                  return null
              }

              // Read output pointer & size from metadata
              const metadata = new Uint32Array(exports.memory.buffer, metadataPointer, 2)
              const outputPointer = metadata[0]
              const outputSize = metadata[1]
              exports.free(metadataPointer)

              // Copy encoded PNG data out
              const output = new Uint8Array(exports.memory.buffer, outputPointer, outputSize).slice()
              exports.free(outputPointer)

              return output
          },
          decode(pngData) {
              if (pngData instanceof ArrayBuffer) {
                  pngData = new Uint8Array(pngData)
              }
              const pngSize = pngData.byteLength
              const exports = pngInstance.exports

              const inputPointer = exports.malloc(pngSize)
              if (!inputPointer) {
                  return null
              }
              new Uint8Array(exports.memory.buffer, inputPointer, pngSize).set(pngData)

              // metadata: [outRgbaPtr (4B), width (4B), height (4B)]
              const metadataPointer = exports.malloc(12)
              if (!metadataPointer) {
                  exports.free(inputPointer)
                  return null
              }

              const error = exports.lodepng_decode32(
                  metadataPointer,
                  metadataPointer + 4,
                  metadataPointer + 8,
                  inputPointer,
                  pngSize
              )
              exports.free(inputPointer)

              if (error !== 0) {
                  exports.free(metadataPointer)
                  console.warn('[unityfs-js] lodepng_decode32 returned error code:', error)
                  return null
              }

              const metadata = new Uint32Array(exports.memory.buffer, metadataPointer, 3)
              const outputPointer = metadata[0]
              const width = metadata[1]
              const height = metadata[2]
              exports.free(metadataPointer)

              const outputSize = width * height * 4
              const rgba = new Uint8Array(exports.memory.buffer, outputPointer, outputSize).slice()
              exports.free(outputPointer)

              return { data: rgba, width, height }
          },
      }
    : null

