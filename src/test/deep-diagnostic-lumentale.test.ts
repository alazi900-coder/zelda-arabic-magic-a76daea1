import { describe, expect, it } from "vitest";
import { detectIssues } from "@/components/editor/DeepDiagnosticPanel";
import type { ExtractedEntry } from "@/components/editor/types";

const REPORT_TOKENS = [
  "[USERNAME]", "[Q_RESULT]", "[Q_ATTR_RESULT]", "[MVP1]", "[MVP2]", "[MVP3]", "[int:GUID]",
  "{0}", "{1}", "{target}", "{Enemy}", "{2}", "{0.name}", "{0.Nickname}", "{1.LocalizedSpecies}", "{Starter}",
  "<pause=0.3>", "<h>", "</h>", "<pause=1>", "<pause=0.5>", "</i>", "<i>", "<action=shake>", "</color>",
  "<color=#ec691d>", "<align=center>", "<pause=0.2>", "<rotate=\"-10\">", "</rotate>", "<b>", "</b>", "</align>",
  "<sprite=\"TP_Icon\" index=0 tint=1>", "<pause=2>", "<pause=0.8>", "<pause=0.1>", "<pause=.5>", "<pause=0.6>",
  "</material>", "<pause=0.75>", "<pause=.6>", "<pause=.4>", "<material=\"Barlow-SemiCondensed/BarlowSemiCondensed-Medium SDF Material Outline\">",
  "<pause=0.4>", "<pause=.2>", "<action=rumble>", "<pause=0.7>", "<sprite=\"Weakness\" index=0 tint=1>",
  "<action=strongrumble>", "<repeat=3,3>", "<action=SwitchHUD-RefOnly>", "<action=SelPause>", "<pause=.3>", "<action=Launch>",
  "<color=#6386C0>", "<color=#FFD800>", "<color=#ffed7a>", "<material=\"Chakra Petch/ChakraPetch-Medium SDF Material Outlined\">",
  "<color=red>", "<pause=5>", "<sprite=\"Resist\" index=0 tint=1>", "<action=ToggleSkillInfos>", "<pause=.8>", "<pause=3>",
  "<voffset=-44>", "</voffset>", "<color=#6fff00>", "<color=#00e5ff>", "<color=#fc3903>", "<color=#9000ff>", "<color=#c3e3e3>",
  "<page>", "<pause=.1>",
] as const;

function makeEntry(original: string): ExtractedEntry {
  return { msbtFile: "lumentale/UI_en", index: 1, label: "LumenTale", original, maxBytes: 0 } as ExtractedEntry;
}

describe("LumenTale deep diagnostic technical-token coverage", () => {
  it("marks deletion and reordered report tokens as critical", () => {
    expect(REPORT_TOKENS).toHaveLength(74);

    for (const token of REPORT_TOKENS) {
      const companion = token === "</h>" ? "<h>" : "</h>";
      const original = `قبل ${token} بعد ${companion}`;
      const missing = detectIssues(makeEntry(original), `قبل  بعد ${companion}`);
      const reordered = detectIssues(makeEntry(original), `قبل ${companion} بعد ${token}`);

      expect(missing.some(issue => issue.severity === "critical"), `missing ${token}`).toBe(true);
      expect(reordered.some(issue => issue.severity === "critical"), `reordered ${token}`).toBe(true);
      expect(detectIssues(makeEntry(original), original).some(issue => issue.category === "technical_mismatch" || issue.category === "tag_order_mismatch"), `exact ${token}`).toBe(false);
    }
  });
});
