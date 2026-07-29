/**
 * Resolves the `game` value sent to the AI edge functions (translation,
 * enhance, review, tools…) so each request gets the right per-game prompt
 * lore/terminology instead of defaulting to Xenoblade. The game is inferred
 * from an entry's `msbtFile` shape — the same signal the editor already uses:
 *   - `bank_<N>` / `names_<id>` → MOTHER 3 (m3-editor-bridge keys entries this way)
 *   - `*.tab`                   → Risen     (variant chosen by the session: risen1 | risen2)
 *   - `TEXT_*`                  → Metroid Prime Remastered (mp-editor-bridge keys entries this way)
 *   - `wolf_b<N>_s<M>`          → Wolfenstein RPG (wolf-editor-bridge keys entries this way)
 *   - `pkm_rom`                 → Pokémon Ruby Destiny (pkm-editor-bridge keys every line this way)
 *   - otherwise                 → Xenoblade (default, backward-compatible)
 */
export type GameParam =
  | "xenoblade"
  | "risen1"
  | "risen2"
  | "mother3"
  | "metroidprime"
  | "wolfenstein"
  | "pokemon";

export function resolveGameParam(
  msbtFile: string | undefined,
  risenVariant: "risen1" | "risen2" = "risen1"
): GameParam {
  const f = msbtFile || "";
  if (/^(bank_\d+|names_\w+|menu_\w+)$/.test(f)) return "mother3";
  if (/\.tab$/i.test(f)) return risenVariant;
  if (/^TEXT_/.test(f)) return "metroidprime";
  if (/^wolf_b\d+_s\d+$/.test(f)) return "wolfenstein";
  if (f === "pkm_rom") return "pokemon";
  return "xenoblade";
}
