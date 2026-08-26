import type { FilterStatus, FilterTechnical } from "@/components/editor/types";

export const EDITOR_WORKSPACE_KEY = "editor-workspace";

export interface EditorWorkspaceSnapshot {
  version: 1;
  search: string;
  filterFile: string;
  filterCategory: string[];
  filterStatus: FilterStatus;
  filterTechnical: FilterTechnical;
  filterTable: string;
  filterColumn: string;
  filtersOpen: boolean;
}

const filterStatuses = new Set<FilterStatus>([
  "all", "translated", "untranslated", "problems", "needs-improve", "too-short", "too-long",
  "stuck-chars", "mixed-lang", "has-tags", "no-tags", "damaged-tags", "missing-tags", "fuzzy",
  "byte-overflow", "has-newlines", "translation-has-newline", "xeno-n-missing", "excessive-lines",
  "byte-budget", "newline-diff", "identical-original", "long-texts", "khbbs-unsupported", "gtaiv-unsupported",
]);

const filterTechnicalValues = new Set<FilterTechnical>(["all", "only", "exclude"]);

const readString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.length <= 240 ? value : fallback;

export const defaultEditorWorkspace = (): EditorWorkspaceSnapshot => ({
  version: 1,
  search: "",
  filterFile: "all",
  filterCategory: [],
  filterStatus: "all",
  filterTechnical: "all",
  filterTable: "all",
  filterColumn: "all",
  filtersOpen: false,
});

/** Restores only non-sensitive navigation state. Invalid or pre-v2 data falls back safely. */
export const readEditorWorkspace = (value: unknown): EditorWorkspaceSnapshot => {
  const fallback = defaultEditorWorkspace();
  if (!value || typeof value !== "object") return fallback;
  const saved = value as Partial<EditorWorkspaceSnapshot>;
  const categories = Array.isArray(saved.filterCategory)
    ? saved.filterCategory.filter((item): item is string => typeof item === "string" && item.length <= 120).slice(0, 40)
    : fallback.filterCategory;

  return {
    version: 1,
    search: readString(saved.search, fallback.search),
    filterFile: readString(saved.filterFile, fallback.filterFile),
    filterCategory: categories,
    filterStatus: filterStatuses.has(saved.filterStatus as FilterStatus) ? saved.filterStatus as FilterStatus : fallback.filterStatus,
    filterTechnical: filterTechnicalValues.has(saved.filterTechnical as FilterTechnical)
      ? saved.filterTechnical as FilterTechnical
      : fallback.filterTechnical,
    filterTable: readString(saved.filterTable, fallback.filterTable),
    filterColumn: readString(saved.filterColumn, fallback.filterColumn),
    filtersOpen: typeof saved.filtersOpen === "boolean" ? saved.filtersOpen : fallback.filtersOpen,
  };
};

export const editorWorkspaceStorageKey = (sourceGame?: string | null) =>
  `${EDITOR_WORKSPACE_KEY}:${sourceGame?.trim() || "shared"}`;
