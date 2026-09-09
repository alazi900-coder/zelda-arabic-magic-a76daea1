import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * CodeCraft has to be listed everywhere a provider is enumerated, or choosing it
 * fails only in the one panel that was missed — and silently, since the request
 * just goes out without a key.
 *
 * These read the sources rather than run the app because the editor's own
 * `EditorSubset` type does not catch a missing key: a deliberately bogus
 * `editor.zzzBogusProp` typechecked clean while writing this, which is how
 * `userCodeCraftKey` reached CompareEnginesDialog as an undeclared identifier.
 * A grep is a weaker test than a type, but here it is the one that fails when
 * a surface is forgotten.
 */
function src(...parts: string[]): string {
  return readFileSync(resolve(__dirname, "..", ...parts), "utf8");
}

describe("CodeCraft provider wiring", () => {
  it("is offered in the provider picker and stores its key", () => {
    expect(src("components/editor/EditorProviderSelection.tsx")).toContain("'codecraft' as const");
    expect(src("hooks/useEditorSettings.ts")).toContain("userCodeCraftKey");
  });

  it("is a valid saved provider, so a reload does not silently drop it", () => {
    expect(src("hooks/useEditorSettings.ts")).toMatch(/VALID_PROVIDERS[^;]*'codecraft'/s);
  });

  it("resolves its key on every path that sends a translation request", () => {
    // main translation + throttle table
    const translation = src("hooks/useEditorTranslation.ts");
    expect(translation).toContain("provider === 'codecraft'");
    expect(translation).toMatch(/codecraft:\s*\{/);
    // test-connection button
    expect(src("pages/Editor.tsx")).toContain("provider === 'codecraft'");
    // enhance panel
    expect(src("components/editor/TranslationAIEnhancePanel.tsx")).toContain("effectiveProvider === 'codecraft'");
    // review
    expect(src("hooks/useEditorReview.ts")).toContain("provider === 'codecraft'");
    // compare engines
    expect(src("components/editor/CompareEnginesDialog.tsx")).toContain("engine.requiresKey === 'codecraft'");
  });

  it("hands the key down to the hooks and dialogs that need it", () => {
    const state = src("hooks/useEditorState.ts");
    // destructured from settings, then passed to the translation and review hooks
    expect(state.match(/userCodeCraftKey/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(src("components/editor/EditorDialogs.tsx")).toContain("userCodeCraftKey={editor.userCodeCraftKey}");
  });

  it("declares the key wherever it is read, so it is never a bare identifier", () => {
    for (const file of [
      "components/editor/CompareEnginesDialog.tsx",
      "hooks/useEditorReview.ts",
      "hooks/useEditorTranslation.ts",
    ]) {
      expect(src(file), file).toMatch(/userCodeCraftKey\??:/);
    }
  });

  it("has a server branch that refuses to fall back to a shared secret", () => {
    const fn = readFileSync(
      resolve(__dirname, "../../supabase/functions/translate-entries/index.ts"),
      "utf8",
    );
    expect(fn).toContain("provider === 'codecraft'");
    expect(fn).toContain("https://codecraftapi.com/v1");
    // the key comes from the request alone — no Deno.env fallback for this one
    const branch = fn.slice(fn.indexOf("provider === 'codecraft'"), fn.indexOf("provider === 'gmicloud'"));
    expect(branch).not.toContain("Deno.env");
  });
});
