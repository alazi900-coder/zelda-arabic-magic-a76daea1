import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseLegacyTable } from "@/lib/bdat-legacy-parser";

describe("inspect bdat_common_ms-2", () => {
  it("analyzes string pool sizes and longest entries", () => {
    const data = new Uint8Array(readFileSync("/tmp/bdat_common_ms-2.bdat"));
    const dv = new DataView(data.buffer);
    const tableCount = dv.getUint32(0, true);
    const offsets: number[] = [];
    for (let i = 0; i <= tableCount; i++) offsets.push(dv.getUint32(4 + i * 4, true));

    // Find largest tables and longest strings
    const tableStats: any[] = [];
    const allStrings: any[] = [];

    for (let t = 0; t < tableCount; t++) {
      const tOff = offsets[t + 1];
      if (tOff >= data.length || tOff < 4) continue;
      let parsed;
      try { parsed = parseLegacyTable(data, tOff); } catch { continue; }
      
      let totalBytes = 0;
      let maxBytes = 0;
      let maxRow = -1;
      let strings = 0;
      
      for (let r = 0; r < parsed.rows.length; r++) {
        const vals = parsed.rows[r].values || parsed.rows[r];
        for (const [col, val] of Object.entries(vals)) {
          if (typeof val !== 'string') continue;
          strings++;
          const b = new TextEncoder().encode(val).length;
          totalBytes += b;
          if (b > maxBytes) { maxBytes = b; maxRow = r; }
          if (b > 200) {
            allStrings.push({ table: parsed.name, row: r, col, bytes: b, text: val.slice(0, 120) });
          }
        }
      }
      
      tableStats.push({ name: parsed.name, rows: parsed.rows.length, strings, totalBytes, maxBytes, maxRow });
    }
    
    // Sort by totalBytes descending
    tableStats.sort((a, b) => b.totalBytes - a.totalBytes);
    console.log('=== Top 15 tables by total string bytes ===');
    for (const t of tableStats.slice(0, 15)) {
      console.log(`${t.name}: ${t.rows} rows, ${t.strings} strings, ${t.totalBytes}b total, max=${t.maxBytes}b (row ${t.maxRow})`);
    }
    
    // Sort allStrings by bytes
    allStrings.sort((a, b) => b.bytes - a.bytes);
    console.log('\n=== Top 20 longest strings ===');
    for (const s of allStrings.slice(0, 20)) {
      console.log(`${s.table}[${s.row}].${s.col} (${s.bytes}b): ${s.text.slice(0, 80)}`);
    }
    
    // Count newlines in top entries
    console.log('\n=== Entries with most newlines ===');
    const byNewlines: any[] = [];
    for (let t = 0; t < tableCount; t++) {
      const tOff = offsets[t + 1];
      if (tOff >= data.length || tOff < 4) continue;
      let parsed;
      try { parsed = parseLegacyTable(data, tOff); } catch { continue; }
      for (let r = 0; r < parsed.rows.length; r++) {
        const vals = parsed.rows[r].values || parsed.rows[r];
        for (const [col, val] of Object.entries(vals)) {
          if (typeof val !== 'string') continue;
          const nl = (val.match(/\n/g) || []).length;
          if (nl >= 3) byNewlines.push({ table: parsed.name, row: r, nl, text: val.slice(0, 80) });
        }
      }
    }
    byNewlines.sort((a, b) => b.nl - a.nl);
    for (const n of byNewlines.slice(0, 15)) {
      console.log(`${n.table}[${n.row}] (${n.nl} newlines): ${JSON.stringify(n.text.slice(0,60))}`);
    }
    
    expect(true).toBe(true);
  });
});
