/*******************************************************************************

    lzma-block-codec-wasm.js
        A javascript wrapper around a WebAssembly implementation of
        LZMA block format codec.

*******************************************************************************/

/* global WebAssembly */

'use strict'
;(function (context) {
    let wd = (function () {
        let url = document.currentScript ? document.currentScript.src : ''
        let match = /[^\/]+$/.exec(url)
        return match !== null ? url.slice(0, match.index) : ''
    })()

    let growMemoryTo = function (wasmInstance, byteLength) {
        let lzmaapi = wasmInstance.exports
        let neededByteLength = lzmaapi.getLinearMemoryOffset() + byteLength
        let pageCountBefore = lzmaapi.memory.buffer.byteLength >>> 16
        let pageCountAfter = (neededByteLength + 65535) >>> 16
        if (pageCountAfter > pageCountBefore) {
            wasmInstance.exports.memory.grow(pageCountAfter - pageCountBefore)
        }
        return lzmaapi.memory.buffer
    }

    let decodeBlock = function (wasmInstance, inputArray, outputSize) {
        let inputSize = inputArray.byteLength
        let lzmaapi = wasmInstance.exports
        let mem0 = lzmaapi.getLinearMemoryOffset()
        let memSize = inputSize + outputSize
        let memBuffer = growMemoryTo(wasmInstance, memSize)

        let inputArea = new Uint8Array(memBuffer, mem0, inputSize)
        inputArea.set(inputArray)

        const decodedSize = lzmaapi.lzmaBlockDecode(mem0, inputSize, mem0 + inputSize, outputSize)
        if (decodedSize === 0) {
            return null
        }
        return new Uint8Array(memBuffer, mem0 + inputSize, decodedSize)
    }

    context.LZMAPBlockWASM = function () {
        this.lzmaWasmInstance = undefined
    }

    context.LZMAPBlockWASM.prototype = {
        flavor: 'wasm',
        init: function () {
            if (typeof WebAssembly !== 'object') {
                this.lzmaWasmInstance = null
                return Promise.reject(new Error('WebAssembly not supported'))
            }
            if (this.lzmaWasmInstance instanceof WebAssembly.Instance) {
                return Promise.resolve(this)
            }
            if (this.lzmaWasmInstance === undefined) {
                this.lzmaWasmInstance = new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest()
                    xhr.open('GET', wd + 'lzma-block-codec.wasm', true)
                    xhr.responseType = 'arraybuffer'
                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            WebAssembly.instantiate(xhr.response)
                                .then((result) => {
                                    this.lzmaWasmInstance = result.instance
                                    resolve(this)
                                })
                                .catch(reject)
                        } else {
                            reject(new Error('XHR load failed'))
                        }
                    }
                    xhr.onerror = () => reject(new Error('XHR network error'))
                    xhr.send()
                })
            }
            return this.lzmaWasmInstance
        },
        decodeBlock: function (input, outputSize) {
            if (!(this.lzmaWasmInstance instanceof WebAssembly.Instance)) {
                throw new Error('LZMAPBlockWASM not initialized')
            }
            if (input instanceof ArrayBuffer) {
                input = new Uint8Array(input)
            }
            return decodeBlock(this.lzmaWasmInstance, input, outputSize)
        },
    }
})(this || self)
