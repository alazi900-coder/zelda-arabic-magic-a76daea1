/**
 * The `.table` files inside DragonSword Awakening's pak.
 *
 * They are plain JSON with a UTF-8 byte-order mark, and nothing more:
 *
 *     { "Data": { "10007011": { "ID": 10007011, "SourceString": "…" } } }
 *
 * The key repeats the ID, so a line is identified by its ID and nothing else —
 * which is what the editor keys on, and why re-opening the pak never loses a
 * translation.
 *
 * A rebuild re-serialises with two-space indentation, keeps the file's own key
 * order and puts the mark back, because that is exactly how the shipped files
 * are written; a test rebuilds all four untouched and compares them byte for
 * byte. The order matters: JavaScript sorts integer-like object keys, and
 * these files are not sorted.
 */

const BOM = "﻿";

/**
 * The line ending the file itself uses.
 *
 * The shipped tables are written with bare newlines and the Arabic mod's with
 * carriage returns, and a rebuild that forced one style on the other would
 * rewrite every line of a file whose text nobody touched. Read from the first
 * break in the structure, where a real byte pair sits — a break inside a
 * translated line is spelled `\n` in the JSON and is two ordinary characters.
 */
function lineEnding(text: string): string {
  const at = text.indexOf("\n");
  return at > 0 && text[at - 1] === "\r" ? "\r\n" : "\n";
}

export interface DsRow {
  /** The key exactly as the file spells it — the order of these is the file's. */
  key: string;
  id: number;
  text: string;
}

/** Every row of one table, in the order the file lists them. */
export function parseDsTable(bytes: Uint8Array): DsRow[] {
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`ملفّ الجدول ليس JSON صالحاً: ${(err as Error).message}`);
  }
  const data = (json as { Data?: Record<string, { ID?: number; SourceString?: string }> }).Data;
  if (!data || typeof data !== "object") {
    throw new Error("الجدول لا يحمل حقل «Data»");
  }
  // The order has to come off the raw text. `JSON.parse` gives an object, and
  // JavaScript iterates integer-like keys in ascending order no matter how the
  // file wrote them — these files are not in that order, and re-emitting them
  // sorted would rewrite most of the file for nothing.
  const order: string[] = [];
  for (const m of text.matchAll(/^ {4}"((?:[^"\\]|\\.)*)":\s*\{/gm)) order.push(JSON.parse(`"${m[1]}"`));
  const keys = order.length === Object.keys(data).length ? order : Object.keys(data);

  const out: DsRow[] = [];
  for (const key of keys) {
    const value = data[key];
    if (!value) throw new Error(`مفتاحٌ في النصّ ولا وجود له في البيانات: ${key}`);
    const id = typeof value.ID === "number" ? value.ID : Number(key);
    if (!Number.isFinite(id)) throw new Error(`مفتاحٌ ليس رقماً: ${key}`);
    out.push({ key, id, text: typeof value.SourceString === "string" ? value.SourceString : "" });
  }
  return out;
}

/**
 * Writes the table back with some rows replaced, keyed by ID.
 *
 * Rows the caller did not touch are re-emitted exactly as they were read, and
 * the order is the file's own — a rebuild is not a chance to sort anything.
 */
export function buildDsTable(bytes: Uint8Array, replace: Map<number, string>): Uint8Array {
  const rows = parseDsTable(bytes);
  const nl = lineEnding(new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, ""));
  // Written by hand rather than with `JSON.stringify` on an object: JavaScript
  // reorders integer-like keys into ascending order, and these files are not in
  // that order. Only the value escaping is borrowed from the built-in.
  const body = rows
    .map((row) => {
      const text = JSON.stringify(replace.get(row.id) ?? row.text);
      return `    ${JSON.stringify(row.key)}: {${nl}      "ID": ${row.id},${nl}      "SourceString": ${text}${nl}    }`;
    })
    .join(`,${nl}`);
  return new TextEncoder().encode(`${BOM}{${nl}  "Data": {${nl}${body}${nl}  }${nl}}`);
}

/** `StringSceneData_fr.table` → `ds_stringscenedata`, the editor's file id. */
export function dsFileId(path: string): string {
  const name = (path.split("/").pop() ?? path).replace(/\.table$/i, "");
  // The tables carry a language in their name — and the Italian pak names its
  // own files `_fr`, so the suffix does not even say what is inside them. It is
  // dropped: the row ids are the same whichever language pak was opened, so a
  // translation saved from one matches the next.
  const base = name.replace(/_[A-Za-z]{2,3}$/, "");
  return `ds_${base.replace(/[^A-Za-z0-9]/g, "").toLowerCase()}`;
}
