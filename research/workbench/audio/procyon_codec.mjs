// NDS Procyon Studio ADPCM (SADL "NDS_PROCYON" codec) — encoder + decoder.
//
// Decoder algorithm transcribed verbatim from vgmstream's
// src/coding/nds_procyon_decoder.c (nds_procyon_decoder.c, MIT-licensed
// project). The encoder below is the inverse: for each 16-byte frame (30
// samples), it tries every (coefficient, scale) pair and keeps the one that
// reconstructs closest to the input, simulating the decoder exactly at each
// step so encoder and decoder state never diverge (standard ADPCM technique).

// "standard XA/PSX coefs << 6" — only indices 0-4 are non-zero; 5-15 alias to (0,0).
export const PROC_COEFS = [
  [0, 0],
  [60, 0],
  [115, -52],
  [98, -55],
  [122, -60],
];

const BYTES_PER_FRAME = 0x10;
const SAMPLES_PER_FRAME = (BYTES_PER_FRAME - 1) * 2; // 30

function clamp16(v) {
  if (v > 32767) return 32767;
  if (v < -32768) return -32768;
  return v;
}

/** C-style truncating integer division (toward zero), matching the original decoder's `/`. */
function divTrunc(a, b) {
  return Math.trunc(a / b);
}

/** Decodes one 16-byte frame into `SAMPLES_PER_FRAME` PCM samples, given the running history. */
export function decodeFrame(frame, hist1, hist2) {
  const header = frame[0x0f] ^ 0x80;
  const scale = 12 - (header & 0x0f);
  const index = (header >> 4) & 0x0f;
  const [coef1, coef2] = PROC_COEFS[index] ?? [0, 0];
  const out = new Int16Array(SAMPLES_PER_FRAME);

  for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
    const byte = frame[i >> 1] ^ 0x80;
    let nibble = i & 1 ? (byte >> 4) & 0xf : byte & 0xf;
    if (nibble > 7) nibble -= 16; // signed 4-bit

    let raw = nibble * 4096; // nibble * 64 * 64
    let scaled = scale < 0 ? raw << -scale : raw >> scale;

    const predicted = divTrunc(hist1 * coef1 + hist2 * coef2 + 32, 64);
    const sample = predicted + scaled * 64;

    hist2 = hist1;
    hist1 = sample;

    // Original: clamp16((sample+32)/64) / 64 * 64 -- clamp FIRST, mask second.
    out[i] = divTrunc(clamp16(divTrunc(sample + 32, 64)), 64) * 64;
  }
  return { out, hist1, hist2 };
}

/**
 * Encodes `SAMPLES_PER_FRAME` PCM samples (or fewer, zero-padded) into one
 * 16-byte frame, choosing the (coef, scale) pair that best reconstructs the
 * block. Returns the frame bytes and the resulting history state.
 */
export function encodeFrame(samples, hist1In, hist2In) {
  let best = null;

  for (let index = 0; index < 5; index++) {
    const [coef1, coef2] = PROC_COEFS[index];

    // Quantization error is not monotonic in scale near the optimum (a coarser
    // scale can occasionally beat a finer one once rounding is accounted for),
    // so a narrow window around an estimate missed the true best by several dB
    // in testing. Searching the full range (16 scales x 5 coefs = 80 per
    // frame) is what the reference decoder's own header field range implies
    // is meaningful, and stays fast enough end-to-end.
    for (let scale = -3; scale <= 12; scale++) {
      let h1s = hist1In, h2s = hist2In, err = 0;
      const nibbles = new Int8Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const target = samples[i] * 64;
        const predicted = divTrunc(h1s * coef1 + h2s * coef2 + 32, 64);
        const need = target - predicted; // == scaled*64
        let scaledNeeded = need / 64;
        let rawNeeded = scale < 0 ? scaledNeeded * Math.pow(2, -scale) : scaledNeeded * Math.pow(2, scale);
        let nibble = Math.round(rawNeeded / 4096);
        if (nibble > 7) nibble = 7;
        if (nibble < -8) nibble = -8;

        const raw = nibble * 4096;
        const scaled = scale < 0 ? raw << -scale : raw >> scale;
        const sample = predicted + scaled * 64;
        h2s = h1s;
        h1s = sample;

        nibbles[i] = nibble;
        const diff = sample - target;
        err += diff * diff;
      }
      if (best === null || err < best.err) {
        best = { index, scale, nibbles, err };
      }
    }
  }

  // Commit the winning candidate, replaying it to get the exact final history
  // (recomputed rather than cached from the search above, for clarity).
  const [coef1, coef2] = PROC_COEFS[best.index];
  let h1 = hist1In, h2 = hist2In;
  const frame = new Uint8Array(BYTES_PER_FRAME);
  for (let i = 0; i < samples.length; i++) {
    const nibble = best.nibbles[i];
    const raw = nibble * 4096;
    const scaled = best.scale < 0 ? raw << -best.scale : raw >> best.scale;
    const predicted = divTrunc(h1 * coef1 + h2 * coef2 + 32, 64);
    const sample = predicted + scaled * 64;
    h2 = h1;
    h1 = sample;

    const byteIdx = i >> 1;
    const nib4 = nibble & 0xf;
    if (i & 1) frame[byteIdx] = (frame[byteIdx] & 0x0f) | (nib4 << 4);
    else frame[byteIdx] = (frame[byteIdx] & 0xf0) | nib4;
  }
  for (let i = 0; i < BYTES_PER_FRAME - 1; i++) frame[i] ^= 0x80;
  const header = ((best.index & 0xf) << 4) | ((12 - best.scale) & 0xf);
  frame[0x0f] = header ^ 0x80;

  return { frame, hist1: h1, hist2: h2 };
}

/** Encodes a full mono PCM stream (Int16Array) into concatenated 16-byte frames. */
export function encodeChannel(samples) {
  const frameCount = Math.ceil(samples.length / SAMPLES_PER_FRAME);
  const out = new Uint8Array(frameCount * BYTES_PER_FRAME);
  let hist1 = 0, hist2 = 0;
  for (let f = 0; f < frameCount; f++) {
    const start = f * SAMPLES_PER_FRAME;
    const chunk = samples.subarray(start, Math.min(start + SAMPLES_PER_FRAME, samples.length));
    const padded = chunk.length < SAMPLES_PER_FRAME ? (() => {
      const p = new Int16Array(SAMPLES_PER_FRAME);
      p.set(chunk);
      return p;
    })() : chunk;
    const { frame, hist1: h1, hist2: h2 } = encodeFrame(padded, hist1, hist2);
    out.set(frame, f * BYTES_PER_FRAME);
    hist1 = h1; hist2 = h2;
  }
  return out;
}

/** Decodes a full mono ADPCM stream back into Int16Array PCM samples. */
export function decodeChannel(data, sampleCount) {
  const frameCount = Math.ceil(sampleCount / SAMPLES_PER_FRAME);
  const out = new Int16Array(frameCount * SAMPLES_PER_FRAME);
  let hist1 = 0, hist2 = 0;
  for (let f = 0; f < frameCount; f++) {
    const frame = data.subarray(f * BYTES_PER_FRAME, (f + 1) * BYTES_PER_FRAME);
    const { out: samples, hist1: h1, hist2: h2 } = decodeFrame(frame, hist1, hist2);
    out.set(samples, f * SAMPLES_PER_FRAME);
    hist1 = h1; hist2 = h2;
  }
  return out.subarray(0, sampleCount);
}

export const SADL = { BYTES_PER_FRAME, SAMPLES_PER_FRAME };
