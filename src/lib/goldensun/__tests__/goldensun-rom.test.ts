import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { GOLDENSUN_ARABIC_BYTE_MAP } from "../goldensun-arabic-font";
import { goldensunTextToBytes, goldensunBytesToText } from "../goldensun-rom";
import { tokenizeGoldenSunBytes, goldensunControlCodeArgBytes } from "../goldensun-tags";

describe("goldensun-tags", () => {
  it("gives the hero-name code (0x11) one argument byte", () => {
    expect(goldensunControlCodeArgBytes(0x11)).toBe(1);
  });
  it("gives plain box/line codes (0x02, 0x03) no argument bytes", () => {
    expect(goldensunControlCodeArgBytes(0x02)).toBe(0);
    expect(goldensunControlCodeArgBytes(0x03)).toBe(0);
  });
  it("tokenizes a code with its argument separately from surrounding text", () => {
    const toks = tokenizeGoldenSunBytes([0x11, 0x01, 0x2c, 0x20, 0x59, 0x6f, 0x75, 0x02]);
    expect(toks).toEqual([
      { kind: "code", bytes: [0x11, 0x01] },
      { kind: "text", bytes: [0x2c, 0x20, 0x59, 0x6f, 0x75] },
      { kind: "code", bytes: [0x02] },
    ]);
  });
});

describe("goldensun-rom text<->bytes", () => {
  it("round-trips plain English with control codes", () => {
    const text = "Come on, \\x11\\x01.\\x03We have to go\\x18now!\\x02";
    const bytes = goldensunTextToBytes(text);
    expect(goldensunBytesToText(bytes)).toBe(text);
  });

  it("encodes Arabic text into the 0x90-0xff/overflow byte range", () => {
    const bytes = goldensunTextToBytes("لعبة جديدة");
    for (const b of bytes) expect(b).toBeGreaterThanOrEqual(0x20);
    expect(bytes.some((b) => b >= 0x90)).toBe(true);
  });

  it("keeps `\\xNN` escapes untouched even inside an Arabic sentence", () => {
    const bytes = goldensunTextToBytes("أرجوك يا عزيزي، استيقظ!\\x02");
    expect(bytes[bytes.length - 1]).toBe(0x02);
  });
});


describe("goldensun Arabic byte map", () => {
  it("matches the font baked into GoldenSun-AR-RTL-FONT.ups (gsfont.py's codes.json) exactly", () => {
    const ref: Record<string, number> = JSON.parse(readFileSync("goldensun-arabic/scripts/codes.json", "utf8"));
    expect(Object.keys(GOLDENSUN_ARABIC_BYTE_MAP)).toHaveLength(Object.keys(ref).length);
    for (const [cp, byte] of Object.entries(ref)) expect(GOLDENSUN_ARABIC_BYTE_MAP[Number(cp)]).toBe(byte);
  });
});

import { hasTechnicalTags } from "@/components/editor/types";

describe("hasTechnicalTags recognizes Golden Sun's \\xNN codes", () => {
  it("is true for a line carrying a \\xNN code", () => {
    expect(hasTechnicalTags("\\x11\\x01, wake up!\\x02")).toBe(true);
  });
  it("is false for a line with no codes at all", () => {
    expect(hasTechnicalTags("Mimic")).toBe(false);
  });
});
