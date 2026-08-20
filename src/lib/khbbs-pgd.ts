/**
 * Kingdom Hearts BBS PGD/DNAS decryption.
 *
 * This is a narrow TypeScript port of the public DNAS PGD reader by tpu:
 * it supports the DRM type used by BBS1–BBS3 and rejects every other layout.
 * It never writes to the source DAT; callers receive only a new byte buffer.
 */

import { cbc } from "@noble/ciphers/aes.js";

const PGD_MAGIC = 0x44475000;
const ZERO_BLOCK = new Uint8Array(16);
const DNAS_KEY_1A90 = Uint8Array.from([0xed, 0xe2, 0x5d, 0x2d, 0xbb, 0xf8, 0x12, 0xe5, 0x3c, 0x5c, 0x59, 0x32, 0xfa, 0xe3, 0xe2, 0x43]);
const BBMAC_XOR = Uint8Array.from([0xe3, 0x50, 0xed, 0x1d, 0x91, 0x0a, 0x1f, 0xd0, 0x29, 0xbb, 0x1c, 0x3e, 0xf3, 0x40, 0x77, 0xfb]);
const BBCIPHER_XOR_1 = Uint8Array.from([0x13, 0x5f, 0xa4, 0x7c, 0xab, 0x39, 0x5b, 0xa4, 0x76, 0xb8, 0xcc, 0xa9, 0x8f, 0x3a, 0x04, 0x45]);
const BBCIPHER_XOR_2 = Uint8Array.from([0x67, 0x8d, 0x7f, 0xa3, 0x2a, 0x9c, 0xa0, 0xd1, 0x50, 0x8a, 0xd8, 0x38, 0x5e, 0x4b, 0x01, 0x7e]);

const KIRK_AES_KEYS: Record<number, Uint8Array> = {
  0x38: Uint8Array.from([0x12, 0x46, 0x8d, 0x7e, 0x1c, 0x42, 0x20, 0x9b, 0xba, 0x54, 0x26, 0x83, 0x5e, 0xb0, 0x33, 0x03]),
  0x39: Uint8Array.from([0xc4, 0x3b, 0xb6, 0xd6, 0x53, 0xee, 0x67, 0x49, 0x3e, 0xa9, 0x5f, 0xbc, 0x0c, 0xed, 0x6f, 0x8a]),
  0x63: Uint8Array.from([0x9c, 0x9b, 0x13, 0x72, 0xf8, 0xc6, 0x40, 0xcf, 0x1c, 0x62, 0xf5, 0xd5, 0x92, 0xdd, 0xb5, 0x82]),
};

export interface KHBbsPgdResult {
  data: Uint8Array;
  encryptedBytes: number;
  pgdOffset: number;
  versionKey: Uint8Array;
}

export interface KHBbsPgdFileResult extends KHBbsPgdResult {
  file: File;
}

export interface KHBbsPgdHeaderInspection {
  bytesRead: number;
  pgdOffset: number | null;
  startSignature: string;
  offset90Signature: string | null;
  hex: string;
  ascii: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function readU32LE(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) << 24)) >>> 0;
}

function writeU32LE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function xorInto(target: Uint8Array, mask: Uint8Array) {
  for (let index = 0; index < target.length; index += 1) target[index] ^= mask[index % mask.length];
  return target;
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function ceilToBlock(value: number, blockSize: number) {
  return Math.ceil(value / blockSize) * blockSize;
}

function kirkEncrypt(bytes: Uint8Array, keyType: number) {
  const key = KIRK_AES_KEYS[keyType];
  if (!key || bytes.length === 0 || bytes.length % 16 !== 0) fail("حجم بيانات KIRK غير صالح.");
  return cbc(key, ZERO_BLOCK, { disablePadding: true }).encrypt(bytes);
}

function kirkDecrypt(bytes: Uint8Array, keyType: number) {
  const key = KIRK_AES_KEYS[keyType];
  if (!key || bytes.length === 0 || bytes.length % 16 !== 0) fail("حجم بيانات KIRK غير صالح.");
  return cbc(key, ZERO_BLOCK, { disablePadding: true }).decrypt(bytes);
}

function shiftLeftOne(bytes: Uint8Array) {
  const result = new Uint8Array(16);
  const carry = bytes[0] & 0x80 ? 0x87 : 0;
  for (let index = 0; index < 15; index += 1) result[index] = ((bytes[index] << 1) | (bytes[index + 1] >>> 7)) & 0xff;
  result[15] = ((bytes[15] << 1) ^ carry) & 0xff;
  return result;
}

class BbsMac {
  private chain = new Uint8Array(16);
  private tail = new Uint8Array(0);

  public constructor(private readonly type: 1 | 3) {}

  public update(bytes: Uint8Array) {
    if (bytes.length === 0) return;
    const combined = new Uint8Array(this.tail.length + bytes.length);
    combined.set(this.tail);
    combined.set(bytes, this.tail.length);
    if (combined.length <= 16) {
      this.tail = combined;
      return;
    }

    let tailLength = combined.length % 16;
    if (tailLength === 0) tailLength = 16;
    const encryptLength = combined.length - tailLength;
    const encryptedInput = combined.slice(0, encryptLength);
    xorInto(encryptedInput.subarray(0, 16), this.chain);
    const encrypted = kirkEncrypt(encryptedInput, 0x38);
    this.chain = encrypted.slice(encrypted.length - 16);
    this.tail = combined.slice(encryptLength);
  }

  public final(versionKey: Uint8Array | null) {
    if (this.tail.length > 16) fail("حالة BBMac غير صالحة.");
    let subkey = shiftLeftOne(kirkEncrypt(new Uint8Array(16), 0x38));
    const lastBlock = new Uint8Array(16);
    lastBlock.set(this.tail);
    if (this.tail.length < 16) {
      subkey = shiftLeftOne(subkey);
      lastBlock[this.tail.length] = 0x80;
    }
    xorInto(lastBlock, subkey);
    xorInto(lastBlock, this.chain);
    let result = kirkEncrypt(lastBlock, 0x38);
    xorInto(result, BBMAC_XOR);
    if (versionKey) {
      xorInto(result, versionKey);
      result = kirkEncrypt(result, 0x38);
    }
    return result;
  }

  public final2(expected: Uint8Array, versionKey: Uint8Array) {
    const actual = this.final(versionKey);
    const normalizedExpected = this.type === 3 ? kirkDecrypt(expected, 0x63) : expected;
    return equalBytes(actual, normalizedExpected);
  }

  public getVersionKey(encodedMac: Uint8Array) {
    const plainMac = this.type === 3 ? kirkDecrypt(encodedMac, 0x63) : encodedMac;
    const macWithoutVersionKey = this.final(null);
    const recovered = kirkDecrypt(plainMac, 0x38);
    return xorInto(macWithoutVersionKey, recovered);
  }
}

class BbsCipher {
  private key: Uint8Array;
  private seed = 1;

  public constructor(headerKey: Uint8Array, versionKey: Uint8Array) {
    this.key = headerKey.slice();
    xorInto(this.key, versionKey);
  }

  public apply(bytes: Uint8Array) {
    if (bytes.length % 16 !== 0) fail("بيانات PGD ليست محاذاة على 16 بايت.");
    for (let offset = 0; offset < bytes.length; offset += 0x800) {
      const size = Math.min(0x800, bytes.length - offset);
      const keyMaterial = this.key.slice();
      xorInto(keyMaterial, BBCIPHER_XOR_2);
      const streamPrefix = kirkDecrypt(keyMaterial, 0x39);
      xorInto(streamPrefix, BBCIPHER_XOR_1);

      const firstBlockMask = this.seed === 1 ? new Uint8Array(16) : streamPrefix.slice();
      if (this.seed !== 1) writeU32LE(firstBlockMask, 12, this.seed - 1);

      const generated = new Uint8Array(size);
      for (let blockOffset = 0; blockOffset < size; blockOffset += 16) {
        generated.set(streamPrefix.subarray(0, 12), blockOffset);
        writeU32LE(generated, blockOffset + 12, this.seed);
        this.seed += 1;
      }

      const nextChain = generated.slice(generated.length - 16);
      const stream = kirkDecrypt(generated, 0x63);
      xorInto(stream.subarray(0, 16), firstBlockMask);
      for (let index = 0; index < size; index += 1) bytes[offset + index] ^= stream[index];
      this.key = nextChain;
    }
  }
}

function findPgdOffset(bytes: Uint8Array) {
  if (bytes.length >= 4 && readU32LE(bytes, 0) === PGD_MAGIC) return 0;
  if (bytes.length >= 0x94 && readU32LE(bytes, 0x90) === PGD_MAGIC) return 0x90;
  return -1;
}

function formatHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function formatAscii(bytes: Uint8Array) {
  return [...bytes].map((value) => value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : ".").join("");
}

/** Reads only the supplied header bytes. It never decrypts, uploads, or alters a DAT. */
export function inspectKHBbsPgdHeader(bytes: Uint8Array): KHBbsPgdHeaderInspection {
  const header = bytes.slice(0, 0x100);
  const pgdOffset = findPgdOffset(header);
  return {
    bytesRead: header.length,
    pgdOffset: pgdOffset >= 0 ? pgdOffset : null,
    startSignature: formatHex(header.slice(0, 4)),
    offset90Signature: header.length >= 0x94 ? formatHex(header.slice(0x90, 0x94)) : null,
    hex: formatHex(header),
    ascii: formatAscii(header),
  };
}

export function isKHBbsPgdFile(bytes: Uint8Array) {
  return findPgdOffset(bytes) >= 0;
}

export function decryptKHBbsPgdBytes(source: Uint8Array): KHBbsPgdResult {
  const pgdOffset = findPgdOffset(source);
  if (pgdOffset < 0) fail("هذا الملف ليس PGD/DNAS مشفراً. لا تحتاج ملفات BBS0 المفكوكة إلى فك تشفير.");
  const pgd = source.slice(pgdOffset);
  if (pgd.length < 0x90) fail("ترويسة PGD ناقصة.");

  const keyIndex = readU32LE(pgd, 4);
  const drmType = readU32LE(pgd, 8);
  if (drmType !== 1) fail("نوع DRM في هذا الملف غير مدعوم لمسار BBS.");
  const macType: 1 | 3 = keyIndex > 1 ? 3 : 1;

  const mac80 = new BbsMac(macType);
  mac80.update(pgd.subarray(0, 0x80));
  if (!mac80.final2(pgd.subarray(0x80, 0x90), DNAS_KEY_1A90)) fail("فشل تحقق DNAS: الملف تالف أو ليس DAT من نسخة BBS المدعومة.");

  const mac70 = new BbsMac(macType);
  mac70.update(pgd.subarray(0, 0x70));
  const versionKey = mac70.getVersionKey(pgd.subarray(0x70, 0x80));

  const headerCipher = new BbsCipher(pgd.subarray(0x10, 0x20), versionKey);
  headerCipher.apply(pgd.subarray(0x30, 0x60));

  const dataSize = readU32LE(pgd, 0x44);
  const blockSize = readU32LE(pgd, 0x48);
  const dataOffset = readU32LE(pgd, 0x4c);
  if (dataSize === 0 || blockSize < 16 || blockSize % 16 !== 0 || dataOffset < 0x90 || dataOffset > pgd.length) fail("رأس PGD المفكوك غير صالح.");

  const alignedSize = ceilToBlock(dataSize, 16);
  const blockCount = Math.ceil(alignedSize / blockSize);
  const tableOffset = dataOffset + alignedSize;
  const tableBytes = blockCount * 16;
  if (!Number.isSafeInteger(tableOffset) || tableOffset + tableBytes > pgd.length || dataOffset + alignedSize > pgd.length) fail("حجم بيانات PGD أو جدول التحقق خارج الملف.");

  const tableMac = new BbsMac(macType);
  tableMac.update(pgd.subarray(tableOffset, tableOffset + tableBytes));
  if (!tableMac.final2(pgd.subarray(0x60, 0x70), versionKey)) fail("فشل تحقق جدول PGD: الملف تالف أو المفتاح غير مطابق.");

  const dataCipher = new BbsCipher(pgd.subarray(0x30, 0x40), versionKey);
  dataCipher.apply(pgd.subarray(dataOffset, dataOffset + alignedSize));
  return { data: pgd.slice(dataOffset, dataOffset + dataSize), encryptedBytes: source.length, pgdOffset, versionKey };
}

export async function decryptKHBbsPgdFile(source: File): Promise<KHBbsPgdFileResult> {
  const decrypted = decryptKHBbsPgdBytes(new Uint8Array(await source.arrayBuffer()));
  const outputName = source.name.replace(/\.dat$/i, "") || "BBS";
  return {
    ...decrypted,
    file: new File([decrypted.data], `${outputName}.DAT`, { type: "application/octet-stream" }),
  };
}
