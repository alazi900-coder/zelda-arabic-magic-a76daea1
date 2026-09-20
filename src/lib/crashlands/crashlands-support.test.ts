import { describe, expect, it } from "vitest";
import { exportCrashlandsJson, importCrashlandsJson } from "./crashlands-editor-bridge";
import { repairCrashlandsTags, validateCrashlandsTags } from "./crashlands-tags";

describe("Crashlands technical token guard", () => {
  it("preserves ordered placeholders and hash breaks", () => {
    expect(validateCrashlandsTags("Find %r#Now", "اعثر على %r#الآن").valid).toBe(true);
    expect(validateCrashlandsTags("Find %r#Now", "اعثر على #الآن").valid).toBe(false);
  });
  it("repairs only a missing terminal placeholder", () => {
    expect(repairCrashlandsTags("Hello %r", "مرحباً")).toEqual({ text: "مرحباً%r", changed: true });
    expect(repairCrashlandsTags("Hello %r world", "مرحباً بالعالم").changed).toBe(false);
  });
  it("round-trips the editable JSON identity", () => {
    const loaded = importCrashlandsJson({ format: "crashlands-arabic-editable-v1", entries: [{ id: "assets/ui:tags/UI/text/PLAY", section: "UI", source: "Play %r", translation: "العب %r" }] });
    const out = exportCrashlandsJson(loaded.entries, loaded.translations);
    expect(out.entries[0]).toMatchObject({ id: "assets/ui:tags/UI/text/PLAY", translation: "العب %r" });
  });
});
