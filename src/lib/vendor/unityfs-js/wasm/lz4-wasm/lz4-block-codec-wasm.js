/*******************************************************************************

    lz4-block-codec-wasm.js
        A javascript wrapper around a WebAssembly implementation of
        LZ4 block format codec.
    Copyright (C) 2018 Raymond Hill

    BSD-2-Clause License (http://www.opensource.org/licenses/bsd-license.php)

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions are
    met:

    1. Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.

    2. Redistributions in binary form must reproduce the above
    copyright notice, this list of conditions and the following disclaimer
    in the documentation and/or other materials provided with the
    distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
    "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
    LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
    A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
    OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
    SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
    LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
    DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
    (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
    OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

    Home: https://github.com/gorhill/lz4-wasm

    I used the same license as the one picked by creator of LZ4 out of respect
    for his creation, see https://lz4.github.io/lz4/

*/

/* global WebAssembly */

'use strict'

/******************************************************************************/
;(function (context) {
    // >>>> Start of private namespace

    /******************************************************************************/

    let wd = (function () {
        let url = document.currentScript ? document.currentScript.src : ''
        let match = /[^\/]+$/.exec(url)
        return match !== null ? url.slice(0, match.index) : ''
    })()

    // ... growMemoryTo, encodeBlock, decodeBlock 保持不变 ...
    let growMemoryTo = function (wasmInstance, byteLength) {
        let lz4api = wasmInstance.exports
        let neededByteLength = lz4api.getLinearMemoryOffset() + byteLength
        let pageCountBefore = lz4api.memory.buffer.byteLength >>> 16
        let pageCountAfter = (neededByteLength + 65535) >>> 16
        if (pageCountAfter > pageCountBefore) {
            lz4api.memory.grow(pageCountAfter - pageCountBefore)
        }
        return lz4api.memory.buffer
    }

    let encodeBlock = function (wasmInstance, inputArray, outputOffset) {
        let lz4api = wasmInstance.exports
        let mem0 = lz4api.getLinearMemoryOffset()
        let hashTableSize = 65536 * 4
        let inputSize = inputArray.byteLength
        if (inputSize >= 0x7e000000) {
            throw new RangeError()
        }
        let memSize = hashTableSize + inputSize + outputOffset + lz4api.lz4BlockEncodeBound(inputSize)
        let memBuffer = growMemoryTo(wasmInstance, memSize)
        let hashTable = new Int32Array(memBuffer, mem0, 65536)
        hashTable.fill(-65536, 0, 65536)
        let inputMem = new Uint8Array(memBuffer, mem0 + hashTableSize, inputSize)
        inputMem.set(inputArray)
        let outputSize = lz4api.lz4BlockEncode(
            mem0 + hashTableSize,
            inputSize,
            mem0 + hashTableSize + inputSize + outputOffset,
        )
        if (outputSize === 0) {
            return
        }
        let outputArray = new Uint8Array(memBuffer, mem0 + hashTableSize + inputSize, outputOffset + outputSize)
        return outputArray
    }

    let decodeBlock = function (wasmInstance, inputArray, inputOffset, outputSize) {
        let inputSize = inputArray.byteLength
        let lz4api = wasmInstance.exports
        let mem0 = lz4api.getLinearMemoryOffset()
        let memSize = inputSize + outputSize
        let memBuffer = growMemoryTo(wasmInstance, memSize)
        let inputArea = new Uint8Array(memBuffer, mem0, inputSize)
        inputArea.set(inputArray)
        outputSize = lz4api.lz4BlockDecode(mem0 + inputOffset, inputSize - inputOffset, mem0 + inputSize)
        if (outputSize === 0) {
            return
        }
        return new Uint8Array(memBuffer, mem0 + inputSize, outputSize)
    }

    /******************************************************************************/

    context.LZ4BlockWASM = function () {
        this.lz4wasmInstance = undefined
    }

    context.LZ4BlockWASM.prototype = {
        flavor: 'wasm',

        init: function () {
            if (typeof WebAssembly !== 'object') {
                this.lz4wasmInstance = null
            }
            if (this.lz4wasmInstance === null) {
                return Promise.reject(new Error('WebAssembly not supported'))
            }
            if (this.lz4wasmInstance instanceof WebAssembly.Instance) {
                return Promise.resolve(this)
            }

            if (this.lz4wasmInstance === undefined) {
                // 使用 XMLHttpRequest 手动加载 WASM 二进制文件
                this.lz4wasmInstance = new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest()
                    xhr.open('GET', wd + 'lz4-block-codec.wasm', true)
                    xhr.responseType = 'arraybuffer' // 关键：指定返回二进制数据

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            // 使用 WebAssembly.instantiate 处理 ArrayBuffer
                            WebAssembly.instantiate(xhr.response)
                                .then((result) => {
                                    this.lz4wasmInstance = result.instance
                                    resolve(this)
                                })
                                .catch((err) => {
                                    this.lz4wasmInstance = null
                                    reject(err)
                                })
                        } else {
                            this.lz4wasmInstance = null
                            reject(new Error('XHR load failed: ' + xhr.status))
                        }
                    }

                    xhr.onerror = () => {
                        this.lz4wasmInstance = null
                        reject(new Error('XHR network error'))
                    }

                    xhr.send()
                })
            }
            return this.lz4wasmInstance
        },

        reset: function () {
            this.lz4wasmInstance = undefined
        },

        bytesInUse: function () {
            return this.lz4wasmInstance instanceof WebAssembly.Instance
                ? this.lz4wasmInstance.exports.memory.buffer.byteLength
                : 0
        },

        encodeBlock: function (input, outputOffset) {
            if (this.lz4wasmInstance instanceof WebAssembly.Instance === false) {
                throw new Error('LZ4BlockWASM: not initialized')
            }
            if (input instanceof ArrayBuffer) {
                input = new Uint8Array(input)
            } else if (input instanceof Uint8Array === false) {
                throw new TypeError()
            }
            return encodeBlock(this.lz4wasmInstance, input, outputOffset)
        },

        decodeBlock: function (input, inputOffset, outputSize) {
            if (this.lz4wasmInstance instanceof WebAssembly.Instance === false) {
                throw new Error('LZ4BlockWASM: not initialized')
            }
            if (input instanceof ArrayBuffer) {
                input = new Uint8Array(input)
            } else if (input instanceof Uint8Array === false) {
                throw new TypeError()
            }
            return decodeBlock(this.lz4wasmInstance, input, inputOffset, outputSize)
        },
    }

    /******************************************************************************/
})(this || self) // <<<< End of private namespace
/******************************************************************************/
