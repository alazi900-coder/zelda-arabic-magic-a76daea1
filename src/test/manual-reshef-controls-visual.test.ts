import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReshefRom, extractReshefEntries } from "@/lib/yugioh/reshef-editor-bridge";

const ROM = "/home/ubuntu/upload/Yu-Gi-Oh!-ReshefofDestruction(USA).gba";
const OUTPUT = "/home/ubuntu/reshef_controls_visual_test.gba";

/**
 * Visual-only diagnostic ROM. It keeps the original '%' control for the builder,
 * then replaces this known Joey row with short ASCII markers so #0 and #1 can be
 * observed directly without changing the line's allocated ROM capacity.
 */
describe("manual visual Reshef #0/#1 controls", () => {
  it.skipIf(!existsSync(ROM))("writes a Joey control-marker ROM", () => {
    const source = new Uint8Array(readFileSync(ROM));
    const row = extractReshefEntries(source).find((entry) => entry.original.includes("Man% dat Yugi!"));
    expect(row, "تعذر تحديد سجل Joey المرجعي.").toBeDefined();

    const seed = row!.original.replace("Man% dat Yugi!", "A% B");
    const result = buildReshefRom(source, { [`ygo_reshef_dialogue:${row!.index}`]: seed });
    if ("error" in result) throw new Error(result.error);

    const rom = result.rom;
    const marker = Uint8Array.of(0x41, 0x23, 0x30, 0x42, 0x23, 0x31, 0x43, 0x25, 0x24, 0x31);
    expect(marker.length).toBeLessThanOrEqual(row!.maxBytes + 2);
    rom.fill(0, row!.index, row!.index + row!.maxBytes);
    rom.set(marker, row!.index);
    writeFileSync(OUTPUT, rom);
  });
});
