import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReshefRom, extractReshefEntries } from "@/lib/yugioh/reshef-editor-bridge";

const ROM = "/home/ubuntu/upload/Yu-Gi-Oh!-ReshefofDestruction(USA).gba";
const OUTPUT = "/home/ubuntu/reshef_one_byte_visual_test.gba";
describe("manual visual one-byte Reshef ROM", () => {
  it.skipIf(!existsSync(ROM))("writes Joey dialogue with one-byte Arabic glyph codes", () => {
    const source = new Uint8Array(readFileSync(ROM));
    const visibleJoeyLine = extractReshefEntries(source).find((entry) =>
      entry.original.includes("Man% dat Yugi!"),
    );
    expect(visibleJoeyLine, "تعذر تحديد سجل Joey الظاهر في مشهد الحفظ.").toBeDefined();
    console.log("JOEY_VISIBLE_ROW", JSON.stringify({
      index: visibleJoeyLine!.index,
      capacity: visibleJoeyLine!.maxBytes,
      original: visibleJoeyLine!.original,
    }));
    const visibleJoeyArabic = visibleJoeyLine!.original.replace(
      "Man% dat Yugi!",
      "نص% عربي",
    );

    const result = buildReshefRom(source, {
      [`ygo_reshef_dialogue:${visibleJoeyLine!.index}`]: visibleJoeyArabic,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.rom.slice(visibleJoeyLine!.index, visibleJoeyLine!.index + 18)).not.toContain(0x81);
    writeFileSync(OUTPUT, result.rom);
  });
});
