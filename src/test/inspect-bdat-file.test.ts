import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseLegacyTable } from "@/lib/bdat-legacy-parser";

describe("inspect bdat_common_ms-2", () => {
  it("dumps all string content", () => {
    const data = new Uint8Array(readFileSync("/tmp/bdat_common_ms-2.bdat"));
    const dv = new DataView(data.buffer);
    const tableCount = dv.getUint32(0, true);
    const offsets: number[] = [];
    for (let i = 0; i <= tableCount; i++) offsets.push(dv.getUint32(4 + i * 4, true));

    // Check a few tables - dump actual string values
    for (let t = 0; t < Math.min(tableCount, 102); t++) {
      const tOff = offsets[t + 1];
      const parsed = parseLegacyTable(data, tOff);
      
      for (let r = 0; r < Math.min(parsed.rows.length, 5); r++) {
        const row = parsed.rows[r];
        for (const [col, val] of Object.entries(row)) {
          if (typeof val === 'string' && val.length > 0) {
            // Check for non-ASCII
            if (/[^\x00-\x7F]/.test(val)) {
              console.log(`${parsed.name}[${r}].${col} = "${val.slice(0,100)}"`);
            }
          }
        }
      }
    }
    
    expect(true).toBe(true);
  });
});
