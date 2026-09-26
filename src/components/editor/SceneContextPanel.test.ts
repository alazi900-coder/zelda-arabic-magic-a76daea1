import { describe, it, expect } from "vitest";
import { sceneGroupKey, isXenobladeFile } from "./SceneContextPanel";
import type { ExtractedEntry } from "./types";

const entry = (over: Partial<ExtractedEntry>): ExtractedEntry => ({
  msbtFile: "x", index: 0, label: "", original: "", maxBytes: 0, ...over,
});

describe("sceneGroupKey", () => {
  it("groups Fran Bow rows by their own context, not the index-bearing msbtFile", () => {
    const a = entry({ msbtFile: "franbow/fb-dialogue/7", index: 7, franBowContext: "ItherstaBookPage1" });
    const b = entry({ msbtFile: "franbow/fb-dialogue/8", index: 8, franBowContext: "ItherstaBookPage1" });
    const c = entry({ msbtFile: "franbow/fb-dialogue/9", index: 9, franBowContext: "ItherstaBookPage2" });
    expect(sceneGroupKey(a)).toBe(sceneGroupKey(b));
    expect(sceneGroupKey(a)).not.toBe(sceneGroupKey(c));
  });

  it("groups 9th Dawn / Crashlands rows by category, stripping the trailing per-row index", () => {
    const a = entry({ msbtFile: "ninthdawn/Dialogue/3", index: 3 });
    const b = entry({ msbtFile: "ninthdawn/Dialogue/4", index: 4 });
    const c = entry({ msbtFile: "ninthdawn/Quest/5", index: 5 });
    expect(sceneGroupKey(a)).toBe(sceneGroupKey(b));
    expect(sceneGroupKey(a)).not.toBe(sceneGroupKey(c));
  });

  it("keeps a real shared-file game (one msbtFile, many rows) grouped by that file", () => {
    const a = entry({ msbtFile: "ph/English/Message/system.bmg", index: 5 });
    const b = entry({ msbtFile: "ph/English/Message/system.bmg", index: 6 });
    expect(sceneGroupKey(a)).toBe(sceneGroupKey(b));
    expect(sceneGroupKey(a)).toBe(a.msbtFile);
  });

  it("does not fold two rows together just because both happen to be index 0", () => {
    const a = entry({ msbtFile: "franbow/fb-menu/0", index: 0 });
    const b = entry({ msbtFile: "ninthdawn/Generic/0", index: 0 });
    expect(sceneGroupKey(a)).not.toBe(sceneGroupKey(b));
  });
});

describe("isXenobladeFile", () => {
  it("is true only for the bdat-bin: shape, not any msbtFile with a colon", () => {
    expect(isXenobladeFile("bdat-bin:message.bdat:MSG_System:5:0")).toBe(true);
    expect(isXenobladeFile("franbow/fb-dialogue/7")).toBe(false);
    expect(isXenobladeFile("ninthdawn/Dialogue/3")).toBe(false);
    expect(isXenobladeFile("crashlands/Dialogue/1")).toBe(false);
  });
});
