import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseLegacyTable } from "@/lib/bdat-legacy-parser";

describe("inspect bdat_common_ms-2", () => {
  it("scans all tables for problems", () => {
    const data = new Uint8Array(readFileSync("/tmp/bdat_common_ms-2.bdat"));
    const dv = new DataView(data.buffer);
    const tableCount = dv.getUint32(0, true);
    const offsets: number[] = [];
    for (let i = 0; i <= tableCount; i++) offsets.push(dv.getUint32(4 + i * 4, true));

    let totalArabic = 0;
    const issues: any[] = [];

    for (let t = 0; t < tableCount; t++) {
      const tOff = offsets[t + 1];
      if (tOff >= data.length || tOff < 4) continue;
      let parsed;
      try { parsed = parseLegacyTable(data, tOff); } catch { continue; }
      
      for (let r = 0; r < parsed.rows.length; r++) {
        const vals = parsed.rows[r].values || parsed.rows[r];
        for (const [col, val] of Object.entries(vals)) {
          if (typeof val !== 'string' || val.length === 0) continue;
          
          const hasArabic = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(val);
          if (hasArabic) totalArabic++;
          
          const hasNull = val.includes('\x00');
          const hasReplacement = val.includes('\uFFFD');
          const bytes = new TextEncoder().encode(val).length;
          // Presentation Forms (already shaped Arabic)
          const hasPresentationForms = /[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(val);
          
          if (hasNull || hasReplacement) {
            issues.push({ type: 'CORRUPT', table: parsed.name, row: r, col, bytes, text: val.slice(0,120) });
          }
          // Check for very long strings that might overflow
          if (hasArabic && bytes > 400) {
            issues.push({ type: 'LONG', table: parsed.name, row: r, col, bytes, text: val.slice(0,120) });
          }
          // Check for broken newlines (more than 3)
          if (hasArabic && (val.match(/\n/g) || []).length > 3) {
            issues.push({ type: 'TOO_MANY_LINES', table: parsed.name, row: r, col, lines: (val.match(/\n/g)||[]).length, text: val.slice(0,120) });
          }
        }
      }
    }
    
    console.log(`Total Arabic strings: ${totalArabic}`);
    console.log(`Issues found: ${issues.length}`);
    
    // Group by type
    const byType: Record<string, number> = {};
    for (const i of issues) byType[i.type] = (byType[i.type] || 0) + 1;
    console.log('By type:', byType);
    
    // Show CORRUPT first
    const corrupt = issues.filter(i => i.type === 'CORRUPT');
    console.log(`\n=== CORRUPT (${corrupt.length}) ===`);
    for (const c of corrupt.slice(0, 20)) {
      console.log(`${c.table}[${c.row}].${c.col}: ${JSON.stringify(c.text)}`);
    }
    
    // Show LONG
    const long = issues.filter(i => i.type === 'LONG');
    console.log(`\n=== VERY LONG (${long.length}) ===`);
    for (const l of long.slice(0, 20)) {
      console.log(`${l.table}[${l.row}].${l.col} (${l.bytes}b): ${JSON.stringify(l.text.slice(0,80))}`);
    }
    
    // Show TOO_MANY_LINES
    const lines = issues.filter(i => i.type === 'TOO_MANY_LINES');
    console.log(`\n=== TOO MANY LINES (${lines.length}) ===`);
    for (const l of lines.slice(0, 20)) {
      console.log(`${l.table}[${l.row}].${l.col} (${l.lines} lines): ${JSON.stringify(l.text.slice(0,80))}`);
    }
    
    expect(totalArabic).toBeGreaterThan(0);
  });
});
