import { describe, it, expect } from "vitest";
import {
  parseTpleStringPool, findTpleFloatProperties, applyTpleFloatEdits,
  findTpleBoolProperties, applyTpleBoolEdits, findTpleIntProperties, applyTpleIntEdits,
  findTpleEnumProperties, applyTpleEnumEdits, resolveTplePropertyInfo,
  spliceFileIntoArchive, spliceMultipleFilesIntoArchive,
  buildTpleBatchIndex,
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

/** [poolIndex][0x0018][0x001e][0x0001][0x0000][uint8 value] — the exact
 * verified 11-byte bool record layout, confirmed against 25 independent
 * records in a real PC_Hero.tple. */
function boolRecord(poolIndex: number, value: boolean): number[] {
  return [...u16(poolIndex), ...u16(0x0018), ...u16(0x001e), ...u16(0x0001), ...u16(0x0000), value ? 1 : 0];
}

function i16(v: number): number[] {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setInt16(0, v, true);
  return Array.from(new Uint8Array(buf));
}

function i32(v: number): number[] {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setInt32(0, v, true);
  return Array.from(new Uint8Array(buf));
}

/** [propIdx][typeIdx][0x001e][size][0x0000][intN value] — the exact verified
 * int record layout (type resolved via a pool-index reference to "short"/
 * "int"/"long", not a fixed constant), confirmed against 11 independent
 * records in a real PC_Hero.tple. */
function intRecord(propIdx: number, typeIdx: number, size: 2 | 4, value: number): number[] {
  return [...u16(propIdx), ...u16(typeIdx), ...u16(0x001e), ...u16(size), ...u16(0x0000), ...(size === 2 ? i16(value) : i32(value))];
}

/** [propIdx][typeIdx][0x001e][0x0006][0x0000][0xC9,0x00,ordinal,0x00,0x00,0x00]
 * — the exact verified enum record layout (typeIdx resolving to a
 * "bTPropertyContainer<enum X>" pool string), confirmed against real
 * gCModifySkill entries (rings/armor) and hundreds of DamageType/Category
 * samples across the full real archive. */
function enumRecord(propIdx: number, typeIdx: number, ordinal: number): number[] {
  return [...u16(propIdx), ...u16(typeIdx), ...u16(0x001e), ...u16(6), ...u16(0x0000), 0xc9, 0x00, ordinal, 0x00, 0x00, 0x00];
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

  it("treats a zero-length entry as a legitimate empty string, not end-of-pool (regression: a real file's default-empty bCString value was silently truncating the pool at 142/338 names)", () => {
    const bytes = buildTple([], ["Voice", "bCString", "Player", "RoleDescription", "", "Gender"]);
    expect(parseTpleStringPool(bytes)).toEqual(["Voice", "bCString", "Player", "RoleDescription", "", "Gender"]);
  });

  it("still stops on a genuinely corrupt/oversized length", () => {
    const bytes = buildTple([], ["Foo"]);
    // Append a trailing oversized length prefix past the real pool — must not be read as a valid entry.
    const withGarbage = new Uint8Array([...bytes, 0xff, 0xff]);
    expect(parseTpleStringPool(withGarbage)).toEqual(["Foo"]);
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

  it("regression: resolves a property whose pool index comes AFTER an empty-string entry (previously silently dropped)", () => {
    const bytes = buildTple(
      record(4, 999),
      ["Voice", "bCString", "Player", "RoleDescription", "", "SaleModifier"],
    );
    const props = findTpleFloatProperties(bytes);
    expect(props).toHaveLength(1);
    expect(props[0].name).toBe("");
    // Also confirm a property named AFTER the empty entry resolves correctly.
    const bytes2 = buildTple(record(5, 0.2), ["Voice", "bCString", "Player", "RoleDescription", "", "SaleModifier"]);
    const props2 = findTpleFloatProperties(bytes2);
    expect(props2[0].name).toBe("SaleModifier");
    expect(props2[0].value).toBeCloseTo(0.2);
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

describe("findTpleBoolProperties", () => {
  it("finds properties matching the exact real bool signature and resolves their names", () => {
    const bytes = buildTple(
      [...boolRecord(2, true), ...boolRecord(3, false)],
      ["Foo", "Bar", "PhysicsEnabled", "IsClimbable"],
    );
    const props = findTpleBoolProperties(bytes);
    expect(props).toHaveLength(2);
    expect(props[0]).toMatchObject({ name: "PhysicsEnabled", value: true });
    expect(props[1]).toMatchObject({ name: "IsClimbable", value: false });
  });

  it("matches the real confirmed byte pattern for PhysicsEnabled (idx 0, value true)", () => {
    // Literal bytes captured from the real PC_Hero.tple record (index
    // rewritten to 0 for a minimal fixture): 31 00 18 00 1e 00 01 00 00 00 01
    const realRecordBytes = [0x00, 0x00, 0x18, 0x00, 0x1e, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01];
    const bytes = buildTple(realRecordBytes, ["PhysicsEnabled"]);
    const props = findTpleBoolProperties(bytes);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ name: "PhysicsEnabled", value: true });
  });

  it("does not confuse bool records with float records (different signatures, no collision)", () => {
    const bytes = buildTple(
      [...record(0, 400), ...boolRecord(1, true)],
      ["ForwardSpeedMax", "PhysicsEnabled"],
    );
    expect(findTpleFloatProperties(bytes)).toHaveLength(1);
    expect(findTpleBoolProperties(bytes)).toHaveLength(1);
  });

  it("ignores records whose pool index is out of range", () => {
    const bytes = buildTple(boolRecord(99, true), ["OnlyOne"]);
    expect(findTpleBoolProperties(bytes)).toEqual([]);
  });

  it("returns an empty array (not a throw) for a file with no sentinel at all", () => {
    expect(findTpleBoolProperties(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe("applyTpleBoolEdits", () => {
  it("patches the value in place without changing the file length", () => {
    const bytes = buildTple(boolRecord(0, false), ["PhysicsEnabled"]);
    const [prop] = findTpleBoolProperties(bytes);
    const patched = applyTpleBoolEdits(bytes, new Map([[prop.valueOffset, true]]));
    expect(patched.length).toBe(bytes.length);
    const [patchedProp] = findTpleBoolProperties(patched);
    expect(patchedProp.value).toBe(true);
  });

  it("does not mutate the original array", () => {
    const bytes = buildTple(boolRecord(0, false), ["PhysicsEnabled"]);
    const [prop] = findTpleBoolProperties(bytes);
    applyTpleBoolEdits(bytes, new Map([[prop.valueOffset, true]]));
    const [origProp] = findTpleBoolProperties(bytes);
    expect(origProp.value).toBe(false);
  });
});

describe("findTpleIntProperties", () => {
  it("finds a 'short' (2-byte) property and resolves its name and type", () => {
    const bytes = buildTple(intRecord(0, 1, 2, 74), ["FileVersion", "short"]);
    const props = findTpleIntProperties(bytes);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ name: "FileVersion", typeName: "short", size: 2, value: 74 });
  });

  it("matches the real confirmed byte pattern for FileVersion (idx 0/1, value 74)", () => {
    // Literal bytes captured from the real PC_Hero.tple record (indices
    // rewritten to 0/1 for a minimal fixture): 4c 00 4d 00 1e 00 02 00 00 00 4a 00
    const realRecordBytes = [0x00, 0x00, 0x01, 0x00, 0x1e, 0x00, 0x02, 0x00, 0x00, 0x00, 0x4a, 0x00];
    const bytes = buildTple(realRecordBytes, ["FileVersion", "short"]);
    const props = findTpleIntProperties(bytes);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ name: "FileVersion", value: 74 });
  });

  it("finds 4-byte 'int' and 'long' properties with correct width and value", () => {
    const bytes = buildTple(
      [...intRecord(0, 1, 4, 42), ...intRecord(2, 3, 4, -5)],
      ["InteractionCounter", "int", "CurrentRoutine", "long"],
    );
    const props = findTpleIntProperties(bytes);
    expect(props).toHaveLength(2);
    expect(props[0]).toMatchObject({ name: "InteractionCounter", typeName: "int", size: 4, value: 42 });
    expect(props[1]).toMatchObject({ name: "CurrentRoutine", typeName: "long", size: 4, value: -5 });
  });

  it("rejects a record whose type index does NOT resolve to a known integer type name", () => {
    const bytes = buildTple(intRecord(0, 1, 2, 74), ["FileVersion", "NotARealType"]);
    expect(findTpleIntProperties(bytes)).toEqual([]);
  });

  it("rejects a record whose size doesn't match the width its type name implies", () => {
    // Claims type "short" (should be 2 bytes) but declares size=4 — inconsistent, must be rejected.
    const bad = [...u16(0), ...u16(1), ...u16(0x001e), ...u16(4), ...u16(0), ...i32(74)];
    const bytes = buildTple(bad, ["FileVersion", "short"]);
    expect(findTpleIntProperties(bytes)).toEqual([]);
  });

  it("does not confuse int records with float/bool records (independent signatures, no collision)", () => {
    const bytes = buildTple(
      [...record(0, 400), ...boolRecord(1, true), ...intRecord(2, 3, 2, 74)],
      ["ForwardSpeedMax", "PhysicsEnabled", "FileVersion", "short"],
    );
    expect(findTpleFloatProperties(bytes)).toHaveLength(1);
    expect(findTpleBoolProperties(bytes)).toHaveLength(1);
    expect(findTpleIntProperties(bytes)).toHaveLength(1);
  });

  it("returns an empty array (not a throw) for a file with no sentinel at all", () => {
    expect(findTpleIntProperties(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe("applyTpleIntEdits", () => {
  it("patches a 2-byte ('short') value in place without changing the file length", () => {
    const bytes = buildTple(intRecord(0, 1, 2, 74), ["FileVersion", "short"]);
    const [prop] = findTpleIntProperties(bytes);
    const patched = applyTpleIntEdits(bytes, new Map([[prop.valueOffset, { value: 99, size: 2 }]]));
    expect(patched.length).toBe(bytes.length);
    const [patchedProp] = findTpleIntProperties(patched);
    expect(patchedProp.value).toBe(99);
  });

  it("patches a 4-byte ('int'/'long') value in place, including negative numbers", () => {
    const bytes = buildTple(intRecord(0, 1, 4, 42), ["InteractionCounter", "int"]);
    const [prop] = findTpleIntProperties(bytes);
    const patched = applyTpleIntEdits(bytes, new Map([[prop.valueOffset, { value: -12345, size: 4 }]]));
    const [patchedProp] = findTpleIntProperties(patched);
    expect(patchedProp.value).toBe(-12345);
  });

  it("does not mutate the original array", () => {
    const bytes = buildTple(intRecord(0, 1, 2, 74), ["FileVersion", "short"]);
    const [prop] = findTpleIntProperties(bytes);
    applyTpleIntEdits(bytes, new Map([[prop.valueOffset, { value: 1, size: 2 }]]));
    const [origProp] = findTpleIntProperties(bytes);
    expect(origProp.value).toBe(74);
  });
});

describe("findTpleEnumProperties", () => {
  it("finds an enum property and resolves its name, type, and ordinal", () => {
    const bytes = buildTple(enumRecord(0, 1, 2), ["Category", "bTPropertyContainer<enum gEItemCategory>"]);
    const props = findTpleEnumProperties(bytes);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ name: "Category", typeName: "bTPropertyContainer<enum gEItemCategory>", value: 2 });
  });

  it("matches the real confirmed byte pattern for a ring's Skill modifier (ordinal 7 = Strength)", () => {
    // Literal bytes captured from a real ring's ModifySkills entry.
    const realRecordBytes = [0x00, 0x00, 0x01, 0x00, 0x1e, 0x00, 0x06, 0x00, 0x00, 0x00, 0xc9, 0x00, 0x07, 0x00, 0x00, 0x00];
    const bytes = buildTple(realRecordBytes, ["Skill", "bTPropertyContainer<enum gESkill>"]);
    const props = findTpleEnumProperties(bytes);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ name: "Skill", value: 7 });
  });

  it("rejects a record whose type index does NOT resolve to a bTPropertyContainer<enum...> name", () => {
    const bytes = buildTple(enumRecord(0, 1, 2), ["Category", "NotAnEnumType"]);
    expect(findTpleEnumProperties(bytes)).toEqual([]);
  });

  it("rejects a record whose value bytes don't match the known constant shape exactly", () => {
    // Same header, but byte[1] of the value is 0x05 instead of the required 0x00.
    const bad = [...u16(0), ...u16(1), ...u16(0x001e), ...u16(6), ...u16(0), 0xc9, 0x05, 0x02, 0x00, 0x00, 0x00];
    const bytes = buildTple(bad, ["Category", "bTPropertyContainer<enum gEItemCategory>"]);
    expect(findTpleEnumProperties(bytes)).toEqual([]);
  });

  it("does not confuse enum records with int records (independent signatures, no collision)", () => {
    const bytes = buildTple(
      [...intRecord(0, 1, 2, 74), ...enumRecord(2, 3, 2)],
      ["FileVersion", "short", "Category", "bTPropertyContainer<enum gEItemCategory>"],
    );
    expect(findTpleIntProperties(bytes)).toHaveLength(1);
    expect(findTpleEnumProperties(bytes)).toHaveLength(1);
  });

  it("returns an empty array (not a throw) for a file with no sentinel at all", () => {
    expect(findTpleEnumProperties(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe("applyTpleEnumEdits", () => {
  it("patches only the ordinal byte, leaving the rest of the 6-byte value slot untouched", () => {
    const bytes = buildTple(enumRecord(0, 1, 2), ["Category", "bTPropertyContainer<enum gEItemCategory>"]);
    const [prop] = findTpleEnumProperties(bytes);
    const patched = applyTpleEnumEdits(bytes, new Map([[prop.valueOffset, 7]]));
    expect(patched.length).toBe(bytes.length);
    const [patchedProp] = findTpleEnumProperties(patched);
    expect(patchedProp.value).toBe(7);
  });

  it("does not mutate the original array", () => {
    const bytes = buildTple(enumRecord(0, 1, 2), ["Category", "bTPropertyContainer<enum gEItemCategory>"]);
    const [prop] = findTpleEnumProperties(bytes);
    applyTpleEnumEdits(bytes, new Map([[prop.valueOffset, 9]]));
    const [origProp] = findTpleEnumProperties(bytes);
    expect(origProp.value).toBe(2);
  });
});

describe("resolveTplePropertyInfo", () => {
  it("prefers a composite (name+type) entry over the plain name when both could match", () => {
    const info = resolveTplePropertyInfo("Status", "bTPropertyContainer<enum gELockStatus>");
    expect(info?.label).toBe("حالة القفل");
  });

  it("falls back to a plain name lookup when no composite entry exists for that type", () => {
    // "Status" is documented only for gELockStatus — a different real type
    // (e.g. gEDoorStatus) must not silently inherit the lock's description.
    const info = resolveTplePropertyInfo("Status", "bTPropertyContainer<enum gEDoorStatus>");
    expect(info).toBeUndefined();
  });

  it("falls back to a plain name lookup when no typeName is given", () => {
    const info = resolveTplePropertyInfo("DamageType", undefined);
    expect(info?.label).toBe("نوع الضرر");
  });

  it("resolves an unambiguous name (single real type across the archive) regardless of composite keys", () => {
    const info = resolveTplePropertyInfo("Gender", "bTPropertyContainer<enum gEGender>");
    expect(info?.label).toBe("الجنس");
  });

  it("documents Guild, FightAIMode, GuardStatus, AttitudeLock (gCNPC_PS)", () => {
    expect(resolveTplePropertyInfo("Guild")?.label).toBe("الانتماء/الفصيل");
    expect(resolveTplePropertyInfo("FightAIMode")?.label).toBe("نمط الذكاء الاصطناعي القتالي");
    expect(resolveTplePropertyInfo("GuardStatus")?.label).toBe("حالة الحراسة");
    expect(resolveTplePropertyInfo("AttitudeLock")?.label).toBe("قفل الموقف");
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

describe("spliceMultipleFilesIntoArchive", () => {
  it("applies several non-overlapping replacements in one pass", () => {
    const archive = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const result = spliceMultipleFilesIntoArchive(archive, [
      { offset: 1, size: 2, bytes: new Uint8Array([11, 12]) },
      { offset: 7, size: 3, bytes: new Uint8Array([13, 14, 15]) },
    ]);
    expect(Array.from(result)).toEqual([1, 11, 12, 4, 5, 6, 7, 13, 14, 15]);
  });

  it("does not mutate the original archive", () => {
    const archive = new Uint8Array([1, 2, 3, 4]);
    spliceMultipleFilesIntoArchive(archive, [{ offset: 0, size: 2, bytes: new Uint8Array([9, 9]) }]);
    expect(Array.from(archive)).toEqual([1, 2, 3, 4]);
  });

  it("returns an unmodified copy when given an empty replacement list", () => {
    const archive = new Uint8Array([1, 2, 3]);
    expect(Array.from(spliceMultipleFilesIntoArchive(archive, []))).toEqual([1, 2, 3]);
  });

  it("throws without applying ANY replacement if one of several is invalid (all-or-nothing)", () => {
    const archive = new Uint8Array([1, 2, 3, 4, 5, 6]);
    expect(() => spliceMultipleFilesIntoArchive(archive, [
      { offset: 0, size: 2, bytes: new Uint8Array([9, 9]) },
      { offset: 4, size: 2, bytes: new Uint8Array([9, 9, 9]) }, // wrong size
    ])).toThrow();
    // The archive itself is untouched (spliceMultipleFilesIntoArchive never
    // mutates its input), and since it throws, no copy is even returned.
    expect(Array.from(archive)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("spliceFileIntoArchive (single-replacement) still behaves identically after refactor", () => {
    const archive = new Uint8Array([1, 2, 3, 4, 5]);
    const result = spliceFileIntoArchive(archive, 1, 2, new Uint8Array([8, 8]));
    expect(Array.from(result)).toEqual([1, 8, 8, 4, 5]);
  });
});

describe("buildTpleBatchIndex", () => {
  it("groups a property's occurrences across multiple files by name", () => {
    const fileA = buildTple(record(0, 400), ["ForwardSpeedMax"]);
    const fileB = buildTple(record(0, 600), ["ForwardSpeedMax"]);
    const index = buildTpleBatchIndex([
      { path: "NPC/A.tple", bytes: fileA },
      { path: "NPC/B.tple", bytes: fileB },
    ]);
    const occ = index.get("ForwardSpeedMax");
    expect(occ).toHaveLength(2);
    expect(occ?.[0]).toMatchObject({ path: "NPC/A.tple", kind: "float", value: 400 });
    expect(occ?.[1]).toMatchObject({ path: "NPC/B.tple", kind: "float", value: 600 });
  });

  it("groups both float and bool properties, keyed separately by name", () => {
    const fileA = buildTple([...record(0, 400), ...boolRecord(1, true)], ["ForwardSpeedMax", "PhysicsEnabled"]);
    const [floatProp] = findTpleFloatProperties(fileA);
    const [boolProp] = findTpleBoolProperties(fileA);
    const index = buildTpleBatchIndex([{ path: "A.tple", bytes: fileA }]);
    expect(index.get("ForwardSpeedMax")).toEqual([{ path: "A.tple", kind: "float", valueOffset: floatProp.valueOffset, value: 400 }]);
    expect(index.get("PhysicsEnabled")).toEqual([{ path: "A.tple", kind: "bool", valueOffset: boolProp.valueOffset, value: true }]);
  });

  it("includes int properties, carrying their byte width for later edits", () => {
    const fileA = buildTple(intRecord(0, 1, 2, 74), ["FileVersion", "short"]);
    const [intProp] = findTpleIntProperties(fileA);
    const index = buildTpleBatchIndex([{ path: "A.tple", bytes: fileA }]);
    expect(index.get("FileVersion")).toEqual([{ path: "A.tple", kind: "int", valueOffset: intProp.valueOffset, value: 74, size: 2 }]);
  });

  it("only lists a property under files that actually contain it", () => {
    const fileA = buildTple(record(0, 400), ["ForwardSpeedMax"]);
    const fileB = buildTple([], ["SomethingElse"]);
    const index = buildTpleBatchIndex([
      { path: "A.tple", bytes: fileA },
      { path: "B.tple", bytes: fileB },
    ]);
    expect(index.get("ForwardSpeedMax")).toHaveLength(1);
    expect(index.has("SomethingElse")).toBe(false);
  });

  it("returns an empty map for an empty file list", () => {
    expect(buildTpleBatchIndex([]).size).toBe(0);
  });

  it("ignores files with no recognized properties without throwing", () => {
    const notATple = new Uint8Array([1, 2, 3]);
    expect(() => buildTpleBatchIndex([{ path: "bad.tple", bytes: notATple }])).not.toThrow();
    expect(buildTpleBatchIndex([{ path: "bad.tple", bytes: notATple }]).size).toBe(0);
  });
});
