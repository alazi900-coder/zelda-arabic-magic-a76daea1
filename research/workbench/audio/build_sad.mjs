import { readFileSync, writeFileSync } from "node:fs";
import { encodeChannel, decodeChannel, SADL } from "./procyon_codec.mjs";

const pcmPath = process.argv[2] ?? "song.pcm";
const origSadPath = process.argv[3] ?? "op00.SAD.orig";
const outPath = process.argv[4] ?? "op00.SAD.new";

const pcm = readFileSync(pcmPath);
const totalSamples = pcm.length / 4; // 2 bytes * 2 channels
const left = new Int16Array(totalSamples);
const right = new Int16Array(totalSamples);
for (let i = 0; i < totalSamples; i++) {
  left[i] = pcm.readInt16LE(i * 4);
  right[i] = pcm.readInt16LE(i * 4 + 2);
}
console.log("total samples/channel:", totalSamples, "=", (totalSamples / 32728).toFixed(2), "sec");

console.time("encode");
const encL = encodeChannel(left);
const encR = encodeChannel(right);
console.timeEnd("encode");
console.log("encoded bytes/channel:", encL.length, encR.length);

// Block-interleave: 16 bytes of L, 16 bytes of R, repeat (layout_interleave, block 0x10).
const frameCount = encL.length / SADL.BYTES_PER_FRAME;
const interleaved = new Uint8Array(encL.length + encR.length);
for (let f = 0; f < frameCount; f++) {
  interleaved.set(encL.subarray(f * 16, f * 16 + 16), f * 32);
  interleaved.set(encR.subarray(f * 16, f * 16 + 16), f * 32 + 16);
}

// Build the new file: copy the original's header (first 0x100 bytes = start_offset),
// patch only the data-size field, then append the new interleaved data.
const origSad = readFileSync(origSadPath);
const header = Buffer.from(origSad.subarray(0, 0x100));
header.writeUInt32LE(interleaved.length, 0x40); // data size field
const out = Buffer.concat([header, Buffer.from(interleaved)]);
writeFileSync(outPath, out);
console.log("wrote", outPath, out.length, "bytes (original was", origSad.length, ")");

// Round-trip sanity check: decode the interleaved data back and compare to the source PCM.
const deL = new Uint8Array(encL.length);
const deR = new Uint8Array(encR.length);
for (let f = 0; f < frameCount; f++) {
  deL.set(interleaved.subarray(f * 32, f * 32 + 16), f * 16);
  deR.set(interleaved.subarray(f * 32 + 16, f * 32 + 32), f * 16);
}
const decL = decodeChannel(deL, totalSamples);
const decR = decodeChannel(deR, totalSamples);
let sumSq = 0, sumSqSig = 0;
for (let i = 0; i < totalSamples; i++) {
  const eL = left[i] - decL[i], eR = right[i] - decR[i];
  sumSq += eL * eL + eR * eR;
  sumSqSig += left[i] * left[i] + right[i] * right[i];
}
console.log("round-trip SNR(dB):", (10 * Math.log10(sumSqSig / sumSq)).toFixed(1));
