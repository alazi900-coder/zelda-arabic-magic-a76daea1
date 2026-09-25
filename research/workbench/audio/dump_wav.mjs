import { readFileSync, writeFileSync } from "node:fs";
import { decodeChannel, SADL } from "./procyon_codec.mjs";

const newSad = readFileSync("op00.SAD.new");
const data = newSad.subarray(0x100); // skip header, start_offset was 0x100
const frameCount = data.length / 32;
const encL = new Uint8Array(frameCount * 16);
const encR = new Uint8Array(frameCount * 16);
for (let f = 0; f < frameCount; f++) {
  encL.set(data.subarray(f * 32, f * 32 + 16), f * 16);
  encR.set(data.subarray(f * 32 + 16, f * 32 + 32), f * 16);
}
const totalSamples = frameCount * SADL.SAMPLES_PER_FRAME;
const decL = decodeChannel(encL, totalSamples);
const decR = decodeChannel(encR, totalSamples);

// Write a plain 16-bit PCM stereo WAV.
const sampleRate = 32728;
const dataBytes = totalSamples * 4;
const buf = Buffer.alloc(44 + dataBytes);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sampleRate, 24);
buf.writeUInt32LE(sampleRate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < totalSamples; i++) {
  buf.writeInt16LE(decL[i], 44 + i * 4);
  buf.writeInt16LE(decR[i], 44 + i * 4 + 2);
}
writeFileSync("preview_ingame_audio.wav", buf);
console.log("wrote preview_ingame_audio.wav", buf.length, "bytes,", (totalSamples/sampleRate).toFixed(1), "sec");
