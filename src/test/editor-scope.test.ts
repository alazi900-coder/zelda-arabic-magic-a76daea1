import { describe, expect, it } from "vitest";

import { hasActiveEditorScope } from "@/lib/editor-scope";

describe("hasActiveEditorScope", () => {
  it("treats search text as an active scope", () => {
    expect(hasActiveEditorScope({
      search: "MNU_style_standard_ms",
      filterFile: "all",
      filterCategory: [],
      filterStatus: "all",
      filterTechnical: "all",
      filterTable: "all",
      filterColumn: "all",
      pinnedKeys: null,
    })).toBe(true);
  });

  it("treats BDAT table and column filters as an active scope", () => {
    expect(hasActiveEditorScope({
      search: "",
      filterFile: "all",
      filterCategory: [],
      filterStatus: "all",
      filterTechnical: "all",
      filterTable: "MNU_style_standard_ms",
      filterColumn: "style",
      pinnedKeys: null,
    })).toBe(true);
  });

  it("returns false only when no search, no filters, and no pinned results are active", () => {
    expect(hasActiveEditorScope({
      search: "",
      filterFile: "all",
      filterCategory: [],
      filterStatus: "all",
      filterTechnical: "all",
      filterTable: "all",
      filterColumn: "all",
      pinnedKeys: null,
    })).toBe(false);
  });
});