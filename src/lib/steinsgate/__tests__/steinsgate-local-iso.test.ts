// @vitest-environment node
// Optional local fixture: no game data is committed or uploaded.
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { importSteinsGateIso } from '../steinsgate-format';
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
      const allocated = new Set<string>();
      for (const pair of Object.values(result.workspace.glyphMap)) {
        expect(pair).toHaveLength(2);
        expect(new TextDecoder('shift-jis').decode(new Uint8Array(pair))).toMatch(/^[\u4e00-\u9fff]$/);
        const key = pair.join(':');
        expect(allocated.has(key)).toBe(false);
        allocated.add(key);
      }
      expect(result.entries.length).toBeGreaterThan(30000);
      expect(result.entries.every(e => isSteinsGateTranslatable(e.msbtFile, e.original))).toBe(true);
      const unknown = result.entries.filter(e => /%[A-Za-z]/.test(e.original.replace(STEINSGATE_TAG_RE, '')));
      expect(unknown.map(e => [e.label, e.original])).toEqual([]);
      console.info(`Local ISO: ${result.scriptFiles} scripts, ${result.entries.length} editable rows, ${result.workspace.records.length - result.entries.length} excluded records`);
    } finally { closeSync(fd); }
  }, 60000);
});
