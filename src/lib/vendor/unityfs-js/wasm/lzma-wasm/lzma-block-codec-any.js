/*******************************************************************************

    lzma-block-codec-any.js
        A wrapper to instantiate a WASM-based LZMA block decoder.

*******************************************************************************/

'use strict'
;(function (context) {
    let wd = (function () {
        let url = document.currentScript.src
        let match = /[^\/]+$/.exec(url)
        return match !== null ? url.slice(0, match.index) : ''
    })()

    let removeScript = function (script) {
        if (script && script.parentNode) {
            script.parentNode.removeChild(script)
        }
    }

    let createInstanceWASM = function () {
        if (context.LZMAPBlockWASM instanceof Function) {
            let instance = new context.LZMAPBlockWASM()
            return instance.init().then(() => instance)
        }
        return new Promise((resolve, reject) => {
            let script = document.createElement('script')
            script.src = wd + 'lzma-block-codec-wasm.js'
            script.onload = () => {
                if (context.LZMAPBlockWASM instanceof Function === false) {
                    resolve(null)
                } else {
                    let instance = new context.LZMAPBlockWASM()
                    instance
                        .init()
                        .then(() => resolve(instance))
                        .catch(reject)
                }
            }
            script.onerror = () => resolve(null)
            document.head.appendChild(script)
            removeScript(script)
        })
    }

    context.lzmaBlockCodec = {
        createInstance: function () {
            return createInstanceWASM()
        },
    }
})(this || self)
