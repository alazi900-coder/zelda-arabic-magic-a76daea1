import { describe, it, expect } from "vitest";
import {
  categorizeDsEntry,
  dsCategories,
  dsCategoryLabel,
  dsTableLabel,
  DS_FILE_RE,
} from "@/lib/dragonsword/ds-categories";
import { CATEGORY_PROMPT_DEFAULTS } from "@/lib/categoryPromptDefaults";

/**
 * Every id below was read out of the shipped `DragonSword_IT.pak`, with the
 * Italian line it carries next to it. They are the evidence for the rule, so a
 * rule that stops matching them is a rule that broke.
 */
const SAMPLES: [string, number, string, string][] = [
  // StringQuestData splits by the id's length
  ["ds_stringquestdata", 10001, "ds-quests", "1. Verso il Regno di Orbis"],
  ["ds_stringquestdata", 100101, "ds-quests", "Lute, un ragazzo di campagna ingenuo…"],
  ["ds_stringquestdata", 1000101, "ds-quests", "Viaggio al Ponte"],
  ["ds_stringquestdata", 10000040, "ds-speakers", "Modan"],
  ["ds_stringquestdata", 11000010, "ds-speakers", "Ardora"],
  ["ds_stringquestdata", 71000010, "ds-speakers", "Guardia della porta ovest"],
  ["ds_stringquestdata", 51010001, "ds-dialogue", "Che cavolo? Se non hai intenzione…"],
  ["ds_stringquestdata", 70000010, "ds-dialogue", "Durante l'era della guerra infinita…"],
  ["ds_stringquestdata", 100010201, "ds-dialogue", "Uff, non mi aspettavo…"],
  ["ds_stringquestdata", 1001016801, "ds-dialogue", "Dannazione! La strada è bloccata!"],
  // StringData splits by the id's prefix
  ["ds_stringdata", 900000001, "ds-items", "Oro"],
  ["ds_stringdata", 901410002, "ds-items", "Testo di combattimento di base"],
  ["ds_stringdata", 902100000, "ds-items", "Restauro di Grazia"],
  ["ds_stringdata", 910000001, "ds-item-desc", "Una moneta con l'immagine della dea…"],
  ["ds_stringdata", 911410002, "ds-item-desc", "Un libro di testo che copre…"],
  ["ds_stringdata", 921360001, "ds-item-desc", '"Ah! Ho finalmente risolto…"'],
  ["ds_stringdata", 800010101, "ds-skills", "Pugnala il nemico ripetutamente…"],
  ["ds_stringdata", 830220101, "ds-skills", "<Yellow>【Sentenza eretica</>…"],
  ["ds_stringdata", 810320101, "ds-stats", "Attacco Potenza <LightOrange>20%</>"],
  ["ds_stringdata", 820350201, "ds-stats", "Inflitti <LightOrange>Bleed</>…"],
  ["ds_stringdata", 740101, "ds-skills", "Fendente Stordente"],
  ["ds_stringdata", 750001, "ds-skills", "Brandisci la spada in avanti…"],
  ["ds_stringdata", 810001, "ds-skills", "Una lancia affilata"],
  ["ds_stringdata", 820001, "ds-stats", "Infligge {0}% danni"],
  ["ds_stringdata", 720001, "ds-speakers", "Johnny."],
  ["ds_stringdata", 730001, "ds-speakers", "Eileen"],
  ["ds_stringdata", 719001, "ds-speakers", "Gauron"],
  ["ds_stringdata", 710001, "ds-world", "Goblin"],
  ["ds_stringdata", 705001, "ds-world", "Castello Reale di Orbis"],
  ["ds_stringdata", 780001, "ds-world", "Un fabbro gestito da Modan…"],
  ["ds_stringdata", 500001, "ds-world", "Cronache del Re d'Oro Milano - 1"],
  ["ds_stringdata", 600001, "ds-stats", "Attacco"],
  ["ds_stringdata", 871001, "ds-stats", "Difesa aumentata da <LightOrange>{0}%</>"],
  ["ds_stringdata", 106501, "ds-quests", "Ripristinare la Dea Statua di Organa"],
  ["ds_stringdata", 890001, "ds-quests", "Crea equipaggiamento ({0}/{1})"],
  ["ds_stringdata", 100001, "ds-ui", "Inventario"],
  ["ds_stringdata", 111001, "ds-ui", "Alcune opzioni avranno effetto…"],
  ["ds_stringdata", 1020101, "ds-stats", "[Personal] ripristina 850 HP."],
  ["ds_stringdata", 1101001, "ds-speakers", "Rita, il proprietario…"],
  ["ds_stringdata", 11000, "ds-ui", "Valuta"],
  // the two small tables
  ["ds_stringscenedata", 101001, "ds-dialogue", "Lute..."],
  ["ds_stringreminiscencedata", 10002, "ds-speakers", "L'Italia"],
  ["ds_stringreminiscencedata", 10007011, "ds-quests", "La bottiglia di Peculiar"],
  ["ds_stringreminiscencedata", 1000701001, "ds-dialogue", "Johnny si dirige da qualche parte…"],
];

describe("dragonsword categories", () => {
  it.each(SAMPLES)("%s:%d → %s (%s)", (file, index, expected) => {
    expect(categorizeDsEntry({ msbtFile: file, index })).toBe(expected);
  });

  /**
   * The name and its description carry the same suffix — `901410002` against
   * `911410002` — and they land on different cards on purpose: a name is one
   * to three words and a description is prose, and one prompt cannot do both.
   */
  it("splits a name from its description even though they share a suffix", () => {
    const suffix = 410002;
    expect(categorizeDsEntry({ msbtFile: "ds_stringdata", index: 901000000 + suffix })).toBe("ds-items");
    expect(categorizeDsEntry({ msbtFile: "ds_stringdata", index: 911000000 + suffix })).toBe("ds-item-desc");
  });

  /**
   * The eight-digit rows of the quest table are two things under one length:
   * short names and long lines. Only the six measured prefixes are names.
   */
  it("reads the eight-digit quest rows by prefix, not by length alone", () => {
    for (const p of [10, 11, 71, 72, 73, 74]) {
      expect(categorizeDsEntry({ msbtFile: "ds_stringquestdata", index: p * 1e6 + 12345 })).toBe("ds-speakers");
    }
    for (const p of [51, 52, 60, 70, 90, 91]) {
      expect(categorizeDsEntry({ msbtFile: "ds_stringquestdata", index: p * 1e6 + 12345 })).toBe("ds-dialogue");
    }
  });

  /** A prefix nobody read is a menu string, not a guess. */
  it("sends an unmeasured id to the menus card instead of naming it", () => {
    expect(categorizeDsEntry({ msbtFile: "ds_stringdata", index: 444444 })).toBe("ds-ui");
    expect(categorizeDsEntry({ msbtFile: "ds_stringdata", index: 999999999 })).toBe("ds-ui");
    expect(categorizeDsEntry({ msbtFile: "ds_somethingnew", index: 1 })).toBe("ds-ui");
  });

  it("lists only the categories the loaded lines fall into, in a fixed order", () => {
    const entries = [
      { msbtFile: "ds_stringdata", index: 100001 },
      { msbtFile: "ds_stringquestdata", index: 100010201 },
      { msbtFile: "ds_stringdata", index: 901410002 },
    ];
    expect(dsCategories(entries)).toEqual([
      { id: "ds-dialogue", label: "الحوار والمشاهد" },
      { id: "ds-ui", label: "القوائم ورسائل النظام" },
      { id: "ds-items", label: "أسماء الأدوات والمعدّات" },
    ]);
  });

  /**
   * The cards and the prompts are keyed on the same ids. When they drift the
   * translator gets the general prompt without being told, which is the exact
   * failure this game already had once: the four table ids carried the source
   * language in their name and matched no prompt at all.
   */
  it("gives every category a dedicated prompt", () => {
    const all = SAMPLES.map(([file, index]) => ({ msbtFile: file, index }));
    const ids = dsCategories(all).map((c) => c.id);
    expect(ids).toHaveLength(9);
    for (const id of ids) {
      expect(CATEGORY_PROMPT_DEFAULTS[id], `no prompt for ${id}`).toBeTruthy();
      expect(dsCategoryLabel(id)).not.toBe(id);
    }
  });

  it("names the four tables for the upload report, and keeps a fifth readable", () => {
    expect(dsTableLabel("ds_stringquestdata")).toBe("المهامّ والحوار");
    expect(dsTableLabel("ds_somethingnew")).toBe("somethingnew");
    for (const f of ["ds_stringdata", "ds_stringquestdata", "ds_stringscenedata",
      "ds_stringreminiscencedata"]) {
      expect(f).toMatch(DS_FILE_RE);
    }
  });
});
