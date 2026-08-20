import { cbc } from "@noble/ciphers/aes.js";
import { describe, expect, it } from "vitest";
import { decryptKHBbsPgdBytes, inspectKHBbsPgdHeader } from "../khbbs-pgd";

const ZERO = new Uint8Array(16);
const DNAS_KEY = Uint8Array.from([0xed, 0xe2, 0x5d, 0x2d, 0xbb, 0xf8, 0x12, 0xe5, 0x3c, 0x5c, 0x59, 0x32, 0xfa, 0xe3, 0xe2, 0x43]);
const MAC_XOR = Uint8Array.from([0xe3, 0x50, 0xed, 0x1d, 0x91, 0x0a, 0x1f, 0xd0, 0x29, 0xbb, 0x1c, 0x3e, 0xf3, 0x40, 0x77, 0xfb]);
const CIPHER_XOR_A = Uint8Array.from([0x13, 0x5f, 0xa4, 0x7c, 0xab, 0x39, 0x5b, 0xa4, 0x76, 0xb8, 0xcc, 0xa9, 0x8f, 0x3a, 0x04, 0x45]);
const CIPHER_XOR_B = Uint8Array.from([0x67, 0x8d, 0x7f, 0xa3, 0x2a, 0x9c, 0xa0, 0xd1, 0x50, 0x8a, 0xd8, 0x38, 0x5e, 0x4b, 0x01, 0x7e]);
const KEYS: Record<number, Uint8Array> = {
  0x38: Uint8Array.from([0x12, 0x46, 0x8d, 0x7e, 0x1c, 0x42, 0x20, 0x9b, 0xba, 0x54, 0x26, 0x83, 0x5e, 0xb0, 0x33, 0x03]),
  0x39: Uint8Array.from([0xc4, 0x3b, 0xb6, 0xd6, 0x53, 0xee, 0x67, 0x49, 0x3e, 0xa9, 0x5f, 0xbc, 0x0c, 0xed, 0x6f, 0x8a]),
  0x63: Uint8Array.from([0x9c, 0x9b, 0x13, 0x72, 0xf8, 0xc6, 0x40, 0xcf, 0x1c, 0x62, 0xf5, 0xd5, 0x92, 0xdd, 0xb5, 0x82]),
};

function xor(bytes: Uint8Array, key: Uint8Array) {
  for (let index = 0; index < bytes.length; index += 1) bytes[index] ^= key[index % key.length];
  return bytes;
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value;
  bytes[offset + 1] = value >>> 8;
  bytes[offset + 2] = value >>> 16;
  bytes[offset + 3] = value >>> 24;
}

function kirkEncrypt(bytes: Uint8Array, type: number) {
  return cbc(KEYS[type], ZERO, { disablePadding: true }).encrypt(bytes);
}

function kirkDecrypt(bytes: Uint8Array, type: number) {
  return cbc(KEYS[type], ZERO, { disablePadding: true }).decrypt(bytes);
}

function shift(bytes: Uint8Array) {
  const result = new Uint8Array(16);
  const reduced = bytes[0] & 0x80 ? 0x87 : 0;
  for (let index = 0; index < 15; index += 1) result[index] = ((bytes[index] << 1) | (bytes[index + 1] >>> 7)) & 0xff;
  result[15] = ((bytes[15] << 1) ^ reduced) & 0xff;
  return result;
}

function bbMac(input: Uint8Array, versionKey: Uint8Array) {
  let chain = new Uint8Array(16);
  let tail = input.slice();
  if (tail.length > 16) {
    const tailLength = tail.length % 16 || 16;
    const encryptedSize = tail.length - tailLength;
    const first = tail.slice(0, encryptedSize);
    xor(first.subarray(0, 16), chain);
    const encrypted = kirkEncrypt(first, 0x38);
    chain = encrypted.slice(-16);
    tail = tail.slice(encryptedSize);
  }
  let subkey = shift(kirkEncrypt(new Uint8Array(16), 0x38));
  const finalBlock = new Uint8Array(16);
  finalBlock.set(tail);
  if (tail.length < 16) {
    subkey = shift(subkey);
    finalBlock[tail.length] = 0x80;
  }
  xor(finalBlock, subkey);
  xor(finalBlock, chain);
  const result = kirkEncrypt(finalBlock, 0x38);
  xor(result, MAC_XOR);
  xor(result, versionKey);
  return kirkEncrypt(result, 0x38);
}

function applyBbsCipher(bytes: Uint8Array, headerKey: Uint8Array, versionKey: Uint8Array) {
  let key = xor(headerKey.slice(), versionKey);
  let seed = 1;
  for (let offset = 0; offset < bytes.length; offset += 0x800) {
    const size = Math.min(0x800, bytes.length - offset);
    const material = xor(key.slice(), CIPHER_XOR_B);
    const prefix = xor(kirkDecrypt(material, 0x39), CIPHER_XOR_A);
    const first = seed === 1 ? new Uint8Array(16) : prefix.slice();
    if (seed !== 1) writeU32(first, 12, seed - 1);
    const counters = new Uint8Array(size);
    for (let block = 0; block < size; block += 16) {
      counters.set(prefix.subarray(0, 12), block);
      writeU32(counters, block + 12, seed++);
    }
    key = counters.slice(-16);
    const stream = kirkDecrypt(counters, 0x63);
    xor(stream.subarray(0, 16), first);
    for (let index = 0; index < size; index += 1) bytes[offset + index] ^= stream[index];
  }
}

function buildPgd(payload: Uint8Array, prefixBytes = 0) {
  const aligned = Math.ceil(payload.length / 16) * 16;
  const dataOffset = 0x90;
  const tableOffset = dataOffset + aligned;
  const blockSize = 0x10;
  const blockCount = Math.ceil(aligned / blockSize);
  const pgd = new Uint8Array(tableOffset + blockCount * 16);
  const versionKey = Uint8Array.from([0x10, 0x22, 0x34, 0x46, 0x58, 0x6a, 0x7c, 0x8e, 0x90, 0xa2, 0xb4, 0xc6, 0xd8, 0xea, 0xfc, 0x0d]);

  writeU32(pgd, 0, 0x44475000);
  writeU32(pgd, 4, 1);
  writeU32(pgd, 8, 1);
  pgd.set(Uint8Array.from([0x40, 0x02, 0x18, 0x67, 0x11, 0x9a, 0xcc, 0x38, 0x4b, 0xe0, 0x52, 0x6d, 0x77, 0x03, 0x94, 0xb1]), 0x10);
  pgd.set(Uint8Array.from([0x83, 0x6f, 0x21, 0x55, 0x18, 0x02, 0x72, 0xa5, 0xd3, 0xb9, 0x0e, 0x44, 0x69, 0xcd, 0x90, 0x12]), 0x30);
  writeU32(pgd, 0x44, payload.length);
  writeU32(pgd, 0x48, blockSize);
  writeU32(pgd, 0x4c, dataOffset);
  pgd.set(payload, dataOffset);

  applyBbsCipher(pgd.subarray(dataOffset, dataOffset + aligned), pgd.subarray(0x30, 0x40), versionKey);
  for (let block = 0; block < blockCount; block += 1) {
    const start = dataOffset + block * blockSize;
    pgd.set(bbMac(pgd.subarray(start, start + blockSize), versionKey), tableOffset + block * 16);
  }
  pgd.set(bbMac(pgd.subarray(tableOffset, tableOffset + blockCount * 16), versionKey), 0x60);
  applyBbsCipher(pgd.subarray(0x30, 0x60), pgd.subarray(0x10, 0x20), versionKey);
  pgd.set(bbMac(pgd.subarray(0, 0x70), versionKey), 0x70);
  pgd.set(bbMac(pgd.subarray(0, 0x80), DNAS_KEY), 0x80);

  const output = new Uint8Array(prefixBytes + pgd.length);
  output.set(pgd, prefixBytes);
  return output;
}

describe("decryptKHBbsPgdBytes", () => {
  const original = Uint8Array.from({ length: 29 }, (_, index) => 0x41 + index);

  it("يفك حاوية DNAS/PGD كاملة من دون لمس طول البيانات الحقيقي", () => {
    expect(decryptKHBbsPgdBytes(buildPgd(original)).data).toEqual(original);
  });

  it("يدعم PGD بعد مقدمة 0x90 كما في مسار DNAS", () => {
    expect(decryptKHBbsPgdBytes(buildPgd(original, 0x90)).data).toEqual(original);
  });

  it("يرفض حاوية تغير جدول تحققها قبل إنتاج DAT", () => {
    const damaged = buildPgd(original);
    damaged[damaged.length - 1] ^= 0xff;
    expect(() => decryptKHBbsPgdBytes(damaged)).toThrow("فشل تحقق جدول PGD");
  });

  it("يرفض DAT المفكوك أو أي ملف لا يحمل توقيع PGD", () => {
    expect(() => decryptKHBbsPgdBytes(original)).toThrow("ليس PGD/DNAS مشفراً");
  });
});

describe("inspectKHBbsPgdHeader", () => {
  it("يعرض موقع PGD عند بداية الملف", () => {
    const inspection = inspectKHBbsPgdHeader(buildPgd(new Uint8Array(16)));
    expect(inspection.pgdOffset).toBe(0);
    expect(inspection.startSignature).toBe("00 50 47 44");
    expect(inspection.bytesRead).toBe(0xb0);
  });

  it("يعرض موقع PGD بعد مقدمة DNAS ولا يرفع الملف أو يفكّه", () => {
    const inspection = inspectKHBbsPgdHeader(buildPgd(new Uint8Array(16), 0x90));
    expect(inspection.pgdOffset).toBe(0x90);
    expect(inspection.offset90Signature).toBe("00 50 47 44");
  });

  it("يبقي حالة الملفات ذات الترويسة المختلفة غير محسومة", () => {
    const inspection = inspectKHBbsPgdHeader(Uint8Array.from([0x42, 0x42, 0x53, 0x41]));
    expect(inspection.pgdOffset).toBeNull();
    expect(inspection.startSignature).toBe("42 42 53 41");
  });
});
