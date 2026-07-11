import { describe, it, expect } from "vitest";
import {
  parseTpleStringPool, findTpleFloatProperties, applyTpleFloatEdits, spliceFileIntoArchive,
} from "@/lib/risen-tple";

function u16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff];
}

function f32(v: number): number[] {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, v, true);
  return Array.from(new Uint8Array(buf));
}

function poolEntry(name: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(name));
  return [...u16(bytes.length), ...bytes];
}

/** [poolIndex][0x0021][0x001e][0x0004][0x0000][float32 value] — the exact
 * verified 14-byte record layout confirmed against a real PC_Hero.tple. */
function record(poolIndex: number, value: number): number[] {
  return [...u16(poolIndex), ...u16(0x0021), ...u16(0x001e), ...u16(0x0004), ...u16(0x0000), ...f32(value)];
}

function buildTple(records: number[], names: string[], headerPadding = 20): Uint8Array {
  const sentinel = [0xef, 0xbe, 0xad, 0xde];
  const poolHeader = [0x01, 0x52, 0x01, 0x00, 0x00]; // 5 bytes — unknown field + padding, matches confirmed layout
  const pool = names.flatMap(poolEntry);
  return new Uint8Array([...new Array(headerPadding).fill(0), ...records, ...sentinel, ...poolHeader, ...pool]);
}

describe("parseTpleStringPool", () => {
  it("parses length-prefixed ascii names after the sentinel", () => {
    const bytes = buildTple([], ["Foo", "gCCharacterMovement_PS", "ForwardSpeedMax"]);
    expect(parseTpleStringPool(bytes)).toEqual(["Foo", "gCCharacterMovement_PS", "ForwardSpeedMax"]);
  });

  it("throws when no DEADBEEF sentinel is present", () => {
    expect(() => parseTpleStringPool(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});

describe("findTpleFloatProperties", () => {
  it("finds properties matching the exact real record signature and resolves their names", () => {
    const bytes = buildTple(
      [...record(2, 400), ...record(3, 200)],
      ["Foo", "Bar", "ForwardSpeedMax", "TurnSpeedMax"],
    );
    const props = findTpleFloatProperties(bytes);
    expect(props).toHaveLength(2);
    expect(props[0].name).toBe("ForwardSpeedMax");
    expect(props[0].value).toBeCloseTo(400);
    expect(props[1].name).toBe("TurnSpeedMax");
    expect(props[1].value).toBeCloseTo(200);
  });

  it("matches the real confirmed byte pattern for ForwardSpeedMax (idx 0, value 400.0)", () => {
    // Literal bytes captured from the real PC_Hero.tple record (index rewritten
    // to 0 for a minimal fixture; the trailing float bytes `00 00 c8 43` are
    // the exact real bytes, decoding to 400.0).
    const realRecordBytes = [0x00, 0x00, 0x21, 0x00, 0x1e, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc8, 0x43];
    const bytes = buildTple(realRecordBytes, ["ForwardSpeedMax"]);
    const props = findTpleFloatProperties(bytes);
    expect(props).toHaveLength(1);
    expect(props[0].name).toBe("ForwardSpeedMax");
    expect(props[0].value).toBe(400);
  });

  it("ignores records whose pool index is out of range", () => {
    const bytes = buildTple(record(99, 5), ["OnlyOne"]);
    expect(findTpleFloatProperties(bytes)).toEqual([]);
  });

  it("ignores near-matches that don't have all four constant fields", () => {
    const almostRecord = [...u16(0), ...u16(0x0021), ...u16(0x001e), ...u16(0x0005) /* wrong */, ...u16(0), ...f32(1)];
    const bytes = buildTple(almostRecord, ["Foo"]);
    expect(findTpleFloatProperties(bytes)).toEqual([]);
  });

  it("returns an empty array (not a throw) for a file with no sentinel at all", () => {
    expect(findTpleFloatProperties(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe("applyTpleFloatEdits", () => {
  it("patches the value in place without changing the file length", () => {
    const bytes = buildTple(record(0, 400), ["ForwardSpeedMax"]);
    const [prop] = findTpleFloatProperties(bytes);
    const patched = applyTpleFloatEdits(bytes, new Map([[prop.valueOffset, 600]]));
    expect(patched.length).toBe(bytes.length);
    const [patchedProp] = findTpleFloatProperties(patched);
    expect(patchedProp.value).toBeCloseTo(600);
  });

  it("does not mutate the original array", () => {
    const bytes = buildTple(record(0, 400), ["ForwardSpeedMax"]);
    const [prop] = findTpleFloatProperties(bytes);
    applyTpleFloatEdits(bytes, new Map([[prop.valueOffset, 999]]));
    const [origProp] = findTpleFloatProperties(bytes);
    expect(origProp.value).toBeCloseTo(400);
  });
});

describe("spliceFileIntoArchive", () => {
  it("replaces bytes at the given offset with a same-size replacement", () => {
    const archive = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const replacement = new Uint8Array([9, 9, 9]);
    const result = spliceFileIntoArchive(archive, 2, 3, replacement);
    expect(Array.from(result)).toEqual([1, 2, 9, 9, 9, 6, 7, 8]);
  });

  it("does not mutate the original archive", () => {
    const archive = new Uint8Array([1, 2, 3, 4]);
    spliceFileIntoArchive(archive, 0, 2, new Uint8Array([9, 9]));
    expect(Array.from(archive)).toEqual([1, 2, 3, 4]);
  });

  it("throws when the replacement size doesn't match the original entry size", () => {
    const archive = new Uint8Array([1, 2, 3, 4]);
    expect(() => spliceFileIntoArchive(archive, 0, 2, new Uint8Array([9, 9, 9]))).toThrow();
  });

  it("throws when the entry would run past the end of the archive", () => {
    const archive = new Uint8Array([1, 2, 3, 4]);
    expect(() => spliceFileIntoArchive(archive, 3, 5, new Uint8Array(5))).toThrow();
  });
});
