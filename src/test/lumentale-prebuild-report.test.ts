import type { ExtractedEntry } from "@/components/editor/types";
import type { LumenTaleBundleMeta } from "@/lib/lumentale/lumentale-editor-bridge";
import { createLumenTalePreBuildReport } from "@/lib/lumentale/lumentale-prebuild-report";

const meta: LumenTaleBundleMeta = {
  originalName: "Localization_en.bundle",
  tables: [{
    asset: "Assets/Localization/Tables/Menu",
    table: "Menu",
    pathId: "42",
    rowCount: 2,
    rows: [
      { editorKey: "lumentale/Menu:0", rowIndex: 0, m_Id: "100" },
      { editorKey: "lumentale/Menu:1", rowIndex: 1, m_Id: "101" },
    ],
  }],
};

const entries: ExtractedEntry[] = [
  { msbtFile: "lumentale/Menu", index: 0, label: "Menu · m_Id 100", original: "Play {player}", maxBytes: 1_000_000, risen3Cat: "lumentale-general" },
  { msbtFile: "lumentale/Menu", index: 1, label: "Menu · m_Id 101", original: "Exit", maxBytes: 1_000_000, risen3Cat: "lumentale-general" },
];

describe("createLumenTalePreBuildReport", () => {
  it("counts only valid changed rows and identifies their source tables", () => {
    const report = createLumenTalePreBuildReport(meta, entries, {
      "lumentale/Menu:0": "ابدأ {player}",
      "lumentale/Menu:1": "Exit",
    });

    expect(report).toMatchObject({
      sourceName: "Localization_en.bundle",
      tableCount: 1,
      sourceRows: 2,
      changedLines: 1,
      changedTables: 1,
      blockingIssues: [],
    });
  });

  it("blocks a changed translation when its LumenTale token contract differs", () => {
    const report = createLumenTalePreBuildReport(meta, entries, {
      "lumentale/Menu:0": "ابدأ اللاعب",
    });

    expect(report.changedLines).toBe(0);
    expect(report.blockingIssues).toHaveLength(1);
    expect(report.blockingIssues[0]).toMatchObject({ editorKey: "lumentale/Menu:0", table: "Menu" });
  });

  it("blocks a report when the editor rows no longer match the saved bundle identity", () => {
    const report = createLumenTalePreBuildReport(meta, [entries[0]], {});

    expect(report.blockingIssues).toHaveLength(1);
    expect(report.blockingIssues[0].editorKey).toBe("lumentale/Menu:1");
  });
});
