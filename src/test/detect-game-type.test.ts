import { describe, it, expect } from "vitest";
import { detectGameType } from "@/hooks/useEditorBuild";
import type { ExtractedEntry } from "@/components/editor/types";

function entry(msbtFile: string): ExtractedEntry {
  return { msbtFile, index: 0, label: "", original: "text", maxBytes: 0 };
}

describe("detectGameType — handleBuild routing", () => {
  it("returns 'unknown' for an empty entry set instead of silently guessing", () => {
    expect(detectGameType([])).toBe("unknown");
  });

  it("detects Risen 1 sessions from the .tab msbtFile convention", () => {
    expect(detectGameType([entry("infos.tab")])).toBe("risen");
    expect(detectGameType([entry("Infos.TAB")])).toBe("risen");
  });

  it("detects Xenoblade/BDAT sessions (anything not .tab)", () => {
    expect(detectGameType([entry("system.msbt")])).toBe("xenoblade");
    expect(detectGameType([entry("bdat-bin:sample.bdat:0")])).toBe("xenoblade");
  });

  it("decides from the first loaded entry only (one game per session)", () => {
    expect(detectGameType([entry("infos.tab"), entry("system.msbt")])).toBe("risen");
  });
});
