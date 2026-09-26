import { describe, expect, it } from "vitest";
import { reverseLatinRunsForPh } from "./ph-editor-bridge";

describe("reverseLatinRunsForPh", () => {
  it("pre-reverses an English word inside Arabic", () => {
    expect(reverseLatinRunsForPh("مرحبا Link هنا")).toBe("مرحبا kniL هنا");
  });
  it("keeps punctuation between Latin characters inside the run", () => {
    expect(reverseLatinRunsForPh("لديك 1,000 روبية")).toBe("لديك 000,1 روبية");
    expect(reverseLatinRunsForPh("يا Mr. Link!")).toBe("يا kniL .rM!");
  });
  it("never lets a run cross a line break", () => {
    expect(reverseLatinRunsForPh("AB\nCD")).toBe("BA\nDC");
  });
  it("leaves pure Arabic untouched", () => {
    expect(reverseLatinRunsForPh("مرحبا يا صديقي")).toBe("مرحبا يا صديقي");
  });
});
