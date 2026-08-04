/**
 * Grouping DragonSword Awakening's lines for the translator.
 *
 * The four tables are not four kinds of text. `StringData` alone holds item
 * names, their descriptions, skill effects, place names, monster names, quest
 * objectives and every menu label in the game — 10,358 lines that need at
 * least six different translation styles. Grouping by table put them all on
 * one card, which is the same as not grouping at all.
 *
 * WHAT THE ID SAYS
 *
 * Every row's key is a number the game itself uses, and the number carries the
 * kind. Two independent shapes, both measured over the shipped Italian pak:
 *
 *   StringQuestData splits by the id's LENGTH
 *     5  digits    330   chapter titles     "1. Verso il Regno di Orbis"
 *     6  digits    827   quest descriptions and short quest titles
 *     7  digits  2,540   objectives         "Parla con Johnny"
 *     8  digits  2,554   MIXED: prefixes 10/11/71/72/73/74 are speaker names
 *                        (average 10-23 characters — "Modan", "Bart"), the
 *                        rest is merchant chatter and long lore
 *     9-10 dig 25,260   the dialogue itself
 *
 *   StringData splits by the id's PREFIX
 *     900/901/902/909    879   item, equipment and title names
 *     910/911/912        657   their descriptions — and 657 of them carry the
 *                              SAME suffix as the name they belong to, which
 *                              is what proves the numbering is deliberate
 *     921                154   flavour quotes printed on items
 *     800/830            338   what a combat move does
 *     810/820, 82xx…   1,200   numeric effects "Attacco Potenza 20% aumento"
 *     7401-7403/75xx     307   skill names and skill descriptions
 *     72xx/73xx/719x     900   character names
 *     70xx/71xx/78xx   1,300   places, monsters and world lore
 *     everything else  4,700   menus and system messages
 *
 * A prefix that was not read by eye is not named. Anything the rules below do
 * not match falls to the menus category, which is where an unnamed UI string
 * belongs anyway — inventing a category for a prefix nobody looked at would
 * point the wrong translation prompt at it, and that is worse than a line
 * sitting in a bucket that is merely too broad.
 *
 * WHAT IS NOT HERE
 *
 * There is no weapons category, because the game has no weapon items: the
 * equipment sets are helmet, chest, trousers and gloves, and each hero's
 * weapon is fixed to the hero. Naming a category "weapons" would have been
 * a guess dressed as a fact.
 */

export interface DsCategory {
  id: string;
  label: string;
}

const CATEGORIES: DsCategory[] = [
  { id: "ds-dialogue", label: "الحوار والمشاهد" },
  { id: "ds-quests", label: "المهامّ وعناوينها وأهدافها" },
  { id: "ds-ui", label: "القوائم ورسائل النظام" },
  { id: "ds-speakers", label: "أسماء الشخصيات" },
  { id: "ds-world", label: "الأماكن والوحوش وسرد العالم" },
  { id: "ds-stats", label: "الإحصاءات والمفاعيل الرقميّة" },
  { id: "ds-items", label: "أسماء الأدوات والمعدّات" },
  { id: "ds-item-desc", label: "أوصاف الأدوات والألقاب" },
  { id: "ds-skills", label: "المهارات: أسماؤها وأوصافها" },
];

const ORDER = CATEGORIES.map((c) => c.id);
const LABELS = new Map(CATEGORIES.map((c) => [c.id, c.label]));

/** The tables, named by what is really inside them — for the upload report. */
const TABLE_NAMES: Record<string, string> = {
  ds_stringdata: "الأدوات والمهارات والقوائم",
  ds_stringquestdata: "المهامّ والحوار",
  ds_stringreminiscencedata: "الذكريات",
  ds_stringscenedata: "المشاهد السينمائيّة",
};

/** What to call one table on screen. */
export function dsTableLabel(file: string): string {
  return TABLE_NAMES[file] ?? file.replace(/^ds_/, "");
}

/** True for an entry file this game owns. */
export const DS_FILE_RE = /^ds_[a-z0-9]+$/;

/** Ids whose 8-digit rows in StringQuestData are names, not lines. */
const QUEST_NAME_PREFIXES = new Set(["10", "11", "71", "72", "73", "74"]);

/**
 * StringData's four-digit groups, each read by eye before it was named.
 * A group not listed here is a menu string.
 */
const SD_GROUPS: Record<string, string> = {
  // skills: what they are called, and what they do
  "7401": "ds-skills", "7402": "ds-skills", "7403": "ds-skills",
  "7500": "ds-skills", "7501": "ds-skills",
  "8902": "ds-skills", "8903": "ds-skills",
  // people: heroes, merchants, guards, the roles printed above a line
  "7190": "ds-speakers", "7191": "ds-speakers", "7200": "ds-speakers",
  "7201": "ds-speakers", "7202": "ds-speakers", "7203": "ds-speakers",
  "7204": "ds-speakers", "7205": "ds-speakers", "7210": "ds-speakers",
  "7300": "ds-speakers", "1085": "ds-speakers", "1086": "ds-speakers",
  "2010": "ds-speakers", "2040": "ds-speakers",
  "2050": "ds-speakers", "2051": "ds-speakers", "2052": "ds-speakers",
  // the world: where it happens, what lives there, and the books about it
  "7000": "ds-world", "7010": "ds-world", "7020": "ds-world", "7021": "ds-world",
  "7030": "ds-world", "7040": "ds-world", "7050": "ds-world", "7051": "ds-world",
  "7060": "ds-world", "7100": "ds-world", "7101": "ds-world", "7102": "ds-world",
  "7103": "ds-world", "7800": "ds-world", "7801": "ds-world",
  "1019": "ds-world", "1084": "ds-world", "1135": "ds-world", "1136": "ds-world",
  "5000": "ds-world", "5001": "ds-world", "5005": "ds-world",
  "5008": "ds-world", "5010": "ds-world",
  // numbers: stats, buffs, percentages
  "6000": "ds-stats", "6001": "ds-stats", "8000": "ds-stats", "8090": "ds-stats",
  "8200": "ds-stats", "8201": "ds-stats", "8202": "ds-stats", "8203": "ds-stats",
  "8600": "ds-stats", "8700": "ds-stats", "8710": "ds-stats", "8711": "ds-stats",
  "8800": "ds-stats", "3000": "ds-stats",
  // Karma names — 48/36/24/54 of them against 50/36/24/54 descriptions in
  // 8200-8203, which is what says the two runs are a name and its text.
  "8100": "ds-skills", "8101": "ds-skills", "8102": "ds-skills", "8103": "ds-skills",
  // things to go and do
  "1027": "ds-quests", "1065": "ds-quests", "1066": "ds-quests",
  "1067": "ds-quests", "1092": "ds-quests",
  "8900": "ds-quests", "8901": "ds-quests",
};

/** StringData's nine-digit families, keyed by the first three digits. */
const SD_NINE: Record<string, string> = {
  "900": "ds-items", "901": "ds-items", "902": "ds-items", "909": "ds-items",
  "910": "ds-item-desc", "911": "ds-item-desc", "912": "ds-item-desc",
  "921": "ds-item-desc",
  "800": "ds-skills", "830": "ds-skills",
  "810": "ds-stats", "820": "ds-stats",
};

function categorizeStringData(id: string): string {
  if (id.length === 9) return SD_NINE[id.slice(0, 3)] ?? "ds-ui";
  if (id.length === 7) {
    // 110xxxx are shop keepers; 100/102 are buff lines full of numbers.
    if (id.startsWith("110")) return "ds-speakers";
    if (id.startsWith("100") || id.startsWith("102")) return "ds-stats";
    return "ds-ui";
  }
  if (id.length === 6) {
    const four = id.slice(0, 4);
    if (SD_GROUPS[four]) return SD_GROUPS[four];
    // 13xx is one long run of achievement conditions.
    if (/^13\d\d$/.test(four)) return "ds-quests";
    return "ds-ui";
  }
  return "ds-ui";
}

function categorizeQuestData(id: string): string {
  if (id.length <= 7) return "ds-quests";
  if (id.length === 8) {
    return QUEST_NAME_PREFIXES.has(id.slice(0, 2)) ? "ds-speakers" : "ds-dialogue";
  }
  return "ds-dialogue";
}

function categorizeReminiscence(id: string): string {
  if (id.length === 5) return "ds-speakers";
  if (id.length === 8) return "ds-quests";
  return "ds-dialogue";
}

/** Which card a line belongs on, from the table it came from and its own id. */
export function categorizeDsEntry(entry: { msbtFile: string; index: number }): string {
  const id = String(entry.index);
  switch (entry.msbtFile) {
    case "ds_stringdata":
      return categorizeStringData(id);
    case "ds_stringquestdata":
      return categorizeQuestData(id);
    case "ds_stringreminiscencedata":
      return categorizeReminiscence(id);
    case "ds_stringscenedata":
      // One table, one kind: 404 lines of cinematic dialogue, all 6 digits.
      return "ds-dialogue";
    default:
      return "ds-ui";
  }
}

/** Every category the loaded entries fall into, in a fixed order. */
export function dsCategories(entries: { msbtFile: string; index: number }[]): DsCategory[] {
  const present = new Set(entries.map(categorizeDsEntry));
  return ORDER.filter((id) => present.has(id)).map((id) => ({ id, label: LABELS.get(id)! }));
}

/** What to call one category on screen. */
export function dsCategoryLabel(id: string): string {
  return LABELS.get(id) ?? id.replace(/^ds-/, "");
}
