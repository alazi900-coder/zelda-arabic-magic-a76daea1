interface EditorScopeInput {
  search: string;
  filterFile: string;
  filterCategory: string[];
  filterStatus: string;
  filterTechnical: string;
  filterTable: string;
  filterColumn: string;
  pinnedKeys: Set<string> | null;
}

export function hasActiveEditorScope({
  search,
  filterFile,
  filterCategory,
  filterStatus,
  filterTechnical,
  filterTable,
  filterColumn,
  pinnedKeys,
}: EditorScopeInput) {
  return search.trim().length > 0 ||
    filterFile !== "all" ||
    filterCategory.length > 0 ||
    filterStatus !== "all" ||
    filterTechnical !== "all" ||
    filterTable !== "all" ||
    filterColumn !== "all" ||
    pinnedKeys !== null;
}