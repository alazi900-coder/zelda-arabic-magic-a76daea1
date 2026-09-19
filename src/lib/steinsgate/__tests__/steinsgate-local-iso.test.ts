// @vitest-environment node
// Optional local fixture: no game data is committed or uploaded.
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { importSteinsGateIso, parseAfs } from '../steinsgate-format';
import { STEINSGATE_TAG_RE, isSteinsGateTranslatable } from '../steinsgate-tags';

const path = process.env.STEINSGATE_TEST_ISO;
describe.skipIf(!path)('local English PSP ISO', () => {
  it('extracts visible text and recognizes every percent command', async () => {
    const fd = openSync(path!, 'r');
    try {
      const file = {
        name: 'SteinsGate.iso', size: statSync(path!).size,
        slice(start: number, end: number) {
          return { async arrayBuffer() {
            const bytes = new Uint8Array(end - start);
            expect(readSync(fd, bytes, 0, bytes.length, start)).toBe(bytes.length);
            return bytes.buffer;
          } };
        },
      } as unknown as File;
      const result = await importSteinsGateIso(file);
      const fonts = new Uint8Array(result.workspace.fontArchive);
      for (const entry of parseAfs(fonts).entries.filter(e => ['DFKKG5W16.FNT','DFKKG3W12.FNT'].includes(e.name))) {
        const view = new DataView(fonts.buffer, fonts.byteOffset + entry.offset, entry.size);
        const start = view.getUint32(16,true), count = view.getUint32(20,true);
        const allocated = new Set<number>();
        for (const pair of Object.values(result.workspace.glyphMap)) {
          expect(pair).toHaveLength(3);
          expect(new TextDecoder('shift-jis').decode(new Uint8Array(pair.slice(0, 2)))).toMatch(/^[\u4e00-\u9fff]$/);
          const id = pair[2];
          expect(id).toBeGreaterThanOrEqual(0);
          expect(id).toBeLessThan(count);
          expect(allocated.has(id)).toBe(false);
          allocated.add(id);
        }
      }
      expect(result.entries.length).toBeGreaterThan(30000);
      expect(result.entries.every(e => isSteinsGateTranslatable(e.msbtFile, e.original))).toBe(true);
      const unknown = result.entries.filter(e => /%[A-Za-z]/.test(e.original.replace(STEINSGATE_TAG_RE, '')));
      expect(unknown.map(e => [e.label, e.original])).toEqual([]);
      console.info(`Local ISO: ${result.scriptFiles} scripts, ${result.entries.length} editable rows, ${result.workspace.records.length - result.entries.length} excluded records`);
    } finally { closeSync(fd); }
  }, 60000);
});
