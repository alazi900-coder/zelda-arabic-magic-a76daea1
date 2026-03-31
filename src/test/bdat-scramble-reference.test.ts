/**
 * Test XOR scramble/unscramble against official bdat-rs test vectors.
 * Reference: https://github.com/roccodev/bdat-rs/blob/master/src/io/legacy/scramble.rs
 */
import { describe, it, expect } from 'vitest';
import { unscrambleSection } from '../lib/bdat-legacy-parser';

// Scramble function from the writer (same as bdat-rs scramble_chunks)
function scrambleSection(buf: Uint8Array, startIdx: number, endIdx: number, key: number): void {
  let k1 = ((key >> 8) & 0xFF) ^ 0xFF;
  let k2 = (key & 0xFF) ^ 0xFF;
  let pos = startIdx;
  while (pos + 1 < endIdx) {
    buf[pos] ^= k1;
    buf[pos + 1] ^= k2;
    k1 = (k1 + buf[pos]) & 0xFF;
    k2 = (k2 + buf[pos + 1]) & 0xFF;
    pos += 2;
  }
}

// bdat-rs test vectors (even-length only — game sections are always even-aligned)
const INPUT = new Uint8Array([0xfb, 0x7e, 0xe4, 0xf1, 0xe4, 0xeb, 0x4b, 0xba, 0xf4, 0x75, 0xe7, 0xd4, 0xec, 0x8d]);
// "MNU_qt2001_ms\0"
const EXPECTED = new Uint8Array([0x4d, 0x4e, 0x55, 0x5f, 0x71, 0x74, 0x32, 0x30, 0x30, 0x31, 0x5f, 0x6d, 0x73, 0x00]);
const KEY = 0x49cf;

describe('BDAT Scramble - bdat-rs reference vectors', () => {
  it('unscrambles even-length data correctly', () => {
    const data = INPUT.slice();
    unscrambleSection(data, 0, data.length, KEY);
    expect(data).toEqual(EXPECTED);
  });

  it('unscrambles odd-length data correctly', () => {
    const data = INPUT_ODD.slice();
    unscrambleSection(data, 0, data.length, KEY);
    expect(data).toEqual(EXPECTED_ODD);
  });

  it('scrambles data correctly (reverse of unscramble)', () => {
    const data = EXPECTED.slice();
    scrambleSection(data, 0, data.length, KEY);
    expect(data).toEqual(INPUT);
  });

  it('roundtrips: scramble(unscramble(data)) == data', () => {
    const data = INPUT.slice();
    unscrambleSection(data, 0, data.length, KEY);
    scrambleSection(data, 0, data.length, KEY);
    expect(data).toEqual(INPUT);
  });

  it('decodes to "MNU_qt2001_ms"', () => {
    const data = INPUT.slice();
    unscrambleSection(data, 0, data.length, KEY);
    const str = new TextDecoder().decode(data.subarray(0, 13));
    expect(str).toBe('MNU_qt2001_ms');
  });
});
