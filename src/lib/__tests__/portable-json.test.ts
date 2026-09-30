import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ExtractedEntry } from "@/components/editor/types";
import { buildPortableJson, parsePortableJson } from "@/lib/portable-json";
import { importGtaSaJson } from "@/lib/gtasa/gtasa-editor-bridge";

const entry = (msbtFile: string, index: number, original: string): ExtractedEntry =>
  ({ msbtFile, index, label: `${msbtFile} · ${index}`, original, maxBytes: 0 });

const entries = [
  entry("gtasa/MAIN", 1, "~r~Wasted~s~ press ~widget_attack~"),
  entry("gtasa/MAIN", 2, "Hello"),
  entry("gtasa/MAIN", 3, "Yes"),
  entry("gtasa/MAIN", 4, "Yes"),
  entry("twom/a.csv", 5, "Plain line"),
];
const translations: Record<string, string> = {
  "gtasa/MAIN:1": "~r~خسرت~s~ اضغط ~widget_attack~",
  "gtasa/MAIN:2": "Hello",
};

const run = (rows: unknown, current = translations, allowed: Set<string> | null = null) =>
  parsePortableJson(JSON.stringify(rows), entries, current, allowed);

describe("portable JSON export", () => {
  it("writes Arabic when translated and leaves the field empty otherwise", () => {
    const rows = buildPortableJson(entries, translations);
    expect(rows[0]).toEqual({ id: "gtasa/MAIN:1", source: entries[0].original, arabic: translations["gtasa/MAIN:1"] });
    expect(rows[1].arabic).toBe(""); // same as English = untranslated
    expect(rows[2].arabic).toBe("");
  });

  it("round-trips byte-identically with nothing to change", () => {
    const text = JSON.stringify(buildPortableJson(entries, translations));
    const back = parsePortableJson(text, entries, translations, null);
    expect(back.updates).toEqual({});
    expect(back.rejected).toEqual([]);
    expect(back.unchanged).toBe(1);
    const fresh = parsePortableJson(text, entries, {}, null);
    expect(fresh.updates).toEqual({ "gtasa/MAIN:1": translations["gtasa/MAIN:1"] });
  });
});

describe("portable JSON import", () => {
  it("refuses a line that lost a technical token", () => {
    const r = run([{ id: "gtasa/MAIN:1", source: entries[0].original, arabic: "~r~خسرت اضغط ~widget_attack~" }], {});
    expect(r.updates).toEqual({});
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reason).toContain("GTA San Andreas");
  });

  it("refuses a line whose tokens were reversed", () => {
    const r = run([{ id: "gtasa/MAIN:1", source: entries[0].original, arabic: "~widget_attack~ اضغط ~s~خسرت~r~" }], {});
    expect(r.rejected).toHaveLength(1);
  });

  it("never erases with an empty field and replaces a different translation", () => {
    const r = run([
      { id: "gtasa/MAIN:1", source: entries[0].original, arabic: "" },
      { id: "gtasa/MAIN:2", source: "Hello", arabic: "مرحبا" },
    ]);
    expect(r.updates).toEqual({ "gtasa/MAIN:2": "مرحبا" });
    expect(r.empty).toBe(1);
  });

  it("matches by unique English text, and refuses an ambiguous one", () => {
    const r = run([{ source: "Plain line", arabic: "سطر" }, { source: "Yes", arabic: "نعم" }]);
    expect(r.updates).toEqual({ "twom/a.csv:5": "سطر" });
    expect(r.rejected.map(x => x.source)).toEqual(["Yes"]);
  });

  it("reads the GTA San Andreas {table, hash} shape and aliased field names", () => {
    const r = run({ entries: [{ table: "MAIN", hash: "00000002", english: "Hello", translation: "أهلاً" }] });
    expect(r.updates).toEqual({ "gtasa/MAIN:2": "أهلاً" });
  });

  it("accepts a money amount that ends the sentence in the English too", () => {
    const money = [entry("gtasa/MAIN", 9, "You need $500.")];
    const r = parsePortableJson(JSON.stringify([{ id: "gtasa/MAIN:9", source: "You need $500.", arabic: "تحتاج $500." }]), money, {}, null);
    expect(r.rejected).toEqual([]);
    expect(r.updates).toEqual({ "gtasa/MAIN:9": "تحتاج $500." });
  });

  it("refuses a line whose English does not match the project", () => {
    const r = run([{ id: "gtasa/MAIN:2", source: "Goodbye", arabic: "وداعاً" }]);
    expect(r.updates).toEqual({});
    expect(r.rejected).toHaveLength(1);
  });

  it("only touches lines inside the active filter", () => {
    const r = run([{ id: "gtasa/MAIN:2", source: "Hello", arabic: "مرحبا" }], translations, new Set(["twom/a.csv:5"]));
    expect(r.updates).toEqual({});
    expect(r.outsideFilter).toBe(1);
  });
});

const fixturePath = process.env.GTASA_TEST_JSON;
describe.skipIf(!fixturePath)("the real GTA San Andreas export", () => {
  it("imports every translated line and exports it back unchanged", () => {
    const raw = readFileSync(fixturePath!, "utf8");
    const project = importGtaSaJson(JSON.parse(raw));
    const r = parsePortableJson(raw, project.entries, {}, null);
    expect(r.rejected).toEqual([]);
    const expected = Object.fromEntries(Object.entries(project.translations).filter(([, v]) => v !== ""));
    expect(r.updates).toEqual(expected);
    const out = buildPortableJson(project.entries, r.updates);
    expect(out.map(row => row.arabic)).toEqual(project.entries.map(e => project.translations[`${e.msbtFile}:${e.index}`]));
  });
});
