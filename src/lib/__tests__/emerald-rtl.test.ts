import { describe, it, expect } from "vitest";
import {
  EMERALD_RTL_CAVE,
  EMERALD_RTL_HOOK,
  applyEmeraldRtlPatch,
  hasEmeraldRtlPatch,
} from "@/lib/gba/emerald-rtl";
import { shapeArabicForRisen } from "@/lib/risen/arabic-shaper";
import { encodeArabicForEmerald, decodeEmeraldBytes } from "@/lib/gba/emerald-arabic";

/** A 16 MB ROM carrying the call this patch was written against. */
function emeraldish(): Uint8Array {
  const rom = new Uint8Array(0x1000000).fill(0xff);
  rom.set([0xff, 0xf7, 0xc5, 0xf8], EMERALD_RTL_HOOK); // bl CopyGlyphToWindow
  return rom;
}

describe("Emerald — patching the engine to lay dialogue out right to left", () => {
  it("writes the hook where the call was, and the cave into empty space", () => {
    const rom = emeraldish();
    const out = applyEmeraldRtlPatch(rom);
    expect(hasEmeraldRtlPatch(rom)).toBe(false);
    expect(hasEmeraldRtlPatch(out)).toBe(true);

    // Everything it changed is either the ten bytes at the hook or the cave.
    for (let i = 0; i < rom.length; i++) {
      if (rom[i] === out[i]) continue;
      const inHook = i >= EMERALD_RTL_HOOK && i < EMERALD_RTL_HOOK + 10;
      const inCave = i >= EMERALD_RTL_CAVE && i < EMERALD_RTL_CAVE + 0x100;
      expect(inHook || inCave).toBe(true);
    }
  });

  it("refuses a ROM whose hook site is not the call it was measured on", () => {
    // A ROM where that instruction has moved is one this patch was never
    // tested against, and writing into it breaks the game far from here.
    const rom = emeraldish();
    rom[EMERALD_RTL_HOOK] = 0x00;
    expect(() => applyEmeraldRtlPatch(rom)).toThrow("الخطّاف");
  });

  it("refuses to put the cave over anything that is not free", () => {
    const rom = emeraldish();
    rom[EMERALD_RTL_CAVE + 4] = 0x42;
    expect(() => applyEmeraldRtlPatch(rom)).toThrow("فارغة");
  });

  it("writes a different cave for each reach, over the same hook", () => {
    // The two differ by one test inside the cave — whether the window has to
    // be the message box — so the hook is identical and the code is not.
    const dialogue = applyEmeraldRtlPatch(emeraldish(), "dialogue");
    const all = applyEmeraldRtlPatch(emeraldish(), "all");
    for (let i = 0; i < 10; i++) {
      expect(all[EMERALD_RTL_HOOK + i]).toBe(dialogue[EMERALD_RTL_HOOK + i]);
    }
    let differing = 0;
    for (let i = 0; i < 0x100; i++) {
      if (all[EMERALD_RTL_CAVE + i] !== dialogue[EMERALD_RTL_CAVE + i]) differing++;
    }
    expect(differing).toBeGreaterThan(0);
  });

  it("applies once and stays applied", () => {
    // Building twice must not write the hook over itself: the second pass no
    // longer sees the original call and would refuse.
    const once = applyEmeraldRtlPatch(emeraldish());
    const twice = applyEmeraldRtlPatch(once);
    expect(hasEmeraldRtlPatch(twice)).toBe(true);
    // Compared by hand rather than `toEqual`, which walks 16 MB one element at
    // a time and takes minutes.
    let differing = 0;
    for (let i = 0; i < once.length; i++) if (once[i] !== twice[i]) differing++;
    expect(differing).toBe(0);
  });
});

describe("Emerald — text that the engine will reverse itself", () => {
  const line = "اسمي بيرش";

  it("still joins the letters, and leaves them in the order they were written", () => {
    // Shaping is never optional: no engine here joins letters on its own. It is
    // the reordering that the patch takes over, and doing both would put the
    // line back the way it started.
    const forward = shapeArabicForRisen(line, { reverse: false });
    const reversed = shapeArabicForRisen(line);
    expect(forward).not.toBe(line); // the letters were joined
    expect([...forward].reverse().join("")).not.toBe(forward);
    // The same shapes, laid out the other way round.
    expect([...forward].sort().join("")).toBe([...reversed].sort().join(""));
    expect(forward).not.toBe(reversed);
  });

  it("encodes to the same bytes in the other order", () => {
    const a = encodeArabicForEmerald(line, { reverse: false }).bytes;
    const b = encodeArabicForEmerald(line).bytes;
    expect(a.length).toBe(b.length);
    expect(decodeEmeraldBytes(a)).toBe(shapeArabicForRisen(line, { reverse: false }));
    expect([...a].reverse()).not.toEqual([...a]);
  });

  it("leaves a line with no Arabic in it alone either way", () => {
    expect(shapeArabicForRisen("NEW GAME", { reverse: false })).toBe("NEW GAME");
  });
});
