// Shared Pokémon Platinum tag pattern — mirrors src/lib/nds/plat-tag-mask.ts
// (the client-side equivalent used for display and post-hoc repair). This is
// the pre-emptive half: fold into each translation function's own tag
// protection so `{COLOR 2}`, `{STRVAR_1 3, 0, 0}` never reach the model as
// plain text, where they get translated, renumbered, or dropped outright.
//
// The shape is the game's own: an upper-case name, then optionally a space
// and a comma-separated list of numbers. Confirmed against every distinct
// tag instance in res/text/*.json (241 of them) — none fall outside it.
export const PLAT_TAG_RE = /\{[A-Z][A-Z0-9_]*(?:\s+\d+(?:\s*,\s*\d+)*)?\}/g;
