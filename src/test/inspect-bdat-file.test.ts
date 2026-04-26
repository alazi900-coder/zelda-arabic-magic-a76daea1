import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { parseLegacyTable } from "@/lib/bdat-legacy-parser";

const FIXTURE = "/tmp/bdat_common_ms-2.bdat";

describe("inspect bdat_common_ms-2", () => {
  it.skipIf(!existsSync(FIXTURE))("dumps MNU_style_standard_ms fully", () => {
    const data = new Uint8Array(readFileSync(FIXTURE));
    const dv = new DataView(data.buffer);
    const tableCount = dv.getUint32(0, true);
    const offsets: number[] = [];
    for (let i = 0; i <= tableCount; i++) offsets.push(dv.getUint32(4 + i * 4, true));

    for (let t = 0; t < tableCount; t++) {
      const tOff = offsets[t + 1];
      if (tOff >= data.length || tOff < 4) continue;
      let parsed;
      const nextOffset = offsets[t + 2] ?? data.length;
      const maxExtent = nextOffset > tOff ? nextOffset - tOff : undefined;
      try { parsed = parseLegacyTable(data, tOff, t, maxExtent); } catch { continue; }
      if (!parsed) continue;
      
      if (parsed.name === 'MNU_style_standard_ms') {
        console.log(`MNU_style_standard_ms: ${parsed.rows.length} rows`);
        for (let r = 0; r < parsed.rows.length; r++) {
          const vals = parsed.rows[r].values || parsed.rows[r];
          for (const [col, val] of Object.entries(vals)) {
            if (typeof val === 'string') {
              const bytes = new TextEncoder().encode(val).length;
              // Show char codes for non-ASCII
              const codes = [...val.slice(0, 30)].map(c => {
                const cp = c.codePointAt(0)!;
                return cp > 127 ? `U+${cp.toString(16).toUpperCase()}` : c;
              }).join('');
              console.log(`  [${r}] style=${(vals as any).style} (${bytes}b): ${JSON.stringify(val.slice(0, 80))} | ${codes}`);
            }
          }
        }
      }
      
      // Also check BTL_enelist_ms which is the largest table (1226 rows)
      if (parsed.name === 'BTL_enelist_ms') {
        console.log(`\nBTL_enelist_ms: ${parsed.rows.length} rows - sampling...`);
        // Check if any entry has unusual chars
        let arabicCount = 0;
        for (let r = 0; r < parsed.rows.length; r++) {
          const vals = parsed.rows[r].values || parsed.rows[r];
          for (const [col, val] of Object.entries(vals)) {
            if (typeof val === 'string' && /[\u0600-\u06FF\uFB50-\uFEFF]/.test(val)) arabicCount++;
          }
        }
        console.log(`  Arabic entries: ${arabicCount}/${parsed.rows.length}`);
      }
    }
    
    expect(true).toBe(true);
  });
});
