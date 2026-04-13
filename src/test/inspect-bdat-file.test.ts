import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseLegacyTable } from "@/lib/bdat-legacy-parser";

describe("inspect bdat_common_ms-2", () => {
  it("finds arabic and problematic strings", () => {
    const data = new Uint8Array(readFileSync("/tmp/bdat_common_ms-2.bdat"));
    const dv = new DataView(data.buffer);
    const tableCount = dv.getUint32(0, true);
    const offsets: number[] = [];
    for (let i = 0; i <= tableCount; i++) offsets.push(dv.getUint32(4 + i * 4, true));

    let totalStrings = 0, totalArabic = 0;
    const issues: string[] = [];

    for (let t = 0; t < tableCount; t++) {
      const tOff = offsets[t + 1];
      if (tOff >= data.length || tOff < 4) continue;
      
      let parsed;
      try { parsed = parseLegacyTable(data, tOff); } catch { continue; }
      
      for (let r = 0; r < parsed.rows.length; r++) {
        for (const [col, val] of Object.entries(parsed.rows[r])) {
          if (typeof val !== 'string' || val.length === 0) continue;
          totalStrings++;
          
          const hasArabic = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(val);
          if (hasArabic) totalArabic++;
          
          // Check for problems
          const hasNull = val.includes('\x00');
          const hasReplacement = val.includes('\uFFFD');
          const bytes = new TextEncoder().encode(val).length;
          
          if (hasNull || hasReplacement) {
            issues.push(`[CORRUPT] ${parsed.name}[${r}].${col} (${bytes}b): ${JSON.stringify(val.slice(0,80))}`);
          }
          
          // Show first few Arabic entries
          if (hasArabic && totalArabic <= 10) {
            console.log(`ARABIC: ${parsed.name}[${r}].${col} = ${JSON.stringify(val.slice(0,120))}`);
          }
        }
      }
    }
    
    console.log(`\nTotal strings: ${totalStrings}, Arabic: ${totalArabic}`);
    console.log(`Corrupt entries: ${issues.length}`);
    for (const i of issues.slice(0, 30)) console.log(i);
    
    expect(totalStrings).toBeGreaterThan(0);
  });
});
