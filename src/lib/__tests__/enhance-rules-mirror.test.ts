/**
 * The rule catalogue lives twice: once in src/lib/enhance-rules.ts, where the
 * toggles are drawn, and once inside the edge function, where the prompt is
 * actually built. The edge file says it "mirrors" the client one, and nothing
 * checked that.
 *
 * Drift here is silent and one-sided. A rule the client shows but the function
 * does not have is a switch that does nothing; a rule whose prompt text
 * differs between the two means the toggle description promises one thing and
 * the model is told another. Both look fine on screen.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BUILTIN_RULES } from "@/lib/enhance-rules";

const EDGE_SOURCE = readFileSync(
  resolve(__dirname, "../../../supabase/functions/enhance-translations/index.ts"),
  "utf8"
);

const PKM_RULE_IDS = [
  "detect_pkm_var",
  "detect_pkm_overflow",
  "detect_pkm_linebreaks",
  "detect_pkm_name_consistency",
];

describe("Pokémon rules in the AI enhancement tool", () => {
  it("offers all four as toggles", () => {
    for (const id of PKM_RULE_IDS) {
      expect(BUILTIN_RULES.find((r) => r.id === id)).toBeDefined();
    }
  });

  it("declares the same prompt text on both sides", () => {
    // The client copy is what the rules editor shows and what an override is
    // measured against; the edge copy is what the model reads.
    for (const id of PKM_RULE_IDS) {
      const rule = BUILTIN_RULES.find((r) => r.id === id)!;
      // The client prompt is a runtime string; the edge copy is read as source,
      // where a `\n` the model must see is written `\\n`.
      expect(EDGE_SOURCE).toContain(rule.prompt.replace(/\\/g, "\\\\"));
    }
  });

  it("injects them only for Pokémon", () => {
    // Without this gate the four would be read by every other game as rules
    // about tags and slot sizes it does not have.
    const gate = /const PKM_ONLY_RULE_IDS = new Set\(\[([^\]]+)\]\)/.exec(EDGE_SOURCE);
    expect(gate).not.toBeNull();
    for (const id of PKM_RULE_IDS) expect(gate![1]).toContain(id);
  });

  it("withholds Xenoblade's tag rules from Pokémon", () => {
    // They tell the model to add [XENO:n], which this engine would print as
    // eight literal characters in a line that has no room for them.
    const gate = /const XENOBLADE_TAG_RULE_IDS = new Set\(\[([^\]]+)\]\)/.exec(EDGE_SOURCE);
    expect(gate).not.toBeNull();
    expect(gate![1]).toContain("detect_line_breaks");
    expect(gate![1]).toContain("detect_split_and_tags");
    expect(EDGE_SOURCE).toContain("(!XENOBLADE_TAG_RULE_IDS.has(r.id) || !isPokemon)");
  });

  it("names the game it is reviewing", () => {
    // The game param used to fall through to Xenoblade, so Pokémon lines were
    // reviewed as Xenoblade's — with Shulk and Monado listed as their proper
    // nouns.
    expect(EDGE_SOURCE).toContain("Pokémon Ruby Destiny");
    expect(EDGE_SOURCE).toMatch(/isRisen \|\| isMother3 \|\| isPokemon/);
  });
});

describe("the two rule catalogues agree", () => {
  /**
   * `no_added_terminal_dot` is on the client and not in the edge function —
   * the toggle is drawn, saved and sent, and nothing on the other side has a
   * prompt for it, so turning it on or off changes nothing. That predates the
   * Pokémon work and is left as it is rather than quietly changing what every
   * other game's prompt says; it is pinned here so it stays a known gap and
   * any *new* drift fails this test.
   */
  const KNOWN_CLIENT_ONLY = ["no_added_terminal_dot"];

  it("has an edge-side entry for every built-in toggle", () => {
    const missing = BUILTIN_RULES.filter((r) => !EDGE_SOURCE.includes(`id: '${r.id}'`));
    expect(missing.map((r) => r.id)).toEqual(KNOWN_CLIENT_ONLY);
  });
});
