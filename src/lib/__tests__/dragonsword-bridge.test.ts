import { describe, it, expect } from "vitest";
import { makePak } from "./dragonsword-pak-helper";
import { extractDsEntries, buildDsPak } from "@/lib/dragonsword/ds-editor-bridge";
import { dsTags, diffDsTags, dsIsTechnicalOnly } from "@/lib/dragonsword/ds-tag-guard";
import { dsCategories, dsCategoryLabel } from "@/lib/dragonsword/ds-categories";

function table(rows: [number, string][]): Uint8Array {
  const body = rows
    .map(([id, text]) =>
      `    "${id}": {\n      "ID": ${id},\n      "SourceString": ${JSON.stringify(text)}\n    }`
    )
    .join(",\n");
  return new TextEncoder().encode(`﻿{\n  "Data": {\n${body}\n  }\n}`);
}

const QUEST: [number, string][] = [
  [10007011, "Benvenuto, <orange>{0}</>!"],
  [10007009, "Premi <actkey = \"JUMP\"/> per saltare."],
  [10007005, "<Una nota scarabocchiata da qualcuno>"],
  [10007002, "<big>{0}</> ha perso {1} punti."],
];
const SCENE: [number, string][] = [
  [20000001, "La spada attende."],
  [20000002, "<orange>{0}</>"],
  [20000003, "  42  "],
  [20000004, ""],
];

function pak(): Uint8Array {
  return makePak([
    { path: "StringQuestData_fr.table", data: table(QUEST) },
    { path: "StringSceneData_fr.table", data: table(SCENE) },
  ]);
}

describe("dragonsword extraction", () => {
  it("gives one entry per line that holds words", () => {
    const { entries, tables, skipped } = extractDsEntries(pak());
    expect(tables.map((t) => t.file)).toEqual(["ds_stringquestdata", "ds_stringscenedata"]);
    expect(tables[0].rows).toBe(4);
    // `<orange>{0}</>`, the bare number and the empty line hold no words.
    expect(skipped).toBe(3);
    expect(entries.map((e) => `${e.msbtFile}:${e.index}`)).toEqual([
      "ds_stringquestdata:10007011",
      "ds_stringquestdata:10007009",
      "ds_stringquestdata:10007005",
      "ds_stringquestdata:10007002",
      "ds_stringscenedata:20000001",
    ]);
  });

  it("keys an entry on its own id, so re-opening a pak matches saved work", () => {
    const first = extractDsEntries(pak()).entries;
    const again = extractDsEntries(pak()).entries;
    expect(again.map((e) => `${e.msbtFile}:${e.index}`)).toEqual(
      first.map((e) => `${e.msbtFile}:${e.index}`)
    );
  });

  it("carries the original text through untouched", () => {
    const { entries } = extractDsEntries(pak());
    expect(entries[0].original).toBe("Benvenuto, <orange>{0}</>!");
    expect(entries[1].original).toBe('Premi <actkey = "JUMP"/> per saltare.');
  });
});

describe("dragonsword rebuilding", () => {
  it("writes translations and reads them back as Arabic", () => {
    const out = buildDsPak(pak(), {
      "ds_stringquestdata:10007011": "أهلاً بك يا <orange>{0}</>!",
      "ds_stringscenedata:20000001": "السيف ينتظر.",
    });
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.translatedLines).toBe(2);
    expect(out.brokenTags).toEqual([]);
    const again = extractDsEntries(out.pak).entries;
    expect(again.find((e) => e.index === 10007011)!.original).toBe("أهلاً بك يا <orange>{0}</>!");
    expect(again.find((e) => e.index === 20000001)!.original).toBe("السيف ينتظر.");
    // Untouched lines keep their Italian, byte for byte.
    expect(again.find((e) => e.index === 10007009)!.original).toBe(QUEST[1][1]);
  });

  /**
   * `{0}` is a value the game substitutes and `</>` closes a colour. A line
   * that lost one either prints the wrong thing or paints the rest of the
   * screen orange, and nobody sees it until they play that far — so the line is
   * refused and named, and the Italian stays.
   */
  it("refuses a line that dropped a token, and keeps the original", () => {
    const out = buildDsPak(pak(), {
      "ds_stringquestdata:10007011": "أهلاً بك!",
      "ds_stringscenedata:20000001": "السيف ينتظر.",
    });
    if ("error" in out) throw new Error(out.error);
    expect(out.translatedLines).toBe(1);
    expect(out.brokenTags).toHaveLength(1);
    expect(out.brokenTags[0].id).toBe(10007011);
    expect(out.brokenTags[0].missing.sort()).toEqual(["</>", "<orange>", "{0}"]);
    const again = extractDsEntries(out.pak).entries;
    expect(again.find((e) => e.index === 10007011)!.original).toBe(QUEST[0][1]);
  });

  it("refuses a line that swapped {0} and {1}", () => {
    const out = buildDsPak(pak(), {
      "ds_stringquestdata:10007002": "<big>{1}</> فقد {0} نقطة.",
    });
    if ("error" in out) throw new Error(out.error);
    expect(out.translatedLines).toBe(0);
    expect(out.brokenTags[0].missing).toEqual([]);
    expect(out.brokenTags[0].extra).toEqual([]);
  });

  it("counts what it wrote per table", () => {
    const out = buildDsPak(pak(), { "ds_stringscenedata:20000001": "السيف ينتظر." });
    if ("error" in out) throw new Error(out.error);
    expect(out.perTable).toEqual([
      { file: "ds_stringquestdata", written: 0, rows: 4 },
      { file: "ds_stringscenedata", written: 1, rows: 4 },
    ]);
  });

  it("says so when there is nothing to build, and when the file is not a pak", () => {
    expect(buildDsPak(pak(), {})).toHaveProperty("error");
    expect(buildDsPak(pak(), { "ds_stringquestdata:10007011": QUEST[0][1] })).toHaveProperty("error");
    expect(buildDsPak(new Uint8Array(400), { "a:1": "x" })).toHaveProperty("error");
  });
});

describe("dragonsword technical tokens", () => {
  it("finds the styles, the closers, the action keys and the values", () => {
    expect(dsTags("<orange>{0}</> e <big>{1}</> con <actkey = \"JUMP\"/>")).toEqual([
      "<orange>", "{0}", "</>", "<big>", "{1}", "</>", '<actkey = "JUMP"/>',
    ]);
  });

  /**
   * The trap this guard was written around: a line of prose in angle brackets,
   * «a note scribbled by someone», appearing sixteen times in the shipped text.
   * A guard over every `<…>` would refuse to let it be translated and leave
   * Italian in the game.
   */
  it("treats prose in angle brackets as words, not as a tag", () => {
    const line = "<Una nota scarabocchiata da qualcuno>";
    expect(dsTags(line)).toEqual([]);
    expect(dsIsTechnicalOnly(line)).toBe(false);
    expect(diffDsTags(line, "ملاحظةٌ خطّها أحدهم").missing).toEqual([]);
  });

  it("knows a line that is nothing but tokens", () => {
    expect(dsIsTechnicalOnly("<orange>{0}</>")).toBe(true);
    expect(dsIsTechnicalOnly("  42  ")).toBe(true);
    expect(dsIsTechnicalOnly("")).toBe(true);
    expect(dsIsTechnicalOnly("{0} punti")).toBe(false);
  });

  it("passes a translation that kept every token in order", () => {
    const diff = diffDsTags("Benvenuto, <orange>{0}</>!", "أهلاً بك يا <orange>{0}</>!");
    expect(diff).toEqual({ missing: [], extra: [], sameOrder: true });
  });

  it("reports a token the translation invented", () => {
    const diff = diffDsTags("Ciao {0}", "مرحباً {0} و{1}");
    expect(diff.extra).toEqual(["{1}"]);
    expect(diff.missing).toEqual([]);
  });
});

describe("dragonsword categories", () => {
  it("names the four tables and keeps an unknown one filterable", () => {
    expect(dsCategories(["ds_stringscenedata", "ds_stringdata", "ds_stringscenedata"])).toEqual([
      { id: "ds_stringdata", label: "الذكريات ورسائل النظام" },
      { id: "ds_stringscenedata", label: "المهامّ" },
    ]);
    expect(dsCategoryLabel("ds_somethingnew")).toBe("somethingnew");
  });
});
