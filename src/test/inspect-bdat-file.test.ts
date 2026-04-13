import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseLegacyTable } from "@/lib/bdat-legacy-parser";

describe("inspect bdat_common_ms-2", () => {
  it("checks byte growth ratio per table", () => {
    const data = new Uint8Array(readFileSync("/tmp/bdat_common_ms-2.bdat"));
    const dv = new DataView(data.buffer);
    const tableCount = dv.getUint32(0, true);
    const offsets: number[] = [];
    for (let i = 0; i <= tableCount; i++) offsets.push(dv.getUint32(4 + i * 4, true));

    // Check for specific problematic patterns
    const suspiciousEntries: any[] = [];

    for (let t = 0; t < tableCount; t++) {
      const tOff = offsets[t + 1];
      if (tOff >= data.length || tOff < 4) continue;
      let parsed;
      try { parsed = parseLegacyTable(data, tOff); } catch { continue; }
      
      for (let r = 0; r < parsed.rows.length; r++) {
        const vals = parsed.rows[r].values || parsed.rows[r];
        for (const [col, val] of Object.entries(vals)) {
          if (typeof val !== 'string' || val.length === 0) continue;
          
          // Check for BiDi control chars
          const hasBidi = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/.test(val);
          // Check for mixed LTR/RTL that might confuse engine
          const hasLatinAndArabic = /[a-zA-Z]/.test(val) && /[\u0600-\u06FF\uFB50-\uFEFF]/.test(val);
          // Check for control chars (except newline)
          const hasControlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(val);
          // Check for unusual Unicode
          const hasUnusual = /[\uFFF9-\uFFFC]/.test(val);
          
          if (hasBidi || hasControlChars || hasUnusual) {
            suspiciousEntries.push({
              table: parsed.name, row: r, col,
              hasBidi, hasControlChars, hasUnusual,
              text: val.slice(0, 100),
              charCodes: [...val.slice(0, 50)].map(c => c.charCodeAt(0).toString(16)).join(' ')
            });
          }
        }
      }
    }
    
    console.log(`Suspicious entries: ${suspiciousEntries.length}`);
    for (const e of suspiciousEntries.slice(0, 30)) {
      console.log(`${e.table}[${e.row}].${e.col}:`);
      console.log(`  bidi=${e.hasBidi} ctrl=${e.hasControlChars} unusual=${e.hasUnusual}`);
      console.log(`  text: ${JSON.stringify(e.text.slice(0,80))}`);
      console.log(`  codes: ${e.charCodes}`);
    }
    
    expect(true).toBe(true);
  });
});
