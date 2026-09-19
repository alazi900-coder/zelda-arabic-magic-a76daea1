import { expect, it } from 'vitest';
import { parseSteinsGateScript, rebuildScript, rebuildAfs, parseAfs } from '../steinsgate-format';

it('relocates a low address beyond 64 KiB using the complete pointer field', () => {
  const source = new Uint8Array(26);
  const view = new DataView(source.buffer);
  view.setUint32(0, 16, true);
  view.setUint32(4, 22, true);
  source.set([0x0d, 0x02], 14);
  source.set(new TextEncoder().encode('Hello\0Bye\0'), 16);
  const records = parseSteinsGateScript('SG00_01.BIN', source);
  expect(records.map(r => r.pointerBits)).toEqual([32, 32]);
  // An old session also matched the low half of this unrelated instruction.
  const legacyRecords = records.map(r => ({ ...r, pointerBits: 16 as const,
    pointerOffsets: [...r.pointerOffsets, 8] }));
  view.setUint32(8, 0x12340010, true);
  const legacyResult = rebuildScript(source, legacyRecords, { 'steinsgate/SG00_01.BIN:0': 'Translated' }, {});
  expect(new DataView(legacyResult.buffer).getUint32(8, true)).toBe(0x12340010);
  expect(new TextDecoder().decode(legacyResult.slice(16, 26))).toBe('Translated');
  const result = rebuildScript(source, records, { 'steinsgate/SG00_01.BIN:0': 'A'.repeat(66000) }, {});
  const relocated = new DataView(result.buffer).getUint32(4, true);
  expect(relocated).toBe(66017);
  expect(new TextDecoder().decode(result.slice(relocated))).toBe('Bye\0');
});

it('grows an AFS and updates both copies of its entry size', () => {
  const source = new Uint8Array(6144);
  const view = new DataView(source.buffer);
  source.set([65, 70, 83, 0]);
  view.setUint32(4, 1, true);
  view.setUint32(8, 2048, true);
  view.setUint32(12, 3, true);
  view.setUint32(16, 4096, true);
  view.setUint32(20, 48, true);
  source.set(new TextEncoder().encode('SG00_01.BIN'), 4096);
  const replacement = new Uint8Array(9000).fill(65);
  const result = rebuildAfs(source, new Map([['SG00_01.BIN', replacement]]));
  const parsed = parseAfs(result);
  const entry = parsed.entries[0];
  expect(result.length).toBeGreaterThan(source.length);
  expect(result.slice(entry.offset, entry.offset + entry.size)).toEqual(replacement);
  expect(new DataView(result.buffer).getUint32(parsed.nameTableOffset + 44, true)).toBe(9000);
});
