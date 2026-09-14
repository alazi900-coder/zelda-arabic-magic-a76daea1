import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { ensurePlatTables, encodePlatMessage } from "@/lib/nds/plat-charmap";
import { reshapeArabic } from "@/lib/arabic-processing";

/**
 * Invisible formatting used to cost a translator the whole line.
 *
 * Bidi isolates and tatweel have no slot in any charmap, so the encoder threw
 * and `buildPlatRom` skipped the message — the line stayed English in the ROM
 * with nothing on screen to explain it. One export carried 2,192 of them.
 */
beforeAll(async () => {
  const pub = resolve(__dirname, "../../../public");
  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => ({
    ok: true,
    json: async () => JSON.parse(readFileSync(resolve(pub, url.replace(/^\//, "")), "utf8")),
  });
  await ensurePlatTables();
});

const CLEAN = "مرحبا بك";

describe("formatting a game font has no slot for", () => {
  const cases: [string, string][] = [
    ["left-to-right isolate", "⁦مرحبا⁩ بك"],
    ["first strong isolate", "⁨مرحبا⁩ بك"],
    ["pop directional isolate", "مرحبا⁩ بك"],
    ["right-to-left mark", "‏مرحبا بك"],
    ["tatweel", "مرحـــبا بك"],
    ["zero-width space", "مرحبا​ بك"],
  ];

  for (const [name, text] of cases) {
    it(`encodes a line carrying a ${name}`, () => {
      expect(() => encodePlatMessage(reshapeArabic(text))).not.toThrow();
    });
  }

  it("leaves a line that never had any untouched", () => {
    expect(encodePlatMessage(reshapeArabic(CLEAN)))
      .toEqual(encodePlatMessage(reshapeArabic(CLEAN)));
    expect(reshapeArabic(CLEAN)).toBe(reshapeArabic(CLEAN));
  });

  it("drops only the formatting, never a letter", () => {
    expect(reshapeArabic("مرحـــبا بك")).toBe(reshapeArabic(CLEAN));
    expect(reshapeArabic("⁦مرحبا⁩ بك")).toBe(reshapeArabic(CLEAN));
  });
});
