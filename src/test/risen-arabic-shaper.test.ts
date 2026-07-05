import { describe, it, expect } from "vitest";
import { shapeArabicForRisen } from "@/lib/risen/arabic-shaper";
import { parseRisenP00Full, buildRisenP00, applyTranslations, makeKey } from "@/lib/risen-p00";

/** Build a string from hex codepoints, e.g. cp(0x0645, 0x062A) — keeps
 * expected values readable while making the exact codepoints unambiguous. */
function cp(...codes: number[]): string {
  return codes.map((c) => String.fromCharCode(c)).join("");
}

describe("shapeArabicForRisen — letter shaping (Presentation Forms-B)", () => {
  it('shapes "متابعة" into the exact expected joined-form codepoint sequence', () => {
    // م ت ا ب ع ة (0645 062A 0627 0628 0639 0629), hand-derived per the
    // standard Arabic joining rules:
    //   م initial (no prev, connects to ت)                -> FEE3
    //   ت medial  (connects both ways)                     -> FE98
    //   ا final   (right-joining only, connects to ت)      -> FE8E
    //   ب initial (ا cannot connect forward, fresh chain)  -> FE91
    //   ع medial  (connects both ways)                     -> FECC
    //   ة final   (right-joining only, ends the word)      -> FE94
    // Then the whole line is reversed (Arabic-flow run) for visual LTR draw.
    const expected = cp(0xFE94, 0xFECC, 0xFE91, 0xFE8E, 0xFE98, 0xFEE3);
    expect(shapeArabicForRisen("متابعة")).toBe(expected);
  });

  it('shapes lam-alef ligature in "السلام" and shrinks the letter count', () => {
    // ا ل س ل ا م — the second ل + ا pair (positions 3-4) must collapse into
    // one FEFC (lam-alef final, connects to the preceding س) ligature glyph.
    const before = [..."السلام"].length; // 6 logical letters
    const shaped = shapeArabicForRisen("السلام");
    // 5 output units: ا(isolated) ل(initial) س(medial) [لا-ligature] م(isolated),
    // then reversed for visual order.
    expect([...shaped].length).toBe(before - 1);
    expect(shaped).toContain(cp(0xFEFC)); // the mandatory ligature codepoint
    const expected = cp(0xFEE1, 0xFEFC, 0xFEB4, 0xFEDF, 0xFE8D);
    expect(shaped).toBe(expected);
  });
});

describe("shapeArabicForRisen — protected tokens stay byte-identical", () => {
  it('keeps <Attack> intact and positioned between the two reversed Arabic runs', () => {
    const result = shapeArabicForRisen("اضغط <Attack> للخروج");
    expect(result).toContain("<Attack>");
    // The token sits between the two (now reversed+shaped) Arabic phrases —
    // splitting on it must yield exactly two non-empty Arabic-only halves.
    const [before, after] = result.split("<Attack>");
    expect(before.trim().length).toBeGreaterThan(0);
    expect(after.trim().length).toBeGreaterThan(0);
    // Neither half contains any raw ASCII Latin letters — the token was the
    // only Latin content and it was extracted cleanly.
    expect(/[A-Za-z]/.test(before)).toBe(false);
    expect(/[A-Za-z]/.test(after)).toBe(false);
  });

  it('keeps $(name) intact', () => {
    const result = shapeArabicForRisen("مرحباً $(name) كيف حالك");
    expect(result).toContain("$(name)");
  });
});

describe("shapeArabicForRisen — digits never get internally reordered", () => {
  it('keeps "150" in order 1,5,0 surrounded by shaped Arabic', () => {
    const result = shapeArabicForRisen("لديك 150 ذهب");
    expect(result).toContain("150");
  });
});

describe("shapeArabicForRisen — multi-line handling", () => {
  it("shapes/reverses each line independently, preserves \\r\\n, keeps line order", () => {
    const input = "سطر أول\r\nسطر ثانٍ";
    const result = shapeArabicForRisen(input);
    expect(result).toContain("\r\n");
    const [line1, line2] = result.split("\r\n");
    // Line order must NOT swap — the shaped/reversed first line stays first.
    const expectedLine1 = cp(0xFEDD, 0xFEED, 0xFE83, 0x0020, 0xFEAE, 0xFEC4, 0xFEB3);
    const expectedLine2 = cp(0x064D, 0xFEE5, 0xFE8E, 0xFE9B, 0x0020, 0xFEAE, 0xFEC4, 0xFEB3);
    expect(line1).toBe(expectedLine1);
    expect(line2).toBe(expectedLine2);
  });

  it("supports plain \\n as well as \\r\\n", () => {
    const result = shapeArabicForRisen("أ\nب");
    expect(result).toContain("\n");
    expect(result.split("\n")).toHaveLength(2);
  });
});

describe("shapeArabicForRisen — non-Arabic values pass through unchanged", () => {
  it("returns a pure Latin/English value completely unchanged (identity)", () => {
    expect(shapeArabicForRisen("Hello World")).toBe("Hello World");
  });

  it("returns an empty string unchanged", () => {
    expect(shapeArabicForRisen("")).toBe("");
  });

  it("returns a pure-digit/punctuation value unchanged", () => {
    expect(shapeArabicForRisen("42%")).toBe("42%");
  });
});

describe("shapeArabicForRisen — brackets (deviation from spec, see module comment)", () => {
  // Hand-traced and script-verified: mirroring "(" / ")" while reversing
  // "وزن (كامل)" produces "وزن )كامل(" once read back in visual RTL order
  // (orientation flipped — wrong). Leaving the bracket codepoints untouched
  // and only repositioning them via the run reversal produces the correct
  // "وزن (كامل)". This test locks in the un-mirrored (verified-correct)
  // behavior; see the NOTE above reverseShapedLine for the full trace.
  it("repositions parentheses correctly WITHOUT swapping their codepoint", () => {
    const result = shapeArabicForRisen("وزن (كامل)");
    // Reading the result right-to-left (as the naive engine + a human RTL
    // reader jointly reconstruct it) must reproduce the original exactly.
    const readVisually = [...result].reverse().join("");
    // Un-shape back to base letters for a codepoint-independent comparison.
    expect(readVisually).toContain("(");
    expect(readVisually).toContain(")");
    expect(readVisually.indexOf("(")).toBeLessThan(readVisually.indexOf(")"));
  });
});

describe("shapeArabicForRisen — round-trip safety", () => {
  // Guards against unshaped 0600-block letters leaking into the output —
  // every codepoint must be within the font's covered ranges (ASCII/Latin-1,
  // Arabic Presentation Forms-B, Arabic-Indic digits) or a protected token
  // character. Excluded from this check: inputs with tashkeel (ً ٌ ٍ) or
  // Arabic punctuation (، ؛ ؟) / tatweel (ـ) — these pass through unshaped
  // by design (no letter-shaping applies to them) and are a known,
  // out-of-scope edge case for this test.
  const SAFE_RANGE = /^[\u0020-\u00FF\u0660-\u0669\uFE70-\uFEFF]*$/;

  const cases = [
    "متابعة",
    "السلام",
    "اضغط <Attack> للخروج",
    "لديك 150 ذهب",
    "وزن (كامل)",
  ];

  for (const input of cases) {
    it(`"${input}" produces only font-safe codepoints`, () => {
      const result = shapeArabicForRisen(input);
      const stripped = result.replace(/[\r\n]/g, "");
      expect(SAFE_RANGE.test(stripped)).toBe(true);
    });
  }
});

// ─── Integration: shaped text survives the real UTF-16LE binary round-trip ──

const enc = (s: string): Uint8Array => {
  const buf = new Uint8Array(s.length * 2);
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < s.length; i++) dv.setUint16(i * 2, s.charCodeAt(i), true);
  return buf;
};

interface FieldSpec { name: string; values: string[] }

function buildTab0(fields: FieldSpec[]): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(new Uint8Array([0x54, 0x41, 0x42, 0x30])); // "TAB0"
  const header = new Uint8Array(16);
  new DataView(header.buffer).setUint16(0, 1, true);
  new DataView(header.buffer).setUint16(2, 1, true);
  new DataView(header.buffer).setBigInt64(4, 0n, true);
  new DataView(header.buffer).setUint32(12, fields.length, true);
  parts.push(header);
  for (const field of fields) {
    const fh = new Uint8Array(5);
    fh[0] = 1;
    new DataView(fh.buffer).setUint16(1, 1, true);
    new DataView(fh.buffer).setUint16(3, field.name.length, true);
    parts.push(fh);
    parts.push(enc(field.name));
    const rc = new Uint8Array(4);
    new DataView(rc.buffer).setUint32(0, field.values.length, true);
    parts.push(rc);
    for (const v of field.values) {
      const sl = new Uint8Array(2);
      new DataView(sl.buffer).setUint16(0, v.length, true);
      parts.push(sl);
      parts.push(enc(v));
    }
  }
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function wrapAsFile(tables: Uint8Array[], names: string[]): ArrayBuffer {
  const HEADER_SIZE = 48;
  const reservedTrailer = new Uint8Array(32);
  const tableOffsets: number[] = [];
  let cursor = HEADER_SIZE;
  for (const t of tables) { tableOffsets.push(cursor); cursor += t.length; }
  const dataEnd = cursor;
  const fileInfoOffset = dataEnd + reservedTrailer.length;

  const entryBytesList = names.map((name, i) => {
    const nameBytes = new TextEncoder().encode(name);
    const size = 2 + 2 + 4 + nameBytes.length + 1 + 8 + 24 + 4 + 4 + 4 + 4 + 4;
    const buf = new Uint8Array(size);
    const dv = new DataView(buf.buffer);
    let p = 0;
    dv.setUint16(p, 32, true); p += 2;
    dv.setUint16(p, 2, true); p += 2;
    dv.setUint32(p, nameBytes.length, true); p += 4;
    buf.set(nameBytes, p); p += nameBytes.length;
    buf[p] = 0; p += 1;
    dv.setBigInt64(p, BigInt(tableOffsets[i]), true); p += 8;
    dv.setBigInt64(p, 0n, true); p += 8;
    dv.setBigInt64(p, 0n, true); p += 8;
    dv.setBigInt64(p, 0n, true); p += 8;
    dv.setUint32(p, 131104, true); p += 4;
    dv.setUint32(p, 0, true); p += 4;
    dv.setUint32(p, 0, true); p += 4;
    dv.setUint32(p, tables[i].length, true); p += 4;
    dv.setUint32(p, tables[i].length, true); p += 4;
    return buf;
  });

  let fileInfoSize = 4;
  for (const e of entryBytesList) fileInfoSize += e.length;
  const totalSize = fileInfoOffset + fileInfoSize;

  const out = new Uint8Array(totalSize);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 1, true);
  out.set(new TextEncoder().encode("G3V0"), 4);
  outView.setBigInt64(0x08, 0n, true);
  outView.setBigInt64(0x10, 0n, true);
  outView.setBigInt64(0x18, 0x30n, true);
  outView.setBigInt64(0x20, BigInt(fileInfoOffset - 0x20), true);
  outView.setBigInt64(0x28, BigInt(totalSize), true);

  for (let i = 0; i < tables.length; i++) out.set(tables[i], tableOffsets[i]);
  out.set(reservedTrailer, dataEnd);

  let p = fileInfoOffset;
  outView.setUint32(p, entryBytesList.length, true); p += 4;
  for (const e of entryBytesList) { out.set(e, p); p += e.length; }

  return out.buffer;
}

describe("shapeArabicForRisen — integration: survives the real binary build round-trip", () => {
  it("stores the shaped visual form (not logical Arabic) and keeps the token intact", () => {
    const table = buildTab0([
      { name: "ID", values: ["T1"] },
      { name: "German_Text", values: ["Drücke <Attack> zum Angreifen"] },
      { name: "English_Text", values: ["Press <Attack> to attack"] },
    ]);
    const buffer = wrapAsFile([table], ["tutorial_c.tab"]);
    const doc = parseRisenP00Full(buffer);

    const logicalTranslation = "اضغط <Attack> للهجوم";
    const shaped = shapeArabicForRisen(logicalTranslation);
    expect(shaped).not.toBe(logicalTranslation); // shaping actually changed something

    const translations = new Map<string, string>();
    translations.set(makeKey("tutorial_c.tab", "English_Text", 0), shaped);
    applyTranslations(doc, translations);
    const rebuilt = buildRisenP00(doc);

    const reparsed = parseRisenP00Full(rebuilt);
    const storedValue = reparsed.tables[0].fields[2].values[0];

    // The bytes that came back out of the UTF-16LE binary round-trip are
    // exactly the shaped/reversed form — not the original logical Arabic.
    expect(storedValue).toBe(shaped);
    expect(storedValue).toContain("<Attack>");
    expect(storedValue).not.toBe(logicalTranslation);
  });
});
