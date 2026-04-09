import { describe, expect, it } from "vitest";
import { parsePo } from "@/lib/danganronpa-po-parser";

describe("danganronpa po parser", () => {
  it("extracts msgid/msgstr entries from po content", () => {
    const po = [
      'msgctxt "e01_103"',
      'msgid "Hello there"',
      'msgstr ""',
      "",
      'msgid "Second line"',
      'msgstr "السطر الثاني"',
      "",
    ].join("\n");

    const entries = parsePo(new TextEncoder().encode(po).buffer as ArrayBuffer);

    expect(entries).toHaveLength(2);
    expect(entries[0].original).toBe("Hello there");
    expect(entries[0].translation).toBe("");
    expect(entries[0].context).toBe("e01_103");
    expect(entries[1].original).toBe("Second line");
    expect(entries[1].translation).toBe("السطر الثاني");
  });

  it("ignores binary content that does not contain po markers", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5]).buffer as ArrayBuffer;
    expect(parsePo(bytes)).toEqual([]);
  });
});