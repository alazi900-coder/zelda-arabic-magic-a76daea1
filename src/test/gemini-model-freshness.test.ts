import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { glob } from "glob";

/**
 * Google retired `gemini-2.0-flash` and every request naming it came back 404.
 * The damage was not the retirement but the mapping around it: the server
 * turned any model name it did not recognise into that one, so choosing a
 * newer model silently sent the dead one and the error blamed a model the
 * user had never picked.
 *
 * These guard the two halves of the fix — the dead name is gone, and the name
 * the user picks reaches the API instead of being mapped onto a frozen list.
 */
function read(p: string): string {
  return readFileSync(resolve(__dirname, "../..", p), "utf8");
}

describe("Gemini model freshness", () => {
  it("names the retired model nowhere in src or supabase", async () => {
    const files = await glob("{src,supabase}/**/*.{ts,tsx}", {
      cwd: resolve(__dirname, "../.."),
      absolute: true,
      // the changelog's job is to record that this model was retired, so it
      // names it on purpose — scanning it would forbid describing the fix
      ignore: [
        "**/node_modules/**",
        "**/gemini-model-freshness.test.ts",
        "src/lib/changelog.ts",
      ],
    });
    // the quoted form only: the comments explaining this bug name the model on
    // purpose, and a test that forbids describing it would push the reason out
    const asValue = /['"`]gemini-2\.0-flash['"`]/;
    const offenders = files.filter((f) => asValue.test(readFileSync(f, "utf8")));
    expect(offenders, `still referencing the retired model:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("passes the chosen model through instead of mapping it onto a fixed pair", () => {
    const fn = read("supabase/functions/translate-entries/index.ts");
    // shape-checked, not enumerated — a new model must not need a code change
    expect(fn).toMatch(/isGeminiModelId\s*=\s*\(m\?: string\)/);
    expect(fn).toContain("isGeminiModelId(aiModel) ? aiModel as string : DEFAULT_GEMINI_MODEL");
  });

  it("only lets a gemini-shaped name reach the URL", () => {
    const fn = read("supabase/functions/translate-entries/index.ts");
    const re = /\/\^gemini-\[a-z0-9\.\-\]\+\$\//;
    expect(fn).toMatch(re);
    // a name that is not gemini-shaped must fall back, never be interpolated
    const check = (m: string) => /^gemini-[a-z0-9.-]+$/.test(m);
    expect(check("gemini-3.6-flash")).toBe(true);
    expect(check("gemini-2.5-pro")).toBe(true);
    expect(check("gpt-5")).toBe(false);
    expect(check("gemini-x:generateContent?key=leak")).toBe(false);
    expect(check("../../evil")).toBe(false);
  });

  it("offers the live catalogue so the next retirement needs no code change", () => {
    const ui = read("src/components/editor/EditorProviderSelection.tsx");
    expect(ui).toContain("loadGeminiModels");
    expect(ui).toContain("generativelanguage.googleapis.com/v1beta/models");
    expect(ui).toContain("generateContent");
  });
});
