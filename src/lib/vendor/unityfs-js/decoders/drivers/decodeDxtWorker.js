import { decodeBC1, decodeBC2, decodeBC3 } from './decodeDxt.js'

let workerCode = `
"use strict";

${decodeBC1.toString()}
${decodeBC2.toString()}
${decodeBC3.toString()}

self.onmessage = function(e) {
    const { id, command, data, width, height, format } = e.data; 
    
    try {
        switch(command) {
            case 'decode':
                const result = decodeDXT(data, width, height, format);
                self.postMessage({  
                    id, 
                    result: result.buffer  
                }, [result.buffer]);
                break;
                
            case 'init':
                self.postMessage({ id, status: 'ready' });
                break;
        }
    } catch (error) {
        self.postMessage({ id, error: error.message });
    }
};
 
function decodeDXT(data, width, height, format) {
    var result;
    let imageDataView = new Uint8Array(data)
    format = format ? format.toLowerCase() : 'dxt1';

    if (format === decode.dxt1) {
        result = decodeBC1(imageDataView, width, height);
    } else if(format === decode.dxt2) {
        result = decodeBC2(imageDataView, width, height, true);
    } else if(format === decode.dxt3) {
        result = decodeBC2(imageDataView, width, height, false);
    } else if(format === decode.dxt4) {
        result = decodeBC3(imageDataView, width, height, true);
    } else if(format === decode.dxt5) {
        result = decodeBC3(imageDataView, width, height, false);
    } else {
        throw new Error('Unknown DXT format : ' + format);
    }

    return result;
}
let decode = {}
decode.dxt1 = 'dxt1';
decode.dxt2 = 'dxt2';
decode.dxt3 = 'dxt3';
decode.dxt4 = 'dxt4';
decode.dxt5 = 'dxt5';
`

const blob = new Blob([workerCode], { type: 'application/javascript' })

const workerUrl = URL.createObjectURL(blob)

export class DXTDecoder {
    constructor() {
        this.worker = new Worker(workerUrl, { type: 'module', name: Date.now() })
        URL.revokeObjectURL(workerUrl)
        this.taskId = 0
        this.pending = new Map()

        this.worker.onmessage = (e) => {
            const { id, result, error } = e.data
            const callbacks = this.pending.get(id)
            if (callbacks) {
                if (error) {
                    callbacks.reject(new Error(error))
                } else {
                    callbacks.resolve(new Uint8Array(result))
                }
                this.pending.delete(id)
            }
        }
    }
    decode(data, width, height, format = 'dxt1') {
        return new Promise((resolve, reject) => {
            format = format.toLowerCase()
            const id = this.taskId++
            this.pending.set(id, { resolve, reject })
            const arrayBuffer = data.buffer || data
            this.worker.postMessage(
                {
                    id,
                    command: 'decode',
                    data: arrayBuffer,
                    width,
                    height,
                    format,
                },
                [arrayBuffer],
            )
        })
    }

    terminate() {
        this.worker.terminate()
    }
}
