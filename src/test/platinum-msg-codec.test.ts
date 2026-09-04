import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { decodePlatArchive, encodePlatArchive } from "@/lib/nds/plat-msg";
import {
  ensurePlatTables,
  decodePlatMessage,
  encodePlatMessage,
  PlatEncodeError,
} from "@/lib/nds/plat-charmap";
import { measurePlatChars } from "@/lib/nds/plat-editor-bridge";

/**
 * The message archives are encrypted, and a translated ROM is only as good as
 * the guarantee that everything not translated comes back byte-for-byte. These
 * cover that guarantee on synthetic data; the same code was also run over all
 * 724 archives and 46,053 messages of the real build, which rebuilt identical.
 */
beforeAll(async () => {
  const pub = resolve(__dirname, "../../public");
  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => ({
    ok: true,
    json: async () => JSON.parse(readFileSync(resolve(pub, url.replace(/^\//, "")), "utf8")),
  });
  await ensurePlatTables();
});

describe("Platinum message archive", () => {
  it("re-encrypts to the bytes it decrypted, seed and all", () => {
    const archive = {
      key: 0xf2d0,
      messages: [
        [0x132, 0x149, 0x150, 0x150, 0x153], // "Hello"
        [],
        [0x1de, 0x121],
      ],
    };
    const bytes = encodePlatArchive(archive);
    const back = decodePlatArchive(bytes);
    expect(back.key).toBe(archive.key);
    expect(back.messages).toEqual(archive.messages);
    // Encoding what was decoded reproduces the same bytes, which is what makes
    // an untranslated archive safe to write back.
    expect(Array.from(encodePlatArchive(back))).toEqual(Array.from(bytes));
  });

  it("stores the terminator without exposing it", () => {
    const bytes = encodePlatArchive({ key: 1, messages: [[0x121]] });
    // 4 byte header + one 8-byte table entry + two charcodes
    expect(bytes.length).toBe(4 + 8 + 4);
    expect(decodePlatArchive(bytes).messages[0]).toEqual([0x121]);
  });
});

describe("Platinum text codec", () => {
  it("round-trips plain text", () => {
    const codes = [0x132, 0x149, 0x150, 0x150, 0x153, 0x1ab];
    const text = decodePlatMessage(codes);
    expect(text).toBe("Hello!");
    expect(encodePlatMessage(text)).toEqual(codes);
  });

  it("round-trips a string variable with its arguments", () => {
    // {STRVAR_1 3, 0, 0}: command 0x0103, two arguments.
    const codes = [0xfffe, 0x0103, 2, 0, 0, 0x1ab];
    const text = decodePlatMessage(codes);
    expect(text).toBe("{STRVAR_1 3, 0, 0}!");
    expect(encodePlatMessage(text)).toEqual(codes);
  });

  it("round-trips a line break as a newline", () => {
    const codes = [0x132, 0xe000, 0x132];
    expect(decodePlatMessage(codes)).toBe("H\nH");
    expect(encodePlatMessage("H\nH")).toEqual(codes);
  });

  it("refuses a character the font has no slot for", () => {
    // The Japanese half of the set is unexpectedly wide -- a snowman is in
    // there -- so the character that proves the point has to be one the game
    // genuinely never drew.
    expect(() => encodePlatMessage("Ж")).toThrow(PlatEncodeError);
  });

  it("counts a tag as the charcodes it costs, not its letters", () => {
    for (const text of ["Hello!", "{STRVAR_1 3, 0, 0}!", "a\nb", "{COLOR 2}x"]) {
      expect(measurePlatChars(text)).toBe(encodePlatMessage(text).length);
    }
  });
});
