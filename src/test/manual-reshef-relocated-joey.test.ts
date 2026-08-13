import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReshefRom, extractReshefEntries } from "@/lib/yugioh/reshef-editor-bridge";

const ROM = "/home/ubuntu/upload/Yu-Gi-Oh!-ReshefofDestruction(USA).gba";
const OUTPUT = "/home/ubuntu/reshef_relocated_joey_visual_test.gba";

/**
 * Real-ROM regression: use an extracted row whose 32-bit pointer is proven.
 * The Joey row remains intentionally excluded here: it reaches its text via an
 * indirect table and must keep its original allocation until that table is traced.
 */
describe("manual Reshef text-bank relocation ROM", () => {
  it.skipIf(!existsSync(ROM))("relocates a long Arabic direct-pointer row to the safe text bank", () => {
    const source = new Uint8Array(readFileSync(ROM));
    const entry = extractReshefEntries(source).find((row) => row.maxBytes === 4094 && !/[#%{]/.test(row.original));
    expect(entry, "تعذر تحديد سجل Reshef ذي مؤشر مباشر.").toBeDefined();

    const longArabic = "نص عربي طويل ".repeat(42).trim();
    const translation = `${entry!.original} ${longArabic}`;
    const result = buildReshefRom(source, { [`ygo_reshef_dialogue:${entry!.index}`]: translation });
    if ("error" in result) throw new Error(result.error);

    expect(result.relocatedLines).toBe(1);
    expect(result.textBankBytesUsed).toBeGreaterThan(entry!.original.length);
    writeFileSync(OUTPUT, result.rom);
  });
});
