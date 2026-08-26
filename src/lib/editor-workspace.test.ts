import { describe, expect, it } from "vitest";
import { defaultEditorWorkspace, editorWorkspaceStorageKey, readEditorWorkspace } from "./editor-workspace";

describe("editor workspace persistence", () => {
  it("restores valid non-sensitive workspace filters", () => {
    expect(readEditorWorkspace({
      search: "quest",
      filterFile: "Dialogues.json",
      filterCategory: ["quests"],
      filterStatus: "needs-improve",
      filterTechnical: "exclude",
      filterTable: "QuestTable",
      filterColumn: "text",
      filtersOpen: true,
    })).toMatchObject({
      search: "quest",
      filterFile: "Dialogues.json",
      filterCategory: ["quests"],
      filterStatus: "needs-improve",
      filterTechnical: "exclude",
      filtersOpen: true,
    });
  });

  it("rejects unsafe or stale values instead of restoring a broken workspace", () => {
    expect(readEditorWorkspace({
      search: 42,
      filterStatus: "retired-filter",
      filterTechnical: "everything",
      filterCategory: ["valid", 12, "x".repeat(241)],
      filtersOpen: "yes",
    })).toEqual({ ...defaultEditorWorkspace(), filterCategory: ["valid"] });
  });

  it("keeps workspace snapshots isolated by source game", () => {
    expect(editorWorkspaceStorageKey("lumentale")).toBe("editor-workspace:lumentale");
    expect(editorWorkspaceStorageKey("")).toBe("editor-workspace:shared");
  });
});
