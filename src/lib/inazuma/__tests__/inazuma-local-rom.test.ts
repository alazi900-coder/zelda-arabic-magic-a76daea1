// @vitest-environment node
// Optional local fixture: no game data is committed or uploaded.
// Run with INAZUMA_TEST_ROM=/path/to/rom.nds
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readInazumaText, writeInazumaText } from "../inazuma-rom";
import { extractInazumaEntries, buildInazumaRom, patchInazumaFonts } from "../inazuma-editor-bridge";
import { INAZUMA_ARABIC_BYTES } from "../inazuma-arabic-font";
import { INAZUMA_SHIFT_JIS_CODES } from "../inazuma-arabic-glyphs";
import { INAZUMA_CATEGORIES, categorizeInazumaEntry } from "../inazuma-categories";
import { findNdsFile, ndsFiles } from "@/lib/nds/nds-rom";
import { patchInazumaRtl } from "../inazuma-rtl-patch";

const path = process.env.INAZUMA_TEST_ROM;

describe.skipIf(!path)("Inazuma Eleven (Europe) cartridge", () => {
  const rom = () => new Uint8Array(readFileSync(path!));

  it("reads the dialogue, the menus and the player descriptions", { timeout: 120_000 }, () => {
    const rows = readInazumaText(rom());
    const bySource = new Map<string, number>();
    for (const row of rows) bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
    expect(bySource.get("evet")).toBeGreaterThan(20000);
    expect(bySource.get("mcht")).toBeGreaterThan(2000);
    expect(bySource.get("unitbase")).toBe(2063);
    expect(bySource.get("item")).toBeGreaterThan(500);
    expect(bySource.get("command")).toBeGreaterThan(500);
    // recognisable content, not noise: a real item description and a real move name
    expect(rows.some((r) => r.source === "item" && r.text.startsWith("Cool, clear water"))).toBe(true);
    expect(rows.some((r) => r.source === "command" && r.text === "Feint")).toBe(true);
    // The text is English and readable, not a mis-parsed blob. Note the two
    // files disagree about line breaks: unitbase.STR uses a real 0x0A, while a
    // pack stores the two characters `\` and `n`.
    expect(rows.some((r) => r.text === "No one has more love for football\nthan Raimon's fiery captain!")).toBe(true);
    expect(rows.some((r) => r.source === "evet" && r.text.includes("\\n"))).toBe(true);
    // Asset ids stay out: they are kind 2 and the player never sees them.
    expect(rows.some((r) => r.text.endsWith(".SAD"))).toBe(false);
  });

  it("rewrites the ROM byte for byte when nothing changed", { timeout: 120_000 }, () => {
    const original = rom();
    const result = writeInazumaText(original, readInazumaText(original));
    expect(result.changed).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(result.rom).toBe(original);
  });

  it("reads the cutscene subtitles and rewrites one, keeping its timing", { timeout: 120_000 }, () => {
    const original = rom();
    const before = readInazumaText(original);
    const movie = before.filter((r) => r.source === "movie");
    expect(movie.some((r) => r.text === "Why did we come to this school?")).toBe(true);
    const target = movie.find((r) => r.text === "Hey, Kidou.")!;
    const file = findNdsFile(original, "data_iz/movie/txt/en/am0501.dat")!;
    const timing = Array.from(original.subarray(file.start, file.start + 8));

    const result = writeInazumaText(original, before.map((r) => (r === target ? { ...r, text: "A LONGER SUBTITLE THAN BEFORE" } : r)));
    expect(result.changed).toBe(1);
    const after = readInazumaText(result.rom);
    expect(after.filter((r, i) => r.text !== before[i].text).map((r) => r.text)).toEqual(["A LONGER SUBTITLE THAN BEFORE"]);
    const moved = findNdsFile(result.rom, "data_iz/movie/txt/en/am0501.dat")!;
    expect(Array.from(result.rom.subarray(moved.start, moved.start + 8))).toEqual(timing);
  });

  it("puts the cutscene subtitles in their own editor section", { timeout: 120_000 }, () => {
    const { entries } = extractInazumaEntries(rom());
    expect(entries.some((e) => categorizeInazumaEntry(e) === "iz-movie" && e.original === "Hey, Kidou.")).toBe(true);
  });

  it("patches the right-to-left engine once, and leaves an already patched ROM alone", { timeout: 120_000 }, () => {
    const original = rom();
    const patched = patchInazumaRtl(original);
    expect(patched).not.toBe(original);
    expect(patchInazumaRtl(patched)).toBe(patched);
    // every file the ROM names is untouched but the five patched overlays,
    // which are now stored uncompressed, at their full size
    const overlays = [0, 15, 17, 23, 40];
    const a = ndsFiles(original), b = ndsFiles(patched);
    expect(b.every((f, i) => overlays.includes(i) || (f.start === a[i].start && f.end === a[i].end))).toBe(true);
    const table = new DataView(patched.buffer, patched.byteOffset + new DataView(patched.buffer).getUint32(0x50, true));
    for (const id of overlays) {
      expect(table.getUint32(id * 32 + 0x1c, true)).toBe(0);
      expect(b[id].end - b[id].start).toBe(table.getUint32(id * 32 + 8, true));
    }
  });

  it("draws each Arabic byte with its letter in every patched font, and 0xBA still with é", { timeout: 120_000 }, () => {
    const original = rom();
    const built = patchInazumaFonts(original);
    for (const path of ["data_iz/font/FONT12.NFTR", "data_iz/font/FONT12N.NFTR", "data_iz/font/FONT8.NFTR"]) {
      const stockFile = findNdsFile(original, path)!, builtFile = findNdsFile(built, path)!;
      const stock = original.subarray(stockFile.start, stockFile.end);
      const font = built.subarray(builtFile.start, builtFile.end);
      const glyph = (f: Uint8Array, code: number) => {
        const v = new DataView(f.buffer, f.byteOffset, f.byteLength);
        for (let at = v.getUint32(0x28, true); at; at = v.getUint32(at + 8, true)) {
          const first = v.getUint16(at, true), last = v.getUint16(at + 2, true), type = v.getUint16(at + 4, true);
          if (code < first || code > last) continue;
          return type === 0 ? v.getUint16(at + 12, true) + code - first : v.getUint16(at + 12 + (code - first) * 2, true);
        }
        return -1;
      };
      INAZUMA_ARABIC_BYTES.forEach((b, i) => expect(glyph(font, b)).toBe(glyph(stock, INAZUMA_SHIFT_JIS_CODES[i])));
      expect(glyph(font, 0xba)).toBe(glyph(stock, 0xba));
      expect(glyph(font, 0x41)).toBe(glyph(stock, 0x41));
    }
  });

  it("carries one edited line into the rebuilt ROM and leaves the rest alone", { timeout: 120_000 }, () => {
    const original = rom();
    const before = readInazumaText(original);
    const target = before.find((r) => r.source === "unitbase" && r.text.startsWith("No one has more love"))!;
    expect(target).toBeDefined();

    const edited = before.map((r) => (r === target ? { ...r, text: "CLAUDE WAS HERE" } : r));
    const result = writeInazumaText(original, edited);
    expect(result.changed).toBe(1);
    expect(result.warnings).toEqual([]);

    const after = readInazumaText(result.rom);
    expect(after.length).toBe(before.length);
    const differing = after.filter((row, i) => row.text !== before[i].text);
    expect(differing.map((r) => r.text)).toEqual(["CLAUDE WAS HERE"]);
  });

  it("carries an edited dialogue line, which means recompressing its entry", { timeout: 120_000 }, () => {
    const original = rom();
    const before = readInazumaText(original);
    const target = before.find((r) => r.source === "evet" && r.text.includes("joined you!"))!;
    expect(target).toBeDefined();

    const edited = before.map((r) =>
      r.source === target.source && r.entry === target.entry && r.key === target.key
        ? { ...r, text: "%s\\nis on the team now!" }
        : r,
    );
    const result = writeInazumaText(original, edited);
    expect(result.changed).toBeGreaterThan(0);

    const after = readInazumaText(result.rom);
    expect(after.length).toBe(before.length);
    const moved = after.find((r) => r.source === target.source && r.entry === target.entry && r.key === target.key)!;
    expect(moved.text).toBe("%s\\nis on the team now!");
  });

  it("refuses to overflow a fixed slot instead of running into the next one", { timeout: 120_000 }, () => {
    const original = rom();
    const before = readInazumaText(original);
    const target = before.find((r) => r.source === "unitbase")!;
    const edited = before.map((r) => (r === target ? { ...r, text: "x".repeat(200) } : r));
    const result = writeInazumaText(original, edited);
    expect(result.changed).toBe(0);
    expect(result.warnings.join(" ")).toMatch(/unitbase\.STR/);
  });

  it("writes into item.STR and command.STR without moving any other entry", { timeout: 120_000 }, () => {
    const original = rom();
    const before = readInazumaText(original);
    const feint = before.find((r) => r.source === "command" && r.text === "Feint")!;
    const water = before.find((r) => r.source === "item" && r.text.startsWith("Cool, clear water"))!;
    expect(feint).toBeDefined();
    expect(water).toBeDefined();

    const edited = before.map((r) => {
      if (r === feint) return { ...r, text: "Fake" };
      if (r === water) return { ...r, text: "short" };
      return r;
    });
    const result = writeInazumaText(original, edited);
    expect(result.changed).toBe(2);
    expect(result.warnings).toEqual([]);

    const after = readInazumaText(result.rom);
    expect(after.length).toBe(before.length);
    // every entry keeps its own offset (`entry`) -- nothing shifted
    const otherCommand = before.filter((r) => r.source === "command" && r !== feint);
    for (const row of otherCommand) {
      const match = after.find((r) => r.source === "command" && r.entry === row.entry)!;
      expect(match.text).toBe(row.text);
    }
    const changedRows = after.filter((row, i) => row.text !== before[i].text);
    expect(changedRows.map((r) => r.text).sort()).toEqual(["Fake", "short"]);
  });

  it("refuses an item/command translation too long for its own gap to the next entry", { timeout: 120_000 }, () => {
    const original = rom();
    const before = readInazumaText(original);
    const feint = before.find((r) => r.source === "command" && r.text === "Feint")!;
    expect(feint.limit).toBeGreaterThan(0);

    const edited = before.map((r) => (r === feint ? { ...r, text: "x".repeat(200) } : r));
    const result = writeInazumaText(original, edited);
    expect(result.changed).toBe(0);
    expect(result.warnings.join(" ")).toMatch(/command:\d+/);

    const after = readInazumaText(result.rom);
    expect(after.find((r) => r.source === "command" && r.entry === feint.entry)!.text).toBe("Feint");
  });

  it("opens only the English lines in the editor and keeps the Japanese out", { timeout: 120_000 }, () => {
    const { entries, japanese, total } = extractInazumaEntries(rom());
    expect(entries.length).toBeGreaterThan(30000);
    // roughly 40% of this release's records are untranslated Japanese
    expect(japanese).toBeGreaterThan(20000);
    expect(entries.length + japanese).toBeLessThanOrEqual(total);
    expect(entries.every((e) => e.msbtFile.startsWith("inazuma/"))).toBe(true);
    // every row the editor shows is readable English, not mojibake
    expect(entries.every((e) => [...e.original].every((c) => c.charCodeAt(0) < 0x80))).toBe(true);
    // a fixed-slot description carries the byte budget its slot actually has
    const bio = entries.find((e) => e.original.startsWith("No one has more love"))!;
    expect(bio.msbtFile).toBe("inazuma/unitbase");
    expect(bio.maxBytes).toBe(127);
  });

  it("builds a ROM whose Arabic reads back as Arabic, and refuses the bad lines", { timeout: 240_000 }, () => {
    const original = rom();
    const { entries } = extractInazumaEntries(original);
    const bio = entries.find((e) => e.original.startsWith("No one has more love"))!;
    const withTag = entries.find((e) => e.original.includes("\\n") && e.msbtFile === "inazuma/evet")!;

    const result = buildInazumaRom(original, {
      [`${bio.msbtFile}:${bio.index}`]: "مرحبا بكم",
      // drops the \n the original carries, so it must be refused
      [`${withTag.msbtFile}:${withTag.index}`]: "سطر بلا فاصل",
    });

    expect(result.translatedLines).toBe(1);
    expect(result.brokenTags).toContain(`${withTag.msbtFile}:${withTag.index}`);
    expect(result.missingGlyphs).toEqual([]);

    // the written line comes back as the font's own byte pairs, and the
    // refused one is still its English self
    const after = readInazumaText(result.rom);
    const writtenBio = after.find((r) => r.source === "unitbase" && r.entry === bio.index)!;
    expect(writtenBio.text).not.toBe(bio.original);
    expect([...writtenBio.text].some((c) => c.charCodeAt(0) >= 0x80)).toBe(true);
    expect(after.some((r) => r.text === withTag.original)).toBe(true);

    // and the fonts really were patched: the glyph slots differ from stock
    const stockFont = findNdsFile(original, "data_iz/font/FONT12.NFTR")!;
    const builtFont = findNdsFile(result.rom, "data_iz/font/FONT12.NFTR")!;
    expect(Array.from(result.rom.subarray(builtFont.start, builtFont.end))).not.toEqual(
      Array.from(original.subarray(stockFont.start, stockFont.end))
    );
  });

  // The editor's filter used to reach this cartridge through the Danganronpa
  // branch, which every Inazuma key qualifies for because it carries a colon,
  // and that branch answered with one bucket for all 33,956 lines.
  it("splits every line across the five category cards", { timeout: 120_000 }, () => {
    const { entries } = extractInazumaEntries(rom());
    const counts = new Map<string, number>();
    for (const e of entries) {
      const id = categorizeInazumaEntry(e);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const known = new Set(INAZUMA_CATEGORIES.map((c) => c.id));
    for (const id of counts.keys()) expect(known).toContain(id);
    expect(counts.get("iz-dialogue")).toBeGreaterThan(20000);
    expect(counts.get("iz-match")).toBeGreaterThan(2000);
    expect(counts.get("iz-players")).toBeGreaterThan(1000);
    expect(counts.get("iz-items")).toBeGreaterThan(500);
    expect(counts.get("iz-commands")).toBeGreaterThan(500);
    expect(counts.get("iz-other") ?? 0).toBe(0);
  });
});
