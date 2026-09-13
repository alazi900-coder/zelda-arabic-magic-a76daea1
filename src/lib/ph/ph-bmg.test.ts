import { describe, expect, it } from "vitest";
import { parseBmg, buildBmg, type BmgFile } from "./ph-bmg";

/** Hand-built minimal BMG: header + INF1 (3 entries, two sharing a string)
 * + DAT1 + tiny FLW1/FLI1 passthrough sections, matching the real layout
 * confirmed this session against the actual game's .bmg files. */
function fakeBmg(): Uint8Array {
  const enc = new TextEncoder();
  const strings = ["", "Hello", "World"]; // "" is the reserved leading empty string
  const dat1Body: number[] = [];
  const offsets: number[] = [];
  for (const s of strings) {
    offsets.push(dat1Body.length);
    for (const ch of s) {
      dat1Body.push(ch.charCodeAt(0) & 0xff, (ch.charCodeAt(0) >> 8) & 0xff);
    }
    dat1Body.push(0, 0); // null terminator
  }
  // pad to 4-byte alignment
  while (dat1Body.length % 4 !== 0) dat1Body.push(0);

  // 3 INF1 entries: [Hello, World, Hello] (last one reuses offsets[1])
  const entryOffsets = [offsets[1], offsets[2], offsets[1]];
  const inf1Header = 16;
  const entrySize = 8;
  const inf1Total = inf1Header + entryOffsets.length * entrySize;
  const inf1 = new Uint8Array(inf1Total);
  inf1.set(enc.encode("INF1"), 0);
  const iv = new DataView(inf1.buffer);
  iv.setUint32(4, inf1Total, true);
  iv.setUint16(8, entryOffsets.length, true);
  iv.setUint16(10, entrySize, true);
  entryOffsets.forEach((off, i) => {
    const e = inf1Header + i * entrySize;
    iv.setUint32(e, off, true);
    iv.setUint8(e + 4, 0x00);
    iv.setUint8(e + 5, 0x01);
    iv.setUint8(e + 6, 0x03);
    iv.setUint8(e + 7, 0x00);
  });

  const dat1 = new Uint8Array(8 + dat1Body.length);
  dat1.set(enc.encode("DAT1"), 0);
  new DataView(dat1.buffer).setUint32(4, dat1.length, true);
  dat1.set(dat1Body, 8);

  const flw1 = new Uint8Array(8);
  flw1.set(enc.encode("FLW1"), 0);
  new DataView(flw1.buffer).setUint32(4, 8, true);

  const fli1 = new Uint8Array(8);
  fli1.set(enc.encode("FLI1"), 0);
  new DataView(fli1.buffer).setUint32(4, 8, true);

  const total = 32 + inf1.length + dat1.length + flw1.length + fli1.length;
  const out = new Uint8Array(total);
  out.set(enc.encode("MESGbmg1"), 0);
  const ov = new DataView(out.buffer);
  ov.setUint32(8, total, true);
  ov.setUint32(12, 4, true);
  out[16] = 0x02; // UTF-16 encoding marker
  let o = 32;
  out.set(inf1, o); o += inf1.length;
  out.set(dat1, o); o += dat1.length;
  out.set(flw1, o); o += flw1.length;
  out.set(fli1, o); o += fli1.length;
  return out;
}

describe("ph-bmg", () => {
  it("parses messages, including a shared/deduplicated string", () => {
    const bmg = parseBmg(fakeBmg());
    expect(bmg.messages.map((m) => m.text)).toEqual(["Hello", "World", "Hello"]);
    // entries 0 and 2 shared the same source offset
    expect(bmg.messages[0].offset).toBe(bmg.messages[2].offset);
    expect(bmg.messages.every((m) => !m.hasControlCode)).toBe(true);
  });

  it("round-trips unchanged (no replacements) byte-for-byte in content", () => {
    const bmg = parseBmg(fakeBmg());
    const rebuilt = buildBmg(bmg, new Map());
    const reparsed = parseBmg(rebuilt);
    expect(reparsed.messages.map((m) => m.text)).toEqual(bmg.messages.map((m) => m.text));
  });

  it("replaces only the targeted entries, leaving the rest untouched", () => {
    const bmg = parseBmg(fakeBmg());
    const rebuilt = buildBmg(bmg, new Map([[1, "مرحباً"]]));
    const reparsed = parseBmg(rebuilt);
    expect(reparsed.messages.map((m) => m.text)).toEqual(["Hello", "مرحباً", "Hello"]);
  });

  it("detects a BMG escape control code and flags the message instead of silently keeping it editable", () => {
    const bmg = fakeBmgLike([`${String.fromCharCode(0x1a)}name text`, "Plain"]);
    const parsed = parseBmg(bmg);
    expect(parsed.messages[0].hasControlCode).toBe(true);
    expect(parsed.messages[1].hasControlCode).toBe(false);
  });

  it("rejects a buffer that isn't a BMG file", () => {
    expect(() => parseBmg(new Uint8Array(40))).toThrow();
  });
});

/** Same shape as fakeBmg() but with caller-supplied strings, for the control-code test. */
function fakeBmgLike(strings: string[]): Uint8Array {
  const enc = new TextEncoder();
  const all = ["", ...strings];
  const dat1Body: number[] = [];
  const offsets: number[] = [];
  for (const s of all) {
    offsets.push(dat1Body.length);
    for (const ch of s) {
      dat1Body.push(ch.charCodeAt(0) & 0xff, (ch.charCodeAt(0) >> 8) & 0xff);
    }
    dat1Body.push(0, 0);
  }
  while (dat1Body.length % 4 !== 0) dat1Body.push(0);

  const entryOffsets = offsets.slice(1);
  const inf1Header = 16;
  const entrySize = 8;
  const inf1Total = inf1Header + entryOffsets.length * entrySize;
  const inf1 = new Uint8Array(inf1Total);
  inf1.set(enc.encode("INF1"), 0);
  const iv = new DataView(inf1.buffer);
  iv.setUint32(4, inf1Total, true);
  iv.setUint16(8, entryOffsets.length, true);
  iv.setUint16(10, entrySize, true);
  entryOffsets.forEach((off, i) => {
    const e = inf1Header + i * entrySize;
    iv.setUint32(e, off, true);
  });

  const dat1 = new Uint8Array(8 + dat1Body.length);
  dat1.set(enc.encode("DAT1"), 0);
  new DataView(dat1.buffer).setUint32(4, dat1.length, true);
  dat1.set(dat1Body, 8);

  const total = 32 + inf1.length + dat1.length;
  const out = new Uint8Array(total);
  out.set(enc.encode("MESGbmg1"), 0);
  const ov = new DataView(out.buffer);
  ov.setUint32(8, total, true);
  ov.setUint32(12, 2, true);
  out[16] = 0x02;
  let o = 32;
  out.set(inf1, o); o += inf1.length;
  out.set(dat1, o); o += dat1.length;
  return out;
}
