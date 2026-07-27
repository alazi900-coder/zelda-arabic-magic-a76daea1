import { describe, it, expect } from "vitest";
import { partitionTranslations } from "@/lib/metroid-prime/mp-editor-bridge";

describe("Metroid Prime opener — no upload may lose a translation", () => {
  const known = {
    "TEXT_Subtitles:0": "مرحبا",
    "TEXT_Subtitles:1": "ابدأ",
    "TEXT_FrontEnd:0": "خيارات",
  };

  it("loads the translations this .pak can show", () => {
    const { active } = partitionTranslations(known, new Set(["TEXT_Subtitles:0", "TEXT_Subtitles:1"]));
    expect(active).toEqual({ "TEXT_Subtitles:0": "مرحبا", "TEXT_Subtitles:1": "ابدأ" });
  });

  it("keeps the ones belonging to other .pak files instead of deleting them", () => {
    const { parked } = partitionTranslations(known, new Set(["TEXT_Subtitles:0", "TEXT_Subtitles:1"]));
    expect(parked).toEqual({ "TEXT_FrontEnd:0": "خيارات" });
  });

  it("loses nothing at all: active + parked is everything that came in", () => {
    const { active, parked } = partitionTranslations(known, new Set(["TEXT_FrontEnd:0"]));
    expect({ ...active, ...parked }).toEqual(known);
  });

  it("opening a .pak that shares no key parks every translation rather than wiping them", () => {
    const { active, parked } = partitionTranslations(known, new Set(["TEXT_Other:9"]));
    expect(active).toEqual({});
    expect(parked).toEqual(known);
  });

  it("drops empty values, which carry no work", () => {
    const { active, parked } = partitionTranslations({ "A:0": "", "B:0": "نص" }, new Set(["A:0"]));
    expect(active).toEqual({});
    expect(parked).toEqual({ "B:0": "نص" });
  });
});
