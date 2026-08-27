/** Portable LumenTale contract coverage; no UnityFS or game content is loaded. */
import { describe, expect, it } from "vitest";
import { lumentaleSyntheticContract } from "@/test/fixtures/lumentale-synthetic-contract";
import { createLumenTalePreBuildReport } from "./lumentale-prebuild-report";

describe("portable LumenTale synthetic contract", () => {
  it("keeps synthetic table and opaque-row identities aligned while accepting intact tokens", () => {
    const report = createLumenTalePreBuildReport(
      lumentaleSyntheticContract.meta,
      lumentaleSyntheticContract.entries,
      lumentaleSyntheticContract.validTranslations,
    );

    expect(report).toMatchObject({
      sourceName: "synthetic-lumentale-contract.bundle",
      tableCount: 1,
      sourceRows: 2,
      changedLines: 2,
      changedTables: 1,
      blockingIssues: [],
    });
  });

  it("blocks a synthetic translation that omits a required runtime token", () => {
    const report = createLumenTalePreBuildReport(
      lumentaleSyntheticContract.meta,
      lumentaleSyntheticContract.entries,
      { ...lumentaleSyntheticContract.validTranslations, "lumentale/Synthetic_en:1": "العملات" },
    );

    expect(report.changedLines).toBe(1);
    expect(report.blockingIssues).toHaveLength(1);
    expect(report.blockingIssues[0]).toMatchObject({ editorKey: "lumentale/Synthetic_en:1", table: "Synthetic_en" });
  });
});
