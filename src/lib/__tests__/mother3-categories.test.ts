import { describe, it, expect } from "vitest";
import { categorizeMother3Table, categorizeMother3Entry, buildMother3Categories } from "@/lib/mother3/categories";

describe("mother3 categories", () => {
  it("categorizes dialogue banks, item names, statuses, and PSI names distinctly", () => {
    expect(categorizeMother3Table("bank_0").id).toBe("mother3-dialogue");
    expect(categorizeMother3Table("bank_405").id).toBe("mother3-dialogue");
    expect(categorizeMother3Table("names_itemnames").id).toBe("mother3-items");
    expect(categorizeMother3Table("names_statuses").id).toBe("mother3-statuses");
    expect(categorizeMother3Table("names_psinames").id).toBe("mother3-psi");
  });

  it("gives an unrecognized names_* table its own category instead of a generic bucket", () => {
    const cat = categorizeMother3Table("names_menus1");
    expect(cat.id).toBe("mother3-names_menus1");
    expect(cat.label).toBe("names_menus1");
  });

  it("categorizeMother3Entry returns just the id, matching categorizeMother3Table", () => {
    expect(categorizeMother3Entry({ msbtFile: "names_itemnames" })).toBe("mother3-items");
  });

  it("builds a deduped category list from only the tables actually present", () => {
    const entries = [
      { msbtFile: "bank_0" },
      { msbtFile: "bank_0" },
      { msbtFile: "bank_1" },
      { msbtFile: "names_itemnames" },
      { msbtFile: "names_statuses" },
    ];
    const cats = buildMother3Categories(entries);
    expect(cats.map((c) => c.id).sort()).toEqual(["mother3-dialogue", "mother3-items", "mother3-statuses"].sort());
  });
});
