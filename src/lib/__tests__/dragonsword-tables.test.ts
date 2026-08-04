import { describe, it, expect } from "vitest";
import { parseDsTable, buildDsTable, dsFileId } from "@/lib/dragonsword/ds-tables";
import { DS_FILE_RE, dsCategoryLabel } from "@/lib/dragonsword/ds-categories";

/**
 * A table file written exactly the way the shipped ones are: a UTF-8 mark,
 * two-space indentation, no trailing newline, and the keys in the file's own
 * order — which is not ascending. That last point is the whole reason these
 * tests exist. JavaScript iterates integer-like object keys in ascending order
 * no matter how they were written, so a rebuild that went through an object
 * would silently re-sort the file and rewrite thousands of lines that nobody
 * touched.
 */
function table(rows: [string, string][]): Uint8Array {
  const body = rows
    .map(([key, text]) =>
      `    ${JSON.stringify(key)}: {\n      "ID": ${Number(key)},\n      "SourceString": ${JSON.stringify(text)}\n    }`
    )
    .join(",\n");
  return new TextEncoder().encode(`﻿{\n  "Data": {\n${body}\n  }\n}`);
}

/** Out of order on purpose, and holding the escapes the real files hold. */
const ROWS: [string, string][] = [
  ["10007011", "Benvenuto, <orange>{0}</>!"],
  ["10000002", "Prima riga\nSeconda riga"],
  ["10007009", 'Disse "basta" e se ne andò — è finita.'],
  ["10000001", "Premi <actkey = \"JUMP\"/> per saltare"],
  ["99000123", "<Una nota scarabocchiata da qualcuno>"],
];

describe("dragonsword table parsing", () => {
  it("reads every row with its id and its text", () => {
    const rows = parseDsTable(table(ROWS));
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ key: "10007011", id: 10007011, text: "Benvenuto, <orange>{0}</>!" });
    expect(rows[1].text).toBe("Prima riga\nSeconda riga");
    expect(rows[3].text).toBe('Premi <actkey = "JUMP"/> per saltare');
  });

  it("keeps the file's own order instead of sorting the ids", () => {
    const rows = parseDsTable(table(ROWS));
    expect(rows.map((r) => r.key)).toEqual(ROWS.map(([k]) => k));
  });

  it("refuses a file that is not JSON, and one without «Data»", () => {
    expect(() => parseDsTable(new TextEncoder().encode("{ nope"))).toThrow(/JSON/);
    expect(() => parseDsTable(new TextEncoder().encode('{"Other":{}}'))).toThrow(/Data/);
  });
});

describe("dragonsword table rebuilding", () => {
  /**
   * The gate: rebuild a table with nothing replaced and it must come back byte
   * for byte. Unlike the pak, there is no compression in the way here, so this
   * one is exact — and it is what proves the order, the indentation and the
   * byte-order mark all survive.
   */
  it("rebuilds an untouched table byte for byte", () => {
    const source = table(ROWS);
    const out = buildDsTable(source, new Map());
    expect(out.length).toBe(source.length);
    expect(Array.from(out)).toEqual(Array.from(source));
  });

  it("writes the byte-order mark back", () => {
    const out = buildDsTable(table(ROWS), new Map());
    expect(Array.from(out.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("replaces one row and touches nothing else", () => {
    const source = table(ROWS);
    const out = buildDsTable(source, new Map([[10007009, "قال «كفى» ومضى — انتهى الأمر."]]));
    const rows = parseDsTable(out);
    expect(rows.map((r) => r.key)).toEqual(ROWS.map(([k]) => k));
    expect(rows[2].text).toBe("قال «كفى» ومضى — انتهى الأمر.");
    expect(rows[0].text).toBe(ROWS[0][1]);
    expect(rows[1].text).toBe(ROWS[1][1]);
    expect(rows[3].text).toBe(ROWS[3][1]);
    // Every byte except that row's text is the source's, so the only difference
    // between the two files is the one line the translator changed.
    const expected = table(ROWS.map(([k, t]) => [k, k === "10007009" ? "قال «كفى» ومضى — انتهى الأمر." : t]));
    expect(Array.from(out)).toEqual(Array.from(expected));
  });

  it("escapes a translation that carries newlines and quotes", () => {
    const out = buildDsTable(table(ROWS), new Map([[10000002, 'سطرٌ أوّل\nوسطرٌ "ثانٍ"']]));
    expect(parseDsTable(out)[1].text).toBe('سطرٌ أوّل\nوسطرٌ "ثانٍ"');
    expect(new TextDecoder().decode(out)).toContain('\\n');
  });

  it("ignores a replacement for an id the table does not hold", () => {
    const source = table(ROWS);
    const out = buildDsTable(source, new Map([[555, "لا وجود لهذا"]]));
    expect(Array.from(out)).toEqual(Array.from(source));
  });
});

describe("dragonsword file ids", () => {
  it("turns a table's path into the editor's file id", () => {
    expect(dsFileId("A/B/StringQuestData_fr.table")).toBe("ds_stringquestdata");
    expect(dsFileId("StringSceneData.table")).toBe("ds_stringscenedata");
  });

  /**
   * The four shipped tables are all named `_fr`, in every language pak. The id
   * has to come out the same for an Italian pak and an English one, or a
   * translation saved from one would not match the other — and the category
   * labels, which are keyed on these ids, would fall back to raw file names.
   */
  it("gives the same id whichever language pak the table came from", () => {
    expect(dsFileId("StringData_fr.table")).toBe("ds_stringdata");
    expect(dsFileId("StringData_it.table")).toBe("ds_stringdata");
    expect(dsFileId("StringData_en.table")).toBe("ds_stringdata");
  });

  it("produces ids the editor recognises as this game's", () => {
    for (const path of ["StringData_fr.table", "StringQuestData_fr.table",
      "StringReminiscenceData_fr.table", "StringSceneData_fr.table"]) {
      expect(dsFileId(path)).toMatch(DS_FILE_RE);
      expect(dsCategoryLabel(dsFileId(path))).not.toBe(dsFileId(path).replace(/^ds_/, ""));
    }
  });
});

/**
 * The shipped tables use bare newlines and the Arabic mod's use carriage
 * returns. Forcing one style on the other would rewrite every line of a file
 * whose text nobody touched — 5.3 MB of diff for one edited sentence.
 */
describe("dragonsword table line endings", () => {
  // `ignoreBOM` because the default decoder swallows the mark, and a fixture
  // that quietly lost it would make the rebuild look three bytes too long.
  function crlf(bytes: Uint8Array): Uint8Array {
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    return new TextEncoder().encode(text.replace(/\n/g, "\r\n"));
  }

  it("rebuilds a carriage-return file byte for byte", () => {
    const source = crlf(table(ROWS));
    const out = buildDsTable(source, new Map());
    expect(out.length).toBe(source.length);
    expect(Array.from(out)).toEqual(Array.from(source));
  });

  it("reads the same rows whichever style the file uses", () => {
    expect(parseDsTable(crlf(table(ROWS)))).toEqual(parseDsTable(table(ROWS)));
  });

  it("keeps the file's style when a row is replaced", () => {
    const out = buildDsTable(crlf(table(ROWS)), new Map([[10007011, "أهلاً <orange>{0}</>!"]]));
    const text = new TextDecoder().decode(out);
    expect(text).toContain("\r\n");
    expect(text.replace(/\r\n/g, "\n")).not.toContain("\r");
    expect(parseDsTable(out)[0].text).toBe("أهلاً <orange>{0}</>!");
  });

  /** A `\n` inside a translated line is two characters of JSON, not a break. */
  it("does not mistake an escaped newline in a value for the file's style", () => {
    const one = table([["1", "سطر\nآخر"]]);
    expect(new TextDecoder().decode(buildDsTable(one, new Map()))).not.toContain("\r");
  });
});
