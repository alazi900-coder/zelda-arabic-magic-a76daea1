import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseLegacyTable } from "@/lib/bdat-legacy-parser";

describe("inspect bdat_common_ms-2", () => {
  it("parses tables and finds issues", () => {
    const data = new Uint8Array(readFileSync("/tmp/bdat_common_ms-2.bdat"));
    const dv = new DataView(data.buffer);
    const tableCount = dv.getUint32(0, true);
    
    const offsets: number[] = [];
    for (let i = 0; i <= tableCount; i++) {
      offsets.push(dv.getUint32(4 + i * 4, true));
    }
    
    console.log(`Tables: ${tableCount}`);
    
    let totalArabic = 0;
    const issues: string[] = [];
    
    for (let t = 0; t < Math.min(tableCount, 10); t++) {
      const tOff = offsets[t + 1];
      const parsed = parseLegacyTable(data, tOff);
      console.log(`Table ${t}: "${parsed.name}" rows=${parsed.rows.length} cols=${parsed.columns.length}`);
      
      for (let r = 0; r < parsed.rows.length; r++) {
        const row = parsed.rows[r];
        for (const [col, val] of Object.entries(row)) {
          if (typeof val !== 'string') continue;
          if (/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(val)) {
            totalArabic++;
            const bytes = new TextEncoder().encode(val).length;
            if (val.includes('\x00') || val.includes('\uFFFD') || bytes > 500) {
              issues.push(`[${parsed.name}] r${r} ${col} (${bytes}b): ${val.slice(0,100)}`);
            }
          }
        }
      }
    }
    
    console.log(`\nArabic strings (first 10 tables): ${totalArabic}`);
    console.log(`Issues: ${issues.length}`);
    for (const i of issues.slice(0, 20)) console.log(i);
    
    expect(tableCount).toBeGreaterThan(0);
  });
});
