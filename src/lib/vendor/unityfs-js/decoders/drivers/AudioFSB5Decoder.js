import { FSB5 } from '../../fsb5/fsb5.js'

/**
 * Decode FSB5 audio container
 * @param {Uint8Array|ArrayBuffer} data
 * @returns {Promise<{ fileType: string, data: ArrayBuffer|null }>}
 */
export async function decodeAudioFSB5(data) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
    const fsb = new FSB5(u8)
    const wavData = await fsb.getAudio()

    let fileType = 'wav'
    if (fsb.format === 15) {
        // SoundFormat.VORBIS
        fileType = 'ogg'
    } else if (fsb.format === 11) {
        // SoundFormat.MPEG
        fileType = 'mp3'
    }

    return {
        fileType,
        data: wavData ? wavData.buffer : null,
    }
}
