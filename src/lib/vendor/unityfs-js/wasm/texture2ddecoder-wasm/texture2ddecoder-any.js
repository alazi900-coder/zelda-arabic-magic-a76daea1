import * as jsDec from './texture2ddecoder-js.js';
import * as wasmDec from './texture2ddecoder-wasm.js';
import { decode as jsDecodeDxt } from '../../decoders/drivers/decodeDxt.js';
import decodeBC7 from '../../vendor/bc7-decoder/index.js';

export async function decodeEtc1(data, width, height, options = {}) {
    if (options.decoder !== 'js') {
        try {
            return await wasmDec.decode_etc1(data, width, height);
        } catch (e) {
            console.warn('WASM decode_etc1 failed, falling back to JS:', e.message);
        }
    }
    return jsDec.decodeETC(data, width, height, jsDec.ETC_FORMAT.ETC1_RGB, 2);
}

export async function decodeEtc2(data, width, height, options = {}) {
    if (options.decoder !== 'js') {
        try {
            return await wasmDec.decode_etc2(data, width, height);
        } catch (e) {
            console.warn('WASM decode_etc2 failed, falling back to JS:', e.message);
        }
    }
    return jsDec.decodeETC(data, width, height, jsDec.ETC_FORMAT.ETC2_RGB, 2);
}

export async function decodeEtc2a1(data, width, height, options = {}) {
    if (options.decoder !== 'js') {
        try {
            return await wasmDec.decode_etc2a1(data, width, height);
        } catch (e) {
            console.warn('WASM decode_etc2a1 failed, falling back to JS:', e.message);
        }
    }
    return jsDec.decodeETC(data, width, height, jsDec.ETC_FORMAT.ETC2_RGBA1, 2);
}

export async function decodeEtc2a8(data, width, height, options = {}) {
    if (options.decoder !== 'js') {
        try {
            return await wasmDec.decode_etc2a8(data, width, height);
        } catch (e) {
            console.warn('WASM decode_etc2a8 failed, falling back to JS:', e.message);
        }
    }
    return jsDec.decodeETC(data, width, height, jsDec.ETC_FORMAT.ETC2_RGBA8, 2);
}

export async function decodeEacr(data, width, height, options = {}) {
    if (options.decoder !== 'js') {
        try {
            return await wasmDec.decode_eacr(data, width, height);
        } catch (e) {
            console.warn('WASM decode_eacr failed, falling back to JS:', e.message);
        }
    }
    return jsDec.decodeETC(data, width, height, jsDec.ETC_FORMAT.EAC_R11, 2);
}

export async function decodeEacrSigned(data, width, height, options = {}) {
    if (options.decoder !== 'js') {
        try {
            return await wasmDec.decode_eacr_signed(data, width, height);
        } catch (e) {
            console.warn('WASM decode_eacr_signed failed, falling back to JS:', e.message);
        }
    }
    return jsDec.decodeETC(data, width, height, jsDec.ETC_FORMAT.EAC_R11_SIGNED, 2);
}

export async function decodeEacrg(data, width, height, options = {}) {
    if (options.decoder !== 'js') {
        try {
            return await wasmDec.decode_eacrg(data, width, height);
        } catch (e) {
            console.warn('WASM decode_eacrg failed, falling back to JS:', e.message);
        }
    }
    return jsDec.decodeETC(data, width, height, jsDec.ETC_FORMAT.EAC_RG11, 2);
}

export async function decodeEacrgSigned(data, width, height, options = {}) {
    if (options.decoder !== 'js') {
        try {
            return await wasmDec.decode_eacrg_signed(data, width, height);
        } catch (e) {
            console.warn('WASM decode_eacrg_signed failed, falling back to JS:', e.message);
        }
    }
    return jsDec.decodeETC(data, width, height, jsDec.ETC_FORMAT.EAC_RG11_SIGNED, 2);
}

export async function decodeDxt(data, width, height, dxtFormat, options = {}) {
    const fmt = dxtFormat.toLowerCase();
    if (options.decoder !== 'js' && (fmt === 'dxt1' || fmt === 'dxt5')) {
        try {
            if (fmt === 'dxt1') {
                return await wasmDec.decode_bc1(data, width, height);
            } else if (fmt === 'dxt5') {
                return await wasmDec.decode_bc3(data, width, height);
            }
        } catch (e) {
            console.warn(`WASM ${dxtFormat} decoding failed, falling back to JS:`, e.message);
        }
    }
    return jsDecodeDxt(data, width, height, dxtFormat);
}

export async function decodeBc7(data, width, height, options = {}) {
    if (options.decoder !== 'js') {
        try {
            return await wasmDec.decode_bc7(data, width, height);
        } catch (e) {
            console.warn('WASM decode_bc7 failed, falling back to JS:', e.message);
        }
    }
    return decodeBC7(data.slice().buffer || data.buffer || data, width, height);
}
