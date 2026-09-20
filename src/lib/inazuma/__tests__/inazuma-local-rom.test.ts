// @vitest-environment node
// Optional local fixture: no game data is committed or uploaded.
// Run with INAZUMA_TEST_ROM=/path/to/rom.nds
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readInazumaText, writeInazumaText } from "../inazuma-rom";

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
});
