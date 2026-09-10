import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * `toggleTechnicalBypass` and its persisted `technicalBypass` set already
 * existed and were honoured at all five places the AI passes skip a row — but
 * nothing in the UI ever called it, so the override was unreachable. These
 * pin the path from the button to the state, since a broken link there fails
 * silently: the row simply keeps being skipped.
 */
function src(...p: string[]): string {
  return readFileSync(resolve(__dirname, "..", ...p), "utf8");
}

describe("technical-text override reaches the state", () => {
  it("offers a per-row override next to the warning", () => {
    const card = src("components/editor/EntryCard.tsx");
    expect(card).toContain("onToggleTechnicalBypass");
    expect(card).toContain("ترجمها رغم ذلك");
  });

  it("offers a bulk override for everything the current filter shows", () => {
    const bar = src("components/editor/EditorFiltersBar.tsx");
    expect(bar).toContain("technicalShown");
    expect(bar).toContain("أدرجها كلها في الترجمة");
    expect(bar).toContain("editor.toggleTechnicalBypass(key)");
  });

  it("threads the handler down every hop, so the button is not inert", () => {
    expect(src("components/editor/EditorEntryListSection.tsx"))
      .toContain("toggleTechnicalBypass={editor.toggleTechnicalBypass}");
    expect(src("components/editor/VirtualizedEntryList.tsx"))
      .toContain("onToggleTechnicalBypass={toggleTechnicalBypass}");
    expect(src("components/editor/VirtualizedEntryList.tsx"))
      .toContain("isTechnicalBypassed={state.technicalBypass?.has(key) || false}");
  });

  it("is declared on both EditorSubset picks that read it", () => {
    // the app tsconfig catches this, the root one does not — see typecheck-command
    for (const f of ["components/editor/EditorEntryListSection.tsx", "components/editor/EditorFiltersBar.tsx"]) {
      expect(src(f), f).toMatch(/\|\s*"toggleTechnicalBypass"/);
    }
  });

  it("is still what the AI passes consult before skipping a row", () => {
    const hook = src("hooks/useEditorTranslation.ts");
    const guards = hook.match(/state\.technicalBypass\?\.has\(key\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(5);
  });
});
