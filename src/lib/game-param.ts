/**
 * Resolves the `game` value sent to the AI edge functions (translation,
 * enhance, review, tools…) so each request gets the right per-game prompt
 * lore/terminology instead of defaulting to Xenoblade. The game is inferred
 * from an entry's `msbtFile` shape — the same signal the editor already uses:
 *   - `bank_<N>` / `names_<id>` → MOTHER 3 (m3-editor-bridge keys entries this way)
 *   - `*.tab`                   → Risen 1/2 (variant chosen by the session: risen1 | risen2)
 *   - `*.gar3`                  → Risen 3 (unambiguous suffix — see risen3-extractor.ts;
 *                                 unlike `.tab`, no variant parameter is needed)
 *   - `TEXT_*`                  → Metroid Prime Remastered (mp-editor-bridge keys entries this way)
 *   - `wolf_b<N>_s<M>`          → Wolfenstein RPG (wolf-editor-bridge keys entries this way)
 *   - `pkm_rom` / `pkm_<kind>`  → Pokémon Ruby Destiny (pkm-editor-bridge keys lines this way;
 *                                 the `<kind>` form marks which name list a line sits in)
 *   - otherwise                 → Xenoblade (default, backward-compatible)
 */
import { PKM_FILE_RE } from "@/lib/pokemon/pkm-categories";

export type GameParam =
  | "xenoblade"
  | "risen1"
  | "risen2"
  | "risen3"
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
  if (/\.gar3$/i.test(f)) return "risen3";
  if (/\.tab$/i.test(f)) return risenVariant;
  if (/^TEXT_/.test(f)) return "metroidprime";
  if (/^wolf_b\d+_s\d+$/.test(f)) return "wolfenstein";
  if (PKM_FILE_RE.test(f)) return "pokemon";
  return "xenoblade";
}
