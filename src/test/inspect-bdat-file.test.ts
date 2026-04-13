import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseLegacyTable } from "@/lib/bdat-legacy-parser";

describe("inspect bdat_common_ms-2", () => {
  it("dumps column info and raw row data", () => {
    const data = new Uint8Array(readFileSync("/tmp/bdat_common_ms-2.bdat"));
    const dv = new DataView(data.buffer);
    const tableCount = dv.getUint32(0, true);
    const offsets: number[] = [];
    for (let i = 0; i <= tableCount; i++) offsets.push(dv.getUint32(4 + i * 4, true));

    // Just inspect first 3 tables
    for (let t = 0; t < 3; t++) {
      const tOff = offsets[t + 1];
      if (tOff >= data.length) continue;
      let parsed;
      try { parsed = parseLegacyTable(data, tOff); } catch(e) { console.log(`Table ${t} error:`, e); continue; }
      
      console.log(`\nTable ${t}: "${parsed.name}" rows=${parsed.rows.length}`);
      for (const col of parsed.columns) {
        console.log(`  Col: "${col.name}" type=${col.type}`);
      }
      // Print first 2 rows
      for (let r = 0; r < Math.min(2, parsed.rows.length); r++) {
        console.log(`  Row ${r}:`, JSON.stringify(parsed.rows[r]).slice(0, 200));
      }
    }
    
    expect(true).toBe(true);
  });
});
