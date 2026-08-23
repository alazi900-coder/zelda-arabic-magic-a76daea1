import { describe, expect, it } from "vitest";
import { buildLumenTaleCategories, categorizeLumenTaleEntry } from "./lumentale-categories";

const entry = (table: string) => ({
  msbtFile: `lumentale/${table}`,
  label: `${table} · m_Id 42`,
  risen3Cat: "lumentale-general",
});

describe("LumenTale category cards", () => {
  it("separates menu, skills, battle, quests, dialogue and the remaining Unity table sections", () => {
    expect(categorizeLumenTaleEntry(entry("MenuSettings"))).toBe("lumentale-menu");
    expect(categorizeLumenTaleEntry(entry("SkillDefinitions"))).toBe("lumentale-skills");
    expect(categorizeLumenTaleEntry(entry("BattleStatus"))).toBe("lumentale-battle");
    expect(categorizeLumenTaleEntry(entry("QuestObjectives"))).toBe("lumentale-quests");
    expect(categorizeLumenTaleEntry(entry("StoryDialogue"))).toBe("lumentale-dialogue");
    expect(categorizeLumenTaleEntry(entry("CharacterNames"))).toBe("lumentale-names");
    expect(categorizeLumenTaleEntry(entry("ItemInventory"))).toBe("lumentale-items");
    expect(categorizeLumenTaleEntry(entry("CodexLore"))).toBe("lumentale-lore");
    expect(categorizeLumenTaleEntry(entry("UnknownTable"))).toBe("lumentale-general");
  });

  it("builds cards only for sections that exist in the imported Unity tables", () => {
    expect(buildLumenTaleCategories([entry("MenuSettings"), entry("SkillDefinitions"), entry("UnknownTable")]).map((category) => category.id))
      .toEqual(["lumentale-menu", "lumentale-skills", "lumentale-general"]);
  });
});
