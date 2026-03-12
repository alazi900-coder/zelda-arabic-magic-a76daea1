import { describe, expect, it } from "vitest";
import { hasTechnicalTags } from "@/components/editor/types";
import { protectTags, restoreTags } from "@/lib/xc3-tag-protection";
import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";

describe("XC3 closing colon tags", () => {
  it("detects closing tags like [/System:Ruby] as technical", () => {
    expect(hasTechnicalTags("[/System:Ruby]")).toBe(true);
  });

  it("protects and restores [/System:Ruby] when mixed with opening tag", () => {
    const text = "[System:Ruby rt=Blad ]Text[/System:Ruby]";
    const { cleanText, tags } = protectTags(text);

    expect(cleanText).not.toContain("[System:Ruby");
    expect(cleanText).not.toContain("[/System:Ruby]");

    const restored = restoreTags(cleanText, tags);
    expect(restored).toBe(text);
  });

  it("restores missing closing tag from original text", () => {
    const original = "[System:Ruby rt=Blad ]Text[/System:Ruby]";
    const translation = "[System:Ruby rt=Blad ]نص";

    const fixed = restoreTagsLocally(original, translation);
    expect(fixed).toContain("[System:Ruby rt=Blad ]");
    expect(fixed).toContain("[/System:Ruby]");
  });
});
