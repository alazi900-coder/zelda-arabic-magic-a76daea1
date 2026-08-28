import { describe, expect, it } from "vitest";
import { extractTags } from "@/lib/tag-extractor";
import { extractPokemonXpEntries } from "@/lib/pokemon-xp/pokemon-xp-editor-bridge";
import { RubyMarshalParseError, parseRubyMarshal } from "@/lib/pokemon-xp/ruby-marshal";

function bytes(...values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

describe("Pokémon Essentials — Ruby Marshal reader", () => {
  it("reads the Marshal 4.8 string-array subset without executing Ruby", () => {
    // Marshal: ["Hi", "There"]
    const source = bytes(0x04, 0x08, 0x5b, 0x07, 0x22, 0x07, 0x48, 0x69, 0x22, 0x0a, 0x54, 0x68, 0x65, 0x72, 0x65);
    expect(parseRubyMarshal(source)).toEqual(["Hi", "There"]);
  });

  it("rejects a non-Marshal file before treating any bytes as text", () => {
    expect(() => parseRubyMarshal(bytes(0x50, 0x4b, 0x03, 0x04))).toThrow(RubyMarshalParseError);
  });

  it("converts table values into stable editor entries", () => {
    // Marshal: [{"menu" => "New Game", "code" => "\\PN"}]
    const source = bytes(
      0x04, 0x08, 0x5b, 0x06, 0x7b, 0x07,
      0x22, 0x09, 0x6d, 0x65, 0x6e, 0x75,
      0x22, 0x0d, 0x4e, 0x65, 0x77, 0x20, 0x47, 0x61, 0x6d, 0x65,
      0x22, 0x09, 0x63, 0x6f, 0x64, 0x65,
      0x22, 0x08, 0x5c, 0x50, 0x4e,
    );
    const extracted = extractPokemonXpEntries(source);
    expect(extracted.summary).toMatchObject({ entries: 2, sections: 1 });
    expect(extracted.entries.map((entry) => entry.original)).toEqual(["New Game", "\\PN"]);
    expect(extracted.entries.map((entry) => entry.msbtFile)).toEqual(["pokemon-xp/section-0", "pokemon-xp/section-0"]);
  });
});

describe("Pokémon Essentials — technical commands", () => {
  it("discovers player, variable, and colour commands as protected escape sequences", async () => {
    const report = await extractTags([{
      msbtFile: "pokemon-xp/section-0",
      original: "Hello \\PN \\v[1] \\c[2]",
    }]);
    expect([...report.categories.escape_seq.keys()]).toEqual(["\\PN", "\\v[1]", "\\c[2]"]);
  });
});
