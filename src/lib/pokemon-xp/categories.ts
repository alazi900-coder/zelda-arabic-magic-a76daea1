/** Pokémon XP category prompts are content-oriented, never inferred as GBA lists. */

export interface PokemonXpCategory {
  id: string;
  label: string;
  emoji: string;
}

interface PokemonXpCategoryEntry {
  msbtFile: string;
  original: string;
}

const CATEGORIES: Record<string, PokemonXpCategory> = {
  "pokemon-xp-dialogue": { id: "pokemon-xp-dialogue", label: "حوار ورسائل", emoji: "💬" },
  "pokemon-xp-ui": { id: "pokemon-xp-ui", label: "قوائم وواجهة", emoji: "🖥️" },
  "pokemon-xp-names": { id: "pokemon-xp-names", label: "أسماء وتُسميات", emoji: "🏷️" },
  "pokemon-xp-system": { id: "pokemon-xp-system", label: "نظام ووصف", emoji: "⚙️" },
};

const ORDER = ["pokemon-xp-dialogue", "pokemon-xp-ui", "pokemon-xp-names", "pokemon-xp-system"];
const ESSENTIALS_COMMAND = /\\(?:PN|PM|wt|dxn|v|c|p|i|w|l|n|b|G|\{|\}|\\)/i;
const DIALOGUE = /[.!?…]|\\(?:PN|PM|v|c|n|wt|dxn)/i;
const SYSTEM = /\b(?:saved|obtained|fainted|evolved|registered|cannot|used|restored|level|experience|party|Pok[eé]dex)\b/i;
const UI = /^(?:yes|no|ok|cancel|save|load|options|back|exit|item|items|status|choose|select|confirm|continue|start|quit)$/i;

export function categorizePokemonXpEntry(entry: PokemonXpCategoryEntry): string {
  const text = entry.original.trim();
  if (DIALOGUE.test(text) || ESSENTIALS_COMMAND.test(text)) return CATEGORIES["pokemon-xp-dialogue"].id;
  if (SYSTEM.test(text) || text.length > 58) return CATEGORIES["pokemon-xp-system"].id;
  if (UI.test(text)) return CATEGORIES["pokemon-xp-ui"].id;
  if (text.length <= 26 && !/[.!?…]/.test(text)) return CATEGORIES["pokemon-xp-names"].id;
  return CATEGORIES["pokemon-xp-ui"].id;
}

export function buildPokemonXpCategories(entries: PokemonXpCategoryEntry[]): PokemonXpCategory[] {
  const present = new Set(entries
    .filter((entry) => entry.msbtFile.startsWith("pokemon-xp/"))
    .map(categorizePokemonXpEntry));
  return ORDER.filter((id) => present.has(id)).map((id) => CATEGORIES[id]);
}
