import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * The root tsconfig has `"files": []` and only project references, so plain
 * `tsc --noEmit` compiles nothing at all and exits 0 no matter what is broken.
 * Four real errors sat in main behind that green light — an undefined icon, a
 * prop never destructured, and two keys missing from their types.
 *
 * The habit that catches it is running the project config as well, which is
 * what `npm run typecheck` does. This asserts the script keeps doing both, so
 * nobody trims it back to the half that checks nothing.
 */
describe("typecheck script", () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));

  it("checks the app project, not just the empty root config", () => {
    expect(pkg.scripts.typecheck).toContain("tsconfig.app.json");
  });

  it("is what CI runs, so a broken type cannot reach main quietly", () => {
    expect(pkg.scripts["check:ci"]).toContain("typecheck");
  });

  it("keeps the root config as references-only, the reason the app one is needed", () => {
    const root = JSON.parse(readFileSync(resolve(__dirname, "../../tsconfig.json"), "utf8"));
    // if this ever stops being true the guard above can be revisited
    expect(root.files).toEqual([]);
    expect(root.references?.length ?? 0).toBeGreaterThan(0);
  });
});
